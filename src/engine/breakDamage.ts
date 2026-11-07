/**
 * Break and Super Break DMG (TASKS E4, docs/FORMULAS.md § Break DMG and
 * § Super Break DMG). They share the target-side multipliers with ordinary
 * hits but have their own base, cannot crit, and ignore ordinary DMG Boost.
 */
import { resolveHitStats } from './damage';
import {
  BREAK_ELEMENT_FACTOR,
  breakBaseDmg,
  breakEffectMultiplier,
  brokenMultiplier,
  defMultiplier,
  finalDmgMultiplier,
  mitigationMultiplier,
  resMultiplier,
  superBreakBaseDmg,
  superBreakToughness,
  targetDef,
  trueDmgMultiplier,
  vulnerabilityMultiplier,
  weakenMultiplier,
} from './formulas';
import { resolveUnitStats } from './stats';
import type { BreakDetails, BreakHitSpec, CombatState, DamageBreakdown, Element, ResolvedHitStats } from './types';

/** Inputs for one break hit, independent of CombatState. */
export interface BreakDamageInput {
  /** Break base before Break Effect (`breakBaseDmg` / `superBreakBaseDmg`). */
  breakBase: number;
  breakEffect: number;
  stats: ResolvedHitStats;
}

/**
 * Pure formula application for Break and Super Break DMG. The breakdown has
 * the same factors as an ordinary hit, so `baseDmg` is the break base × (1 +
 * Break Effect), with CRIT and DMG Boost fixed at 1.
 */
export function computeBreakBreakdown(input: BreakDamageInput): DamageBreakdown {
  const s = input.stats;
  const parts = {
    baseDmg: input.breakBase * breakEffectMultiplier(input.breakEffect),
    // Break DMG cannot crit, and ordinary DMG Boost does not apply (R1).
    critMultiplier: 1,
    dmgBoostMultiplier: 1,
    weakenMultiplier: weakenMultiplier(s.weaken),
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
  };
  const total =
    parts.baseDmg *
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

  // Break hits carry no damage tags, so tag-conditioned modifiers never apply.
  const ctx = { element, tags: [], counterpartId: hit.targetId };
  const resolved = resolveHitStats(state, attackerId, hit.targetId, element, { scaling: 'atk', tags: [] });
  // Not applied to break hits; zeroed so a breakdown display doesn't suggest otherwise.
  const stats: ResolvedHitStats = { ...resolved, dmgBoost: 0 };
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
    };
  } else {
    const toughness = superBreakToughness(
      hit.toughnessReduction,
      hit.breakEfficiency ?? 0,
      hit.fixedToughnessReduction ?? 0,
    );
    breakBase = superBreakBaseDmg(levelMultiplier, toughness, hit.multiplier);
    details = {
      kind: 'superBreak',
      levelMultiplier,
      toughness,
      multiplier: hit.multiplier,
      breakEffect,
      breakEffectMultiplier: breakEffectMultiplierValue,
    };
  }
  const breakdown = computeBreakBreakdown({ breakBase, breakEffect, stats });
  return { attackerId, element, stats, breakdown, details };
}
