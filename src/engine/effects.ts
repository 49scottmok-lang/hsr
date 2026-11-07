import type { CombatState, EffectDef, EffectInstance, TurnPhase, UnitRef } from './types';

/** Resolve a UnitRef to concrete unit IDs (in insertion order of state.units). */
export function resolveUnitRef(state: CombatState, ref: UnitRef): string[] {
  if (ref === 'allAllies') return Object.values(state.units).filter((u) => u.side === 'ally').map((u) => u.id);
  if (ref === 'allEnemies') return Object.values(state.units).filter((u) => u.side === 'enemy').map((u) => u.id);
  if (!state.units[ref]) throw new Error(`Unknown unit: ${ref}`);
  return [ref];
}

function resolveTickUnit(def: EffectDef, holderId: string, sourceId: string): string | undefined {
  const d = def.duration;
  if (!d) return undefined;
  if (d.tickUnit === 'holder') return holderId;
  if (d.tickUnit === 'source') return sourceId;
  return d.tickUnit.unitId;
}

/**
 * Apply an effect to one holder. Returns a new state.
 *
 * Re-application rule (ASSUMPTION, docs/KNOWN_LIMITATIONS.md): if an instance
 * with the same def.id already exists on the holder, it is replaced by the new
 * definition, stacks are added (capped at maxStacks), and duration is reset.
 */
export function applyEffect(
  state: CombatState,
  def: EffectDef,
  holderId: string,
  sourceId: string,
  stacks = 1,
): CombatState {
  if (!state.units[holderId]) throw new Error(`Unknown holder: ${holderId}`);
  const maxStacks = def.maxStacks ?? 1;
  const existing = state.effects.find((e) => e.holderId === holderId && e.def.id === def.id);
  const tickUnitId = resolveTickUnit(def, holderId, sourceId);
  const skipNextTick =
    def.duration !== undefined &&
    def.duration.tickPhase === 'turnEnd' &&
    !def.duration.tickOnApplyTurn &&
    state.activeTurnUnitId !== undefined &&
    state.activeTurnUnitId === tickUnitId;

  const instance: EffectInstance = {
    def,
    holderId,
    sourceId,
    stacks: Math.min(maxStacks, (existing?.stacks ?? 0) + stacks),
    remainingTurns: def.duration?.turns,
    tickUnitId,
    skipNextTick,
  };
  const effects = existing
    ? state.effects.map((e) => (e === existing ? instance : e))
    : [...state.effects, instance];
  return { ...state, effects };
}

export function removeEffect(state: CombatState, effectId: string, holderId: string): CombatState {
  return { ...state, effects: state.effects.filter((e) => !(e.holderId === holderId && e.def.id === effectId)) };
}

/**
 * Decrement durations of every effect ticked by `unitId` at `phase`.
 * Returns the new state and `${holderId}:${effectId}` keys of expired effects.
 */
export function tickEffects(
  state: CombatState,
  unitId: string,
  phase: TurnPhase,
): { state: CombatState; expired: string[] } {
  const expired: string[] = [];
  const effects: EffectInstance[] = [];
  for (const e of state.effects) {
    const d = e.def.duration;
    if (!d || e.tickUnitId !== unitId || d.tickPhase !== phase || e.remainingTurns === undefined) {
      effects.push(e);
      continue;
    }
    if (e.skipNextTick) {
      effects.push({ ...e, skipNextTick: false });
      continue;
    }
    const remaining = e.remainingTurns - 1;
    if (remaining <= 0) {
      expired.push(`${e.holderId}:${e.def.id}`);
    } else {
      effects.push({ ...e, remainingTurns: remaining });
    }
  }
  return { state: { ...state, effects }, expired };
}
