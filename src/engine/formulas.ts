/**
 * Pure formula functions. Each corresponds 1:1 to a section in docs/FORMULAS.md.
 * No state, no defaults hidden here beyond the documented constants.
 */

/** §Base CRIT: every character's base CRIT Rate / CRIT DMG. */
export const DEFAULT_BASE_CRIT_RATE = 0.05;
export const DEFAULT_BASE_CRIT_DMG = 0.5;

/** §Toughness: DMG multiplier while the target's toughness is NOT broken. */
export const UNBROKEN_MULTIPLIER = 0.9;

/** §RES clamp bounds for the RES multiplier. */
export const RES_MULTIPLIER_MIN = 0.1;
export const RES_MULTIPLIER_MAX = 2.0;

/** §DEF: community-documented enemy base DEF. */
export function enemyBaseDef(level: number): number {
  return 200 + 10 * level;
}

/** §Stats: final = base × (1 + pct) + flat. */
export function finalStat(base: number, pct: number, flat: number): number {
  return base * (1 + pct) + flat;
}

/** §Base DMG */
export function baseDmg(
  multiplier: number,
  extraMultiplier: number,
  scalingValue: number,
  flatDmg: number,
): number {
  return (multiplier + extraMultiplier) * scalingValue + flatDmg;
}

/** §CRIT */
export function critMultiplier(
  mode: 'expected' | 'crit' | 'nonCrit',
  canCrit: boolean,
  critRate: number,
  critDmg: number,
): number {
  if (!canCrit || mode === 'nonCrit') return 1;
  if (mode === 'crit') return 1 + critDmg;
  const rate = Math.min(1, Math.max(0, critRate));
  return 1 + rate * critDmg;
}

/** §DMG Boost */
export function dmgBoostMultiplier(dmgBoost: number): number {
  return 1 + dmgBoost;
}

/** §Weaken. Clamped at 0 as an engine safeguard (no negative damage). */
export function weakenMultiplier(weaken: number): number {
  return Math.max(0, 1 - weaken);
}

/**
 * §DEF
 * targetDef = baseDef × max(0, 1 + defPct − defReduction − defIgnore) + defFlat, floored at 0
 * multiplier = 1 − targetDef / (targetDef + 200 + 10 × attackerLevel)
 */
export function targetDef(
  baseDef: number,
  defPct: number,
  defFlat: number,
  defReduction: number,
  defIgnore: number,
): number {
  const pctFactor = Math.max(0, 1 + defPct - defReduction - defIgnore);
  return Math.max(0, baseDef * pctFactor + defFlat);
}

export function defMultiplier(def: number, attackerLevel: number): number {
  const k = 200 + 10 * attackerLevel;
  return 1 - def / (def + k);
}

/** §RES: 1 − (RES − RES PEN − RES reduction), clamped to [0.1, 2.0]. */
export function resMultiplier(baseRes: number, resPen: number, resReduction: number): number {
  const raw = 1 - (baseRes - resPen - resReduction);
  return Math.min(RES_MULTIPLIER_MAX, Math.max(RES_MULTIPLIER_MIN, raw));
}

/** §Vulnerability. No cap applied (UNVERIFIED whether the game caps it). */
export function vulnerabilityMultiplier(vulnerability: number): number {
  return 1 + vulnerability;
}

/** §Mitigation: each instance multiplies separately. */
export function mitigationMultiplier(mitigations: readonly number[]): number {
  return mitigations.reduce((acc, m) => acc * (1 - m), 1);
}

/** §Toughness */
export function brokenMultiplier(broken: boolean): number {
  return broken ? 1 : UNBROKEN_MULTIPLIER;
}

/** §Action Value: AV = 10000 / SPD. Utility only; the rotation engine is manual. */
export function actionValue(spd: number): number {
  if (spd <= 0) throw new RangeError('SPD must be positive');
  return 10000 / spd;
}
