/**
 * Break and Super Break DMG (TASKS E4, docs/FORMULAS.md § Break DMG and
 * § Super Break DMG). They share the target-side multipliers with ordinary
 * hits but have their own base, cannot crit, ignore Weaken, and take only DMG
 * Boost that explicitly names their tag. Super Break DMG also counts as Break
 * DMG (E11, S3): `break` modifiers reach it, and its Break DMG Increase and
 * Super Break DMG Increase are separate factors that multiply.
 */
import { resolveHitStats } from './damage';
import {
  BREAK_ELEMENT_FACTOR,
  breakBaseDmg,
  breakEffectMultiplier,
  brokenMultiplier,
  defMultiplier,
  dmgBoostMultiplier,
  finalDmgMultiplier,
  mitigationMultiplier,
  resMultiplier,
  superBreakBaseDmg,
  superBreakToughness,
  targetDef,
  trueDmgMultiplier,
  vulnerabilityMultiplier,
} from './formulas';
import { namesTag, resolveUnitStats, sumStat, type HitContext } from './stats';
import type {
  BreakDetails,
  BreakHitSpec,
  CombatState,
  DamageBreakdown,
  DamageTag,
  Element,
  ResolvedHitStats,
} from './types';

/** Inputs for one break hit, independent of CombatState. */
export interface BreakDamageInput {
  /** Break base before Break Effect (`breakBaseDmg` / `superBreakBaseDmg`). */
  breakBase: number;
  breakEffect: number;
  /** `stats.dmgBoost` is the Break DMG Increase (modifiers naming `break`). */
  stats: ResolvedHitStats;
  /** Super Break only: Super Break DMG Increase, a separate factor (E11). Default 0. */
  superBreakDmgIncrease?: number;
}

/**
 * Pure formula application for Break and Super Break DMG. The breakdown has
 * the same factors as an ordinary hit, so `baseDmg` is the break base × (1 +
 * Break Effect), CRIT and Weaken are fixed at 1, and `dmgBoostMultiplier` is
 * (1 + Break DMG Increase) × (1 + Super Break DMG Increase).
 */
export function computeBreakBreakdown(input: BreakDamageInput): DamageBreakdown {
  const s = input.stats;
  const parts = {
    baseDmg: input.breakBase * breakEffectMultiplier(input.breakEffect),
    // Break DMG cannot crit (R1, S3). S3: (1 + Break DMG Increase) × (1 + Super Break DMG Increase).
    critMultiplier: 1,
    dmgBoostMultiplier: dmgBoostMultiplier(s.dmgBoost) * dmgBoostMultiplier(input.superBreakDmgIncrease ?? 0),
    // S3 (Weaken, Weakness Break): Break-related DMG is not affected by Weaken.
    // `stats.weaken` still shows the attacker's Weaken for display.
    weakenMultiplier: 1,
    defMultiplier: defMultiplier(
      targetDef(s.targetBaseDef, s.targetDefPct, s.targetDefFlat, s.targetDefReduction, s.defIgnore),
      s.attackerLevel,
    ),
    resMultiplier: resMultiplier(s.targetBaseRes, s.resPen, s.targetResReduction),
    vulnerabilityMultiplier: vulnerabilityMultiplier(s.vulnerability),
    mitigationMultiplier: mitigationMultiplier(s.mitigations),
    brokenMultiplier: brokenMultiplier(s.targetBroken),
    finalDmgMultiplier: finalDmgMultiplier(s.finalDmgBoosts),
    trueDmgMultiplier: trueDmgMultiplier(s.trueDmg),
    dotChanceMultiplier: 1,
  };
  const total =
    parts.baseDmg *
    parts.dmgBoostMultiplier *
    parts.weakenMultiplier *
    parts.defMultiplier *
    parts.resMultiplier *
    parts.vulnerabilityMultiplier *
    parts.mitigationMultiplier *
    parts.brokenMultiplier *
    parts.finalDmgMultiplier *
    parts.trueDmgMultiplier;
  return { ...parts, total };
}

export interface CalculatedBreakHit {
  attackerId: string;
  element: Element;
  /** `[hit.kind]`: `break` or `superBreak`. Super Break still matches `break` modifiers (E11). */
  tags: readonly DamageTag[];
  stats: ResolvedHitStats;
  breakdown: DamageBreakdown;
  details: BreakDetails;
}

/** Calculate one Break or Super Break hit against the current state. Does not mutate state. */
export function calculateBreakHit(state: CombatState, hit: BreakHitSpec, defaultAttackerId: string): CalculatedBreakHit {
  const attackerId = hit.attackerId ?? defaultAttackerId;
  const build = state.units[attackerId]?.build;
  if (!build) throw new Error(`Attacker ${attackerId} must be an ally with a build`);
  const levelMultiplier = build.breakLevelMultiplier;
  if (levelMultiplier === undefined) throw new Error(`Attacker ${attackerId} has no breakLevelMultiplier`);
  const element = hit.element ?? build.element;

  // A break hit reports one tag, its kind. For matching modifiers, Super Break
  // also counts as Break DMG (E11, S3 Weakness Break), so `break` modifiers
  // (Break DMG Increase, Break DMG vulnerability, …) reach it too.
  const tags: readonly DamageTag[] = [hit.kind];
  const matchTags: readonly DamageTag[] = hit.kind === 'superBreak' ? ['superBreak', 'break'] : ['break'];
  const ctx: HitContext = { element, tags: matchTags, counterpartId: hit.targetId };
  const resolved = resolveHitStats(state, attackerId, hit.targetId, element, { scaling: 'atk', tags: matchTags });
  // Ordinary DMG Boost does not apply (S3: Break DMG is not affected by DMG Boost);
  // only modifiers that name the tag count. One naming both counts once, as Break DMG Increase.
  const breakDmgIncrease = sumStat(state, attackerId, 'dmgBoost', ctx, namesTag(['break']));
  const superBreakDmgIncrease = hit.kind === 'superBreak'
    ? sumStat(state, attackerId, 'dmgBoost', ctx, (c) => namesTag(['superBreak'])(c) && !namesTag(['break'])(c))
    : 0;
  const stats: ResolvedHitStats = { ...resolved, dmgBoost: breakDmgIncrease };
  const breakEffect = resolveUnitStats(state, attackerId, ctx).breakEffect;

  const breakEffectMultiplierValue = breakEffectMultiplier(breakEffect);
  let breakBase: number;
  let details: BreakDetails;
  if (hit.kind === 'break') {
    const maxToughness = state.units[hit.targetId]?.enemy?.maxToughness;
    if (maxToughness === undefined) throw new Error(`Target ${hit.targetId} has no maxToughness`);
    const elementFactor = BREAK_ELEMENT_FACTOR[element];
    const multiplier = hit.multiplier ?? 1;
    breakBase = breakBaseDmg(levelMultiplier, elementFactor, maxToughness, multiplier);
    details = {
      kind: 'break',
      levelMultiplier,
      elementFactor,
      maxToughness,
      multiplier,
      breakEffect,
      breakEffectMultiplier: breakEffectMultiplierValue,
      breakDmgIncrease,
    };
  } else {
    // The step's own values plus the attacker's buff stats (sources add, as in R1).
    const breakEfficiency = (hit.breakEfficiency ?? 0) + sumStat(state, attackerId, 'breakEfficiency', ctx);
    const multiplier = hit.multiplier + sumStat(state, attackerId, 'superBreakDmg', ctx);
    const toughness = superBreakToughness(hit.toughnessReduction, breakEfficiency, hit.fixedToughnessReduction ?? 0);
    breakBase = superBreakBaseDmg(levelMultiplier, toughness, multiplier);
    details = {
      kind: 'superBreak',
      levelMultiplier,
      toughness,
      breakEfficiency,
      multiplier,
      breakEffect,
      breakEffectMultiplier: breakEffectMultiplierValue,
      breakDmgIncrease,
      superBreakDmgIncrease,
    };
  }
  const breakdown = computeBreakBreakdown({ breakBase, breakEffect, stats, superBreakDmgIncrease });
  return { attackerId, element, tags, stats, breakdown, details };
}
