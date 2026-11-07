import { calculateBreakHit } from './breakDamage';
import { calculateHit } from './damage';
import { applyEffect, meetsRequirement, removeEffect, resolveUnitRef, tickEffects } from './effects';
import type {
  ActionStep,
  CharacterBuild,
  CombatState,
  CritMode,
  DamageTag,
  EffectDef,
  EnemyConfig,
  EventLogEntry,
  HitResult,
  RotationEvent,
  RotationInput,
  RotationResult,
  UnitState,
} from './types';
import { EngineValidationError, validateRotationInput } from './validate';

/**
 * Unit records have no prototype, so no unit ID (e.g. `__proto__`, `toString`)
 * can hit an inherited property. Validation still rejects reserved IDs; this
 * guards direct callers of `createInitialState`.
 */
function unitRecord(): Record<string, UnitState> {
  return Object.create(null) as Record<string, UnitState>;
}

/** Build the initial CombatState: units plus all always-on effects (LC, relic sets, passives). */
export function createInitialState(team: readonly CharacterBuild[], enemies: readonly EnemyConfig[]): CombatState {
  const units = unitRecord();
  for (const b of team) units[b.id] = { id: b.id, side: 'ally', level: b.level, build: b, broken: false };
  for (const e of enemies) {
    units[e.id] = { id: e.id, side: 'enemy', level: e.level, enemy: e, broken: e.broken ?? false };
  }
  let state: CombatState = { units, effects: [] };
  const permanent = (holderId: string, defs: readonly EffectDef[] | undefined) => {
    for (const def of defs ?? []) {
      if (meetsRequirement(state, holderId, def.requires)) state = applyEffect(state, def, holderId, holderId);
    }
  };
  for (const b of team) {
    permanent(b.id, b.lightCone?.effects);
    permanent(b.id, b.relics?.setEffects);
    permanent(b.id, b.passiveEffects);
  }
  for (const e of enemies) permanent(e.id, e.passiveEffects);
  return state;
}

interface StepOutcome {
  state: CombatState;
  hits: HitResult[];
  skippedSteps: number[];
}

/** The unit whose build a step's `requires` is checked against. */
function stepSourceId(step: ActionStep, actorId: string): string {
  if (step.op === 'hit' || step.op === 'break') return step.hit.attackerId ?? actorId;
  if (step.op === 'apply') return step.sourceId ?? actorId;
  return actorId;
}

function runSteps(
  state: CombatState,
  event: RotationEvent,
  steps: readonly ActionStep[],
  critMode: CritMode,
): StepOutcome {
  const hits: HitResult[] = [];
  const skippedSteps: number[] = [];
  let hitIndex = 0;
  for (const [stepIndex, step] of steps.entries()) {
    const sourceId = stepSourceId(step, event.actorId);
    const effectGate = step.op === 'apply' ? step.effect.requires : undefined;
    if (!meetsRequirement(state, sourceId, step.requires) || !meetsRequirement(state, sourceId, effectGate)) {
      skippedSteps.push(stepIndex);
      continue;
    }
    switch (step.op) {
      case 'apply':
        for (const id of resolveUnitRef(state, step.to)) {
          state = applyEffect(state, step.effect, id, sourceId, step.stacks ?? 1);
        }
        break;
      case 'remove':
        for (const id of resolveUnitRef(state, step.from)) state = removeEffect(state, step.effectId, id);
        break;
      case 'setBroken': {
        const u = state.units[step.enemyId]!;
        state = { ...state, units: Object.assign(unitRecord(), state.units, { [u.id]: { ...u, broken: step.broken } }) };
        break;
      }
      case 'hit': {
        const c = calculateHit(state, step.hit, event.actorId, critMode);
        hits.push({
          eventId: event.id,
          hitIndex: hitIndex++,
          label: step.hit.label,
          attackerId: c.attackerId,
          targetId: step.hit.targetId,
          element: c.element,
          tags: step.hit.tags,
          critMode,
          canCrit: c.canCrit,
          stats: c.stats,
          breakdown: c.breakdown,
          damage: c.breakdown.total,
        });
        break;
      }
      case 'break': {
        const c = calculateBreakHit(state, step.hit, event.actorId);
        hits.push({
          eventId: event.id,
          hitIndex: hitIndex++,
          label: step.hit.label,
          attackerId: c.attackerId,
          targetId: step.hit.targetId,
          element: c.element,
          tags: [],
          critMode,
          canCrit: false,
          stats: c.stats,
          breakdown: c.breakdown,
          damage: c.breakdown.total,
          break: c.details,
        });
        break;
      }
    }
  }
  return { state, hits, skippedSteps };
}

/**
 * Run a manual rotation. Events execute strictly in the given order.
 * Throws EngineValidationError on invalid input.
 */
export function runRotation(input: RotationInput): RotationResult {
  const issues = validateRotationInput(input);
  if (issues.length > 0) throw new EngineValidationError(issues);

  const critMode = input.critMode ?? 'expected';
  let state = createInitialState(input.team, input.enemies);
  const hits: HitResult[] = [];
  const log: EventLogEntry[] = [];

  for (const event of input.events) {
    const expired: string[] = [];
    if (event.kind === 'turn') {
      state = { ...state, activeTurnUnitId: event.actorId };
      const t = tickEffects(state, event.actorId, 'turnStart');
      state = t.state;
      expired.push(...t.expired);
    }
    const out = runSteps(state, event, event.steps, critMode);
    state = out.state;
    hits.push(...out.hits);
    if (event.kind === 'turn') {
      const t = tickEffects(state, event.actorId, 'turnEnd');
      state = { ...t.state, activeTurnUnitId: undefined };
      expired.push(...t.expired);
    }
    log.push({
      eventId: event.id,
      kind: event.kind,
      actorId: event.actorId,
      label: event.label,
      damage: out.hits.reduce((a, h) => a + h.damage, 0),
      expired,
      skippedSteps: out.skippedSteps,
    });
  }

  const totalDamage = hits.reduce((a, h) => a + h.damage, 0);
  const damageByAttacker: Record<string, number> = {};
  const damageByTag: Partial<Record<DamageTag, number>> = {};
  for (const h of hits) {
    damageByAttacker[h.attackerId] = (damageByAttacker[h.attackerId] ?? 0) + h.damage;
    // A multi-tag hit is counted under each of its tags; tag totals may exceed totalDamage.
    for (const t of h.tags) damageByTag[t] = (damageByTag[t] ?? 0) + h.damage;
  }
  return {
    hits,
    log,
    totalDamage,
    damageByAttacker,
    damageByTag,
    cycles: input.cycles,
    damagePerCycle: input.cycles ? totalDamage / input.cycles : undefined,
    finalState: state,
  };
}
