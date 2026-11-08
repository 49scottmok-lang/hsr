/**
 * Auto battle (D7): plays a team's kits over the SPD turn order and writes the
 * rotation, which `runRotation` then scores like a hand-written one.
 *
 * Every kit number is user input; the simulator only applies the turn order,
 * Energy and skill point rules (docs/FORMULAS.md § Auto battle). Actions do not
 * advance or delay turns here, so the turn order is the SPD order from
 * `suggestTurnOrder`.
 */
import type {
  ActionStep,
  AutoAction,
  AutoBattleAction,
  AutoBattleInput,
  AutoBattleResult,
  AutoKit,
  RotationEvent,
} from './types';
import { createInitialState } from './rotation';
import { resolveUnitStats } from './stats';
import { cycleOf, suggestTurnOrder, validateTimelineInput } from './timeline';
import { EngineValidationError, validateRotationInput } from './validate';

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonNegInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

/** §Auto battle: Energy from an action, scaled by Energy Regeneration Rate. */
export function energyGain(energy: number, energyRegenRate: number): number {
  return energy * (1 + energyRegenRate);
}

function actionsOf(kit: AutoKit): [string, AutoAction][] {
  return [
    ['basic', kit.basic],
    ...(kit.skill ? [['skill', kit.skill] as [string, AutoAction]] : []),
    ...(kit.ultimate ? [['ultimate', kit.ultimate] as [string, AutoAction]] : []),
  ];
}

/** All issues in an auto-battle input, as English strings (same style as `validateRotationInput`). */
export function validateAutoBattleInput(input: AutoBattleInput): string[] {
  const out: string[] = [];
  const teamIds = new Set(input.team.map((c) => c.id));
  const { start, max } = input.skillPoints;
  if (!Number.isInteger(max) || max < 1) out.push('skillPoints.max: must be an integer >= 1');
  if (!isNonNegInt(start) || (Number.isInteger(max) && start > max)) {
    out.push('skillPoints.start: must be an integer from 0 to skillPoints.max');
  }
  // With no kit every turn is empty and the rotation it writes deals no damage.
  if (input.kits.length === 0) out.push('kits: at least one kit is required');
  for (const [i, e] of input.enemies.entries()) {
    if (e.spd === undefined) out.push(`enemies[${i}].spd: is required for the auto battle`);
  }

  const seen = new Set<string>();
  // Kit steps are checked by the rotation validator, one probe event per action.
  const probes: RotationEvent[] = [];
  const probePaths: string[] = [];
  for (const [i, kit] of input.kits.entries()) {
    const path = `kits[${i}]`;
    if (!teamIds.has(kit.unitId)) out.push(`${path}: unit "${kit.unitId}" is not a team member`);
    else if (seen.has(kit.unitId)) out.push(`${path}: duplicate kit for "${kit.unitId}"`);
    seen.add(kit.unitId);
    if (!isFiniteNum(kit.startEnergy) || kit.startEnergy < 0) out.push(`${path}.startEnergy: must be a finite number >= 0`);
    if (kit.skillPointReserve !== undefined && !isNonNegInt(kit.skillPointReserve)) {
      out.push(`${path}.skillPointReserve: must be an integer >= 0`);
    }
    if (!isNonNegInt(kit.basic.skillPoints)) out.push(`${path}.basic.skillPoints: must be an integer >= 0`);
    if (kit.skill && !isNonNegInt(kit.skill.skillPoints)) out.push(`${path}.skill.skillPoints: must be an integer >= 0`);
    if (kit.ultimate && !(isFiniteNum(kit.ultimate.energyCost) && kit.ultimate.energyCost > 0)) {
      out.push(`${path}.ultimate.energyCost: must be a finite number > 0`);
    }
    for (const [name, action] of actionsOf(kit)) {
      if (!isFiniteNum(action.energy) || action.energy < 0) out.push(`${path}.${name}.energy: must be a finite number >= 0`);
      probes.push({ kind: 'turn', id: `probe-${probes.length}`, actorId: kit.unitId, steps: action.steps });
      probePaths.push(`${path}.${name}`);
    }
  }
  for (const issue of validateRotationInput({ team: input.team, enemies: input.enemies, events: probes })) {
    // Re-address event issues to the kit action; unit issues keep their path.
    const m = /^events\[(\d+)\](.*)$/s.exec(issue);
    out.push(m ? `${probePaths[Number(m[1])]}${m[2]}` : issue);
  }
  return [...new Set(out)];
}

/**
 * Simulate the battle and return the generated rotation. Pure; throws
 * EngineValidationError on invalid input.
 */
export function simulateBattle(input: AutoBattleInput): AutoBattleResult {
  const issues = validateAutoBattleInput(input);
  const state = createInitialState(input.team, input.enemies);
  const timeline = {
    units: [
      ...input.team.map((c) => ({ id: c.id, side: 'ally' as const, spd: resolveUnitStats(state, c.id).spd })),
      ...input.enemies.map((e) => ({ id: e.id, side: 'enemy' as const, spd: e.spd ?? NaN })),
    ],
    avLimit: input.avLimit,
    ...(input.cycleAv ? { cycleAv: input.cycleAv } : {}),
  };
  // Enemy SPD issues are reported above with an enemy path; keep the rest.
  issues.push(...validateTimelineInput(timeline).filter((i) => !/^units\[\d+\]: spd /.test(i)));
  if (issues.length > 0) throw new EngineValidationError(issues);

  const order = suggestTurnOrder(timeline);
  const kits = new Map(input.kits.map((k) => [k.unitId, k]));
  const err = new Map(input.kits.map((k) => [k.unitId, resolveUnitStats(state, k.unitId).energyRegenRate]));
  // §Auto battle: Energy is capped at the Ultimate's cost.
  const cap = (k: AutoKit, e: number) => (k.ultimate ? Math.min(e, k.ultimate.energyCost) : e);
  const energy = new Map(input.kits.map((k) => [k.unitId, cap(k, k.startEnergy)]));
  let sp = input.skillPoints.start;

  const events: RotationEvent[] = [];
  const actions: AutoBattleAction[] = [];
  const emit = (
    kind: RotationEvent['kind'],
    unitId: string,
    action: AutoBattleAction['action'],
    av: number,
    cycle: number | undefined,
    steps: readonly ActionStep[],
    label: string | undefined,
  ) => {
    const eventId = `auto-${events.length + 1}`;
    events.push({ kind, id: eventId, actorId: unitId, steps, ...(label ? { label } : {}) });
    const e = energy.get(unitId);
    actions.push({
      eventId, unitId, action, av, skillPoints: sp,
      ...(cycle !== undefined ? { cycle } : {}),
      ...(e !== undefined ? { energy: e } : {}),
    });
  };

  // After any turn (and at battle start), every ally whose Energy is full casts
  // the Ultimate, in team order. Each ally casts at most once per window, so a
  // kit whose Ultimate refunds a full bar cannot loop forever.
  const ultimates = (av: number, cycle: number | undefined) => {
    const cast = new Set<string>();
    for (let again = true; again;) {
      again = false;
      for (const c of input.team) {
        const k = kits.get(c.id);
        const ult = k?.ultimate;
        if (!k || !ult || !k.useUltimate || cast.has(c.id) || energy.get(c.id)! < ult.energyCost) continue;
        energy.set(c.id, cap(k, energyGain(ult.energy, err.get(c.id)!)));
        emit('extra', c.id, 'ultimate', av, cycle, ult.steps, ult.label);
        cast.add(c.id);
        again = true;
      }
    }
  };

  ultimates(0, input.cycleAv ? 1 : undefined);
  for (const turn of order.turns) {
    const k = kits.get(turn.unitId);
    if (!k) {
      const isEnemy = input.enemies.some((e) => e.id === turn.unitId);
      emit('turn', turn.unitId, isEnemy ? 'enemyTurn' : 'idle', turn.av, turn.cycle, [], undefined);
    } else {
      const skill = k.skill;
      const reserve = k.skillPointReserve ?? 0;
      const useSkill = k.useSkill && skill !== undefined && sp - skill.skillPoints >= reserve;
      const action = useSkill ? skill : k.basic;
      sp = useSkill ? sp - skill.skillPoints : Math.min(input.skillPoints.max, sp + k.basic.skillPoints);
      energy.set(k.unitId, cap(k, energy.get(k.unitId)! + energyGain(action.energy, err.get(k.unitId)!)));
      emit('turn', k.unitId, useSkill ? 'skill' : 'basic', turn.av, turn.cycle, action.steps, action.label);
    }
    ultimates(turn.av, turn.cycle);
  }

  return {
    events,
    actions,
    truncated: order.truncated,
    ...(input.cycleAv ? { cycles: cycleOf(input.avLimit, input.cycleAv) } : {}),
  };
}
