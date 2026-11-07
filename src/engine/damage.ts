import {
  baseDmg,
  brokenMultiplier,
  critMultiplier,
  defMultiplier,
  dmgBoostMultiplier,
  dotApplicationChance,
  finalDmgMultiplier,
  mitigationMultiplier,
  resMultiplier,
  targetDef,
  trueDmgMultiplier,
  vulnerabilityMultiplier,
  weakenMultiplier,
} from './formulas';
import { collectStat, resolveUnitStats, sumStat, unitBaseStats, type HitContext } from './stats';
import type {
  CombatState,
  CritMode,
  DamageBreakdown,
  DamageTag,
  Element,
  HitSpec,
  ResolvedHitStats,
} from './types';

/** Inputs for a single hit, independent of CombatState. Used by "single hit" calculators. */
export interface DamageInput {
  multiplier: number;
  extraMultiplier?: number;
  flatDmg?: number;
  canCrit: boolean;
  critMode: CritMode;
  /** DoT base chance (E8). Absent: no application-chance weighting. */
  baseChance?: number;
  stats: ResolvedHitStats;
}

/** Pure formula application: docs/FORMULAS.md §Outgoing DMG. */
export function computeBreakdown(input: DamageInput): DamageBreakdown {
  const s = input.stats;
  const parts = {
    baseDmg: baseDmg(input.multiplier, input.extraMultiplier ?? 0, s.scalingValue, input.flatDmg ?? 0),
    critMultiplier: critMultiplier(input.critMode, input.canCrit, s.critRate, s.critDmg),
    dmgBoostMultiplier: dmgBoostMultiplier(s.dmgBoost),
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
    dotChanceMultiplier:
      input.baseChance === undefined
        ? 1
        : dotApplicationChance(input.baseChance, s.effectHitRate, s.targetEffectRes, s.effectResPen),
  };
  const total =
    parts.baseDmg *
    parts.critMultiplier *
    parts.dmgBoostMultiplier *
    parts.weakenMultiplier *
    parts.defMultiplier *
    parts.resMultiplier *
    parts.vulnerabilityMultiplier *
    parts.mitigationMultiplier *
    parts.brokenMultiplier *
    parts.finalDmgMultiplier *
    parts.trueDmgMultiplier *
    parts.dotChanceMultiplier;
  return { ...parts, total };
}

export function defaultCanCrit(tags: readonly DamageTag[]): boolean {
  return !tags.includes('dot');
}

/** Resolve every stat a hit needs from the current combat state. */
export function resolveHitStats(
  state: CombatState,
  attackerId: string,
  targetId: string,
  element: Element,
  hit: Pick<HitSpec, 'scaling' | 'tags'>,
): ResolvedHitStats {
  const attacker = state.units[attackerId];
  const target = state.units[targetId];
  if (!attacker) throw new Error(`Unknown attacker: ${attackerId}`);
  if (!target) throw new Error(`Unknown target: ${targetId}`);

  const aCtx: HitContext = { element, tags: hit.tags, counterpartId: targetId };
  const tCtx: HitContext = { element, tags: hit.tags, counterpartId: attackerId };
  const a = resolveUnitStats(state, attackerId, aCtx);

  return {
    scalingValue: a[hit.scaling],
    critRate: a.critRate,
    critDmg: a.critDmg,
    dmgBoost: a.dmgBoost,
    weaken: sumStat(state, attackerId, 'weaken', aCtx),
    finalDmgBoosts: collectStat(state, attackerId, 'finalDmgBoost', aCtx),
    trueDmg: sumStat(state, attackerId, 'trueDmg', aCtx),
    defIgnore: sumStat(state, attackerId, 'defIgnore', aCtx),
    resPen: sumStat(state, attackerId, 'resPen', aCtx),
    targetBaseDef: unitBaseStats(target).def,
    targetDefPct: sumStat(state, targetId, 'defPct', tCtx),
    targetDefFlat: sumStat(state, targetId, 'defFlat', tCtx),
    targetDefReduction: sumStat(state, targetId, 'defReduction', tCtx),
    targetBaseRes: target.enemy?.res[element] ?? 0,
    targetResReduction: sumStat(state, targetId, 'resReduction', tCtx),
    vulnerability: sumStat(state, targetId, 'vulnerability', tCtx),
    mitigations: collectStat(state, targetId, 'dmgMitigation', tCtx),
    attackerLevel: attacker.level,
    targetBroken: target.broken,
    effectHitRate: a.effectHitRate,
    effectResPen: sumStat(state, attackerId, 'effectResPen', aCtx),
    targetEffectRes: (target.enemy?.effectRes ?? 0) + sumStat(state, targetId, 'effectRes', tCtx),
  };
}

export interface CalculatedHit {
  attackerId: string;
  element: Element;
  canCrit: boolean;
  stats: ResolvedHitStats;
  breakdown: DamageBreakdown;
}

/** Calculate one hit against the current state. Does not mutate state. */
export function calculateHit(
  state: CombatState,
  hit: HitSpec,
  defaultAttackerId: string,
  critMode: CritMode,
): CalculatedHit {
  const attackerId = hit.attackerId ?? defaultAttackerId;
  const attacker = state.units[attackerId];
  if (!attacker?.build) throw new Error(`Attacker ${attackerId} must be an ally with a build`);
  const element = hit.element ?? attacker.build.element;
  const canCrit = hit.canCrit ?? defaultCanCrit(hit.tags);
  const stats = resolveHitStats(state, attackerId, hit.targetId, element, hit);
  const breakdown = computeBreakdown({
    multiplier: hit.multiplier,
    extraMultiplier: hit.extraMultiplier,
    flatDmg: hit.flatDmg,
    canCrit,
    critMode,
    baseChance: hit.baseChance,
    stats,
  });
  return { attackerId, element, canCrit, stats, breakdown };
}
