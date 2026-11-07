/**
 * Public API of the calculation engine. The UI must import ONLY from
 * 'src/engine' (this file), never from internal modules.
 */
export * from './types';
export * as formulas from './formulas';
export { computeBreakdown, calculateHit, resolveHitStats, defaultCanCrit } from './damage';
export type { DamageInput, CalculatedHit } from './damage';
export { resolveUnitStats, conditionMatches } from './stats';
export type { HitContext, ResolvedUnitStats } from './stats';
export { applyEffect, removeEffect, tickEffects, resolveUnitRef, meetsRequirement, unitEidolon } from './effects';
export { runRotation, createInitialState } from './rotation';
export { compareTeams } from './compare';
export { validateRotationInput, EngineValidationError } from './validate';
