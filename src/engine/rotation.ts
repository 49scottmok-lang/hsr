import { calculateHit } from './damage';
import { applyEffect, removeEffect, resolveUnitRef, tickEffects } from './effects';
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

/** Build the initial CombatState: units plus all always-on effects (LC, relic sets, passives). */
export function createInitialState(team: readonly CharacterBuild[], enemies: readonly EnemyConfig[]): CombatState {
  const units: Record<string, UnitState> = {};
  for (const b of team) units[b.id] = { id: b.id, side: 'ally', level: b.level, build: b, broken: false };
  for (const e of enemies) {
    units[e.id] = { id: e.id, side: 'enemy', level: e.level, enemy: e, broken: e.broken ?? false };
  }
  let state: CombatState = { units, effects: [] };
  const permanent = (holderId: string, defs: readonly EffectDef[] | undefined) => {
    for (const def of defs ?? []) state = applyEffect(state, def, holderId, holderId);
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
}

function runSteps(
  state: CombatState,
  event: RotationEvent,
  steps: readonly ActionStep[],
  critMode: CritMode,
): StepOutcome {
  const hits: HitResult[] = [];
  let hitIndex = 0;
  for (const step of steps) {
    switch (step.op) {
      case 'apply':
        for (const id of resolveUnitRef(state, step.to)) {
          state = applyEffect(state, step.effect, id, step.sourceId ?? event.actorId, step.stacks ?? 1);
        }
        break;
      case 'remove':
        for (const id of resolveUnitRef(state, step.from)) state = removeEffect(state, step.effectId, id);
        break;
      case 'setBroken': {
        const u = state.units[step.enemyId]!;
        state = { ...state, units: { ...state.units, [u.id]: { ...u, broken: step.broken } } };
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
    }
  }
  return { state, hits };
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
