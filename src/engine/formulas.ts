/**
 * Pure formula functions. Each corresponds 1:1 to a section in docs/FORMULAS.md.
 * No state, no defaults hidden here beyond the documented constants.
 */
import type { Element } from './types';

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

/** §Vulnerability clamp bounds on the summed vulnerability (cross-checked, docs/FORMULAS.md). */
export const VULNERABILITY_MIN = 0;
export const VULNERABILITY_MAX = 2.5;

/** §Vulnerability: 1 + clamp(Σ vulnerability, 0, 2.5). */
export function vulnerabilityMultiplier(vulnerability: number): number {
  return 1 + Math.min(VULNERABILITY_MAX, Math.max(VULNERABILITY_MIN, vulnerability));
}

/** §Final DMG: each source multiplies separately, Π(1 + v_i). */
export function finalDmgMultiplier(boosts: readonly number[]): number {
  return boosts.reduce((acc, v) => acc * (1 + v), 1);
}

/** §True DMG: 1 + Σ trueDmg. */
export function trueDmgMultiplier(trueDmg: number): number {
  return 1 + trueDmg;
}

/** §Mitigation: each instance multiplies separately. */
export function mitigationMultiplier(mitigations: readonly number[]): number {
  return mitigations.reduce((acc, m) => acc * (1 - m), 1);
}

/** §Toughness */
export function brokenMultiplier(broken: boolean): number {
  return broken ? 1 : UNBROKEN_MULTIPLIER;
}

/**
 * §Break DMG: element factor by the attacker's element. Cross-checked
 * against R1 (`ElementToBreakScaling`, calculateContext.ts@dd0c4af).
 */
export const BREAK_ELEMENT_FACTOR: Readonly<Record<Element, number>> = {
  physical: 2,
  fire: 2,
  ice: 1,
  lightning: 1,
  wind: 1.5,
  quantum: 0.5,
  imaginary: 0.5,
};

/** §Break DMG: 0.5 + MaxToughness / 40, with Toughness in displayed units. */
export function breakToughnessFactor(maxToughness: number): number {
  return 0.5 + maxToughness / 40;
}

/** §Break DMG: LevelMultiplier × ElementFactor × ToughnessFactor × Multiplier. */
export function breakBaseDmg(
  levelMultiplier: number,
  elementFactor: number,
  maxToughness: number,
  multiplier: number,
): number {
  return levelMultiplier * elementFactor * breakToughnessFactor(maxToughness) * multiplier;
}

/** §Super Break DMG: (1 + Weakness Break Efficiency) × reduction + fixed reduction. */
export function superBreakToughness(toughnessReduction: number, breakEfficiency: number, fixedToughnessReduction: number): number {
  return (1 + breakEfficiency) * toughnessReduction + fixedToughnessReduction;
}

/** §Super Break DMG: LevelMultiplier × Toughness / 10 × Multiplier, with Toughness in displayed units. */
export function superBreakBaseDmg(levelMultiplier: number, toughness: number, multiplier: number): number {
  return (levelMultiplier * toughness * multiplier) / 10;
}

/** §Break DMG / §Super Break DMG: 1 + Break Effect. */
export function breakEffectMultiplier(breakEffect: number): number {
  return 1 + breakEffect;
}

/**
 * §DoT application chance (E8):
 * clamp(baseChance × (1 + EHR) × (1 − effectRes + effectResPen), 0, 1).
 * Cross-checked against R1 `DotDamageFunction` (min(1, …)); the floor at 0 is an engine safeguard.
 */
export function dotApplicationChance(
  baseChance: number,
  effectHitRate: number,
  targetEffectRes: number,
  effectResPen: number,
): number {
  const raw = baseChance * (1 + effectHitRate) * (1 - targetEffectRes + effectResPen);
  return Math.min(1, Math.max(0, raw));
}

/** §Action Value: AV for a full gauge, 10000 / SPD. Used by the turn order helper (E6); `runRotation` stays manual. */
export function actionValue(spd: number): number {
  if (spd <= 0) throw new RangeError('SPD must be positive');
  return 10000 / spd;
}

/**
 * §Level scaling (base stats): a character's or light cone's base HP/ATK/DEF
 * at `level`, from its current ascension's `base` and per-level `add`.
 * Level 1 gives `base` itself, hence `level − 1`.
 */
export function promotedBaseStat(base: number, add: number, level: number): number {
  return base + add * (level - 1);
}

/**
 * §Level scaling (relic main stat): main stat value at relic `level`.
 * Relic levels start at +0 (not 1), so there is no `− 1`.
 */
export function relicMainStatValue(base: number, perLevel: number, level: number): number {
  return base + perLevel * level;
}
