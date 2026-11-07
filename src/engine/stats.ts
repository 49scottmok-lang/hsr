import {
  DEFAULT_BASE_CRIT_DMG,
  DEFAULT_BASE_CRIT_RATE,
  enemyBaseDef,
  finalStat,
  targetDef,
} from './formulas';
import type {
  CombatState,
  ConversionSource,
  DamageTag,
  EffectInstance,
  Element,
  ModifierCondition,
  StatConversion,
  StatKey,
  StatModifier,
  UnitState,
} from './types';

/** Context of a specific hit, used to evaluate conditional modifiers. */
export interface HitContext {
  element: Element;
  tags: readonly DamageTag[];
  /** The other party: the target when reading attacker stats, the attacker when reading target stats. */
  counterpartId: string;
}

/**
 * A conditional modifier applies only inside a matching hit context.
 * Without a context (e.g. a character sheet display), conditional modifiers
 * are excluded.
 */
export function conditionMatches(cond: ModifierCondition | undefined, ctx: HitContext | undefined): boolean {
  if (!cond) return true;
  const hasAny =
    cond.elements !== undefined || cond.damageTags !== undefined || cond.counterpartIds !== undefined;
  if (!hasAny) return true;
  if (!ctx) return false;
  if (cond.elements && !cond.elements.includes(ctx.element)) return false;
  if (cond.damageTags && !cond.damageTags.some((t) => ctx.tags.includes(t))) return false;
  if (cond.counterpartIds && !cond.counterpartIds.includes(ctx.counterpartId)) return false;
  return true;
}

function getUnit(state: CombatState, unitId: string): UnitState {
  const unit = state.units[unitId];
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);
  return unit;
}

/** Static (non-effect) modifiers carried by a unit's build: relic stats and traces. */
function staticModifiers(unit: UnitState): readonly StatModifier[] {
  const b = unit.build;
  if (!b) return [];
  return [...(b.relics?.stats ?? []), ...(b.traces ?? [])];
}

/** Optional filter on a modifier's or conversion's condition, applied after `conditionMatches`. */
export type ConditionFilter = (cond: ModifierCondition | undefined) => boolean;

/**
 * Only modifiers that explicitly name one of `tags` in their `damageTags`
 * condition. Break hits read DMG Boost this way: ordinary DMG Boost does not
 * apply to them, but a "Break DMG +X%" modifier (tagged `break`) does.
 */
export function namesTag(tags: readonly DamageTag[]): ConditionFilter {
  return (cond) => cond?.damageTags?.some((t) => tags.includes(t)) ?? false;
}

/** Plain modifier values (static and effect modifiers), with no conversions. */
function collectModifiers(
  state: CombatState,
  unit: UnitState,
  stat: StatKey,
  ctx: HitContext | undefined,
  filter: ConditionFilter | undefined,
): number[] {
  const ok = (cond: ModifierCondition | undefined) => conditionMatches(cond, ctx) && (!filter || filter(cond));
  const out: number[] = [];
  for (const m of staticModifiers(unit)) {
    if (m.stat === stat && ok(m.condition)) out.push(m.value);
  }
  for (const inst of state.effects) {
    if (inst.holderId !== unit.id) continue;
    for (const m of inst.def.modifiers) {
      if (m.stat === stat && ok(m.condition)) out.push(m.value * inst.stacks);
    }
  }
  return out;
}

/**
 * §Stat conversion (E7): one conversion's contribution,
 * min(cap, ratio × stacks × max(0, from − threshold)). The `from` stat is read
 * without conversions, so conversions never chain.
 */
function conversionValue(
  state: CombatState,
  inst: EffectInstance,
  conv: StatConversion,
  ctx: HitContext | undefined,
): number {
  const fromSource = conv.fromUnit === 'source';
  const from = fromSource
    ? unconvertedStat(state, inst.sourceId, conv.from, undefined)
    : unconvertedStat(state, inst.holderId, conv.from, ctx);
  const raw = conv.ratio * inst.stacks * Math.max(0, from - (conv.threshold ?? 0));
  return conv.cap === undefined ? raw : Math.min(conv.cap, raw);
}

/**
 * Every applicable value for `stat` on `unitId`, one entry per modifier or
 * conversion, with effect values multiplied by stack count. Conversion
 * entries come after modifier entries.
 */
export function collectStat(
  state: CombatState,
  unitId: string,
  stat: StatKey,
  ctx?: HitContext,
  filter?: ConditionFilter,
): number[] {
  const unit = getUnit(state, unitId);
  const out = collectModifiers(state, unit, stat, ctx, filter);
  for (const inst of state.effects) {
    if (inst.holderId !== unitId) continue;
    for (const conv of inst.def.conversions ?? []) {
      if (conv.to !== stat || !conditionMatches(conv.condition, ctx)) continue;
      if (filter && !filter(conv.condition)) continue;
      out.push(conversionValue(state, inst, conv, ctx));
    }
  }
  return out;
}

export function sumStat(
  state: CombatState,
  unitId: string,
  stat: StatKey,
  ctx?: HitContext,
  filter?: ConditionFilter,
): number {
  return collectStat(state, unitId, stat, ctx, filter).reduce((a, b) => a + b, 0);
}

export interface UnitBaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

/** Base stats before any percentage/flat modifiers (character + light cone). */
export function unitBaseStats(unit: UnitState): UnitBaseStats {
  if (unit.build) {
    const b = unit.build;
    const lc = b.lightCone?.base ?? { hp: 0, atk: 0, def: 0 };
    return { hp: b.base.hp + lc.hp, atk: b.base.atk + lc.atk, def: b.base.def + lc.def, spd: b.base.spd };
  }
  if (unit.enemy) {
    return { hp: 0, atk: 0, def: unit.enemy.baseDef ?? enemyBaseDef(unit.enemy.level), spd: 0 };
  }
  throw new Error(`Unit ${unit.id} has neither build nor enemy config`);
}

export interface ResolvedUnitStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: number;
  critDmg: number;
  dmgBoost: number;
  breakEffect: number;
  effectHitRate: number;
  effectRes: number;
  energyRegenRate: number;
}

/**
 * Final stats of a unit in the current state, including stat conversions.
 * Pass a HitContext to include conditional modifiers for that hit.
 */
export function resolveUnitStats(state: CombatState, unitId: string, ctx?: HitContext): ResolvedUnitStats {
  return unitStatsFrom(getUnit(state, unitId), (k) => sumStat(state, unitId, k, ctx));
}

/** One final stat with modifiers only, no conversions: the input of a conversion. */
function unconvertedStat(state: CombatState, unitId: string, stat: ConversionSource, ctx: HitContext | undefined): number {
  const unit = getUnit(state, unitId);
  const s = (k: StatKey) => collectModifiers(state, unit, k, ctx, undefined).reduce((a, b) => a + b, 0);
  return unitStatsFrom(unit, s)[stat];
}

function unitStatsFrom(unit: UnitState, s: (k: StatKey) => number): ResolvedUnitStats {
  const base = unitBaseStats(unit);
  const baseCritRate = unit.build ? (unit.build.baseCritRate ?? DEFAULT_BASE_CRIT_RATE) : 0;
  const baseCritDmg = unit.build ? (unit.build.baseCritDmg ?? DEFAULT_BASE_CRIT_DMG) : 0;
  return {
    hp: finalStat(base.hp, s('hpPct'), s('hpFlat')),
    atk: finalStat(base.atk, s('atkPct'), s('atkFlat')),
    // Same pool and floors as the target DEF formula, without DEF ignore.
    def: targetDef(base.def, s('defPct'), s('defFlat'), s('defReduction'), 0),
    spd: finalStat(base.spd, s('spdPct'), s('spdFlat')),
    critRate: baseCritRate + s('critRate'),
    critDmg: baseCritDmg + s('critDmg'),
    dmgBoost: s('dmgBoost'),
    breakEffect: s('breakEffect'),
    effectHitRate: s('effectHitRate'),
    effectRes: s('effectRes'),
    energyRegenRate: s('energyRegenRate'),
  };
}
