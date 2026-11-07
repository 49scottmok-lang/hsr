import {
  DEFAULT_BASE_CRIT_DMG,
  DEFAULT_BASE_CRIT_RATE,
  enemyBaseDef,
  finalStat,
  targetDef,
} from './formulas';
import type {
  CombatState,
  DamageTag,
  Element,
  ModifierCondition,
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

/**
 * Every applicable modifier value for `stat` on `unitId`, one entry per
 * modifier, with effect values multiplied by stack count.
 */
export function collectStat(
  state: CombatState,
  unitId: string,
  stat: StatKey,
  ctx?: HitContext,
): number[] {
  const unit = getUnit(state, unitId);
  const out: number[] = [];
  for (const m of staticModifiers(unit)) {
    if (m.stat === stat && conditionMatches(m.condition, ctx)) out.push(m.value);
  }
  for (const inst of state.effects) {
    if (inst.holderId !== unitId) continue;
    for (const m of inst.def.modifiers) {
      if (m.stat === stat && conditionMatches(m.condition, ctx)) out.push(m.value * inst.stacks);
    }
  }
  return out;
}

export function sumStat(state: CombatState, unitId: string, stat: StatKey, ctx?: HitContext): number {
  return collectStat(state, unitId, stat, ctx).reduce((a, b) => a + b, 0);
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
 * Final stats of a unit in the current state. Pass a HitContext to include
 * conditional modifiers for that hit.
 */
export function resolveUnitStats(state: CombatState, unitId: string, ctx?: HitContext): ResolvedUnitStats {
  const unit = getUnit(state, unitId);
  const base = unitBaseStats(unit);
  const s = (k: StatKey) => sumStat(state, unitId, k, ctx);
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
