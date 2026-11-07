/**
 * Core domain types for the HSR Team Damage Comparator calculation engine.
 *
 * RULES (see docs/ARCHITECTURE.md):
 * - This module and everything under src/engine/ must stay framework-free:
 *   no React, no DOM, no browser globals, no I/O.
 * - All percentages are stored as fractions: 50% === 0.5.
 * - The engine never ships game data. Every number (base stats, multipliers,
 *   buff values, enemy RES) is supplied by the caller.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const ELEMENTS = [
  'physical',
  'fire',
  'ice',
  'lightning',
  'wind',
  'quantum',
  'imaginary',
] as const;
export type Element = (typeof ELEMENTS)[number];

/**
 * In-game DMG type tags that buffs can condition on. A single hit may carry
 * several tags (e.g. a hit that "counts as" both Follow-up ATK DMG and
 * Ultimate DMG). Break / Super Break DMG are intentionally absent: they use a
 * different formula that is out of MVP scope (docs/KNOWN_LIMITATIONS.md).
 */
export const DAMAGE_TAGS = [
  'basic',
  'skill',
  'ultimate',
  'talent',
  'followUp',
  'dot',
  'additional',
] as const;
export type DamageTag = (typeof DAMAGE_TAGS)[number];

/** Stat a hit's multiplier scales from. */
export type ScalingStat = 'atk' | 'hp' | 'def';

/**
 * Every stat a modifier can change. Modifiers are additive within their key
 * unless documented otherwise (see docs/FORMULAS.md).
 *
 * Holder-side semantics: a modifier always affects the unit that holds the
 * effect. Attacker keys are read from the attacker, target keys from the
 * target, during damage calculation.
 */
export const STAT_KEYS = [
  // --- base-stat scaling (holder) ---
  'hpPct',
  'hpFlat',
  'atkPct',
  'atkFlat',
  'defPct',
  'defFlat',
  'spdPct',
  'spdFlat',
  // --- attacker offensive stats ---
  'critRate',
  'critDmg',
  'dmgBoost',
  'defIgnore',
  'resPen',
  /** Weaken: holder deals less DMG. Read from the attacker. */
  'weaken',
  // --- target (defender) stats ---
  /** Subtracts from the holder's DEF% pool. Read from the target. */
  'defReduction',
  /** Lowers the holder's RES. Read from the target; stacks additively with attacker resPen. */
  'resReduction',
  /** "DMG taken +X%" on the holder. Read from the target. */
  'vulnerability',
  /** "DMG taken -X%" on the holder. Multiplicative per instance. Read from the target. */
  'dmgMitigation',
  // --- tracked but not used by the MVP damage formula ---
  'breakEffect',
  'effectHitRate',
  'effectRes',
  'energyRegenRate',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

// ---------------------------------------------------------------------------
// Modifiers, effects (buffs / debuffs)
// ---------------------------------------------------------------------------

/**
 * Restricts when a modifier applies. Every listed field must match (AND);
 * within a field any listed value may match (OR). An empty/absent condition
 * always applies.
 */
export interface ModifierCondition {
  /** Hit element must be one of these. */
  elements?: readonly Element[];
  /** Hit must carry at least one of these tags. */
  damageTags?: readonly DamageTag[];
  /**
   * For modifiers held by a target: only applies when the attacker is one of
   * these unit IDs. For modifiers held by an attacker: only applies when the
   * target is one of these unit IDs.
   */
  counterpartIds?: readonly string[];
}

export interface StatModifier {
  stat: StatKey;
  /** Fractional for percentage stats, absolute for *Flat stats. Per stack. */
  value: number;
  condition?: ModifierCondition;
}

export type TurnPhase = 'turnStart' | 'turnEnd';

/**
 * Explicit duration rule. HSR duration semantics vary per ability and are not
 * fully verified, so the engine never guesses: callers state which unit's
 * turn ticks the effect and in which phase.
 */
export interface DurationSpec {
  turns: number;
  /** Unit whose turn decrements the counter. 'holder' / 'source' are resolved at apply time. */
  tickUnit: 'holder' | 'source' | { unitId: string };
  tickPhase: TurnPhase;
  /**
   * If false (default), an effect applied during the tick unit's current turn
   * does not tick at that same turn's end. UNVERIFIED game behaviour; see
   * docs/KNOWN_LIMITATIONS.md.
   */
  tickOnApplyTurn?: boolean;
}

/** Definition of a buff or debuff. Pure data; instances live in CombatState. */
export interface EffectDef {
  /** Stable ID. Re-applying the same ID to the same holder refreshes it. */
  id: string;
  name: string;
  kind: 'buff' | 'debuff';
  modifiers: readonly StatModifier[];
  /** Absent = permanent until explicitly removed. */
  duration?: DurationSpec;
  /** Default 1. */
  maxStacks?: number;
  /** Free-form source citation for the numbers (required by data/ policy, optional in engine). */
  source?: string;
}

export interface EffectInstance {
  def: EffectDef;
  holderId: string;
  sourceId: string;
  stacks: number;
  /** Remaining ticks; undefined if permanent. */
  remainingTurns?: number;
  /** Resolved tick unit ID; undefined if permanent. */
  tickUnitId?: string;
  /** Set when applied during tickUnit's own turn and tickOnApplyTurn is false. */
  skipNextTick: boolean;
}

// ---------------------------------------------------------------------------
// Units, equipment
// ---------------------------------------------------------------------------

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
}

export interface LightCone {
  name: string;
  /** Base HP/ATK/DEF at the chosen level/ascension. Caller-supplied. */
  base: BaseStats;
  /** Passive effects. The caller decides which conditional passives are active. */
  effects: readonly EffectDef[];
}

export interface Relics {
  /** Sum of all relic/planar main stats and substats as flat modifiers. */
  stats: readonly StatModifier[];
  /** Set bonuses (2pc / 4pc) the caller decides are active. */
  setEffects: readonly EffectDef[];
}

export interface CharacterBuild {
  id: string;
  name: string;
  level: number;
  element: Element;
  /** Character base HP/ATK/DEF at the chosen level/ascension. */
  base: BaseStats & { spd: number };
  /** Base CRIT. Defaults: 0.05 / 0.5 (see docs/FORMULAS.md §Base CRIT). */
  baseCritRate?: number;
  baseCritDmg?: number;
  lightCone?: LightCone;
  relics?: Relics;
  /** Minor trace stat bonuses. */
  traces?: readonly StatModifier[];
  /** Any other always-on effects (eidolons, talents, team passives). */
  passiveEffects?: readonly EffectDef[];
}

export interface EnemyConfig {
  id: string;
  name: string;
  level: number;
  /**
   * Base DEF. If omitted, uses 200 + 10 × level (community-documented; see
   * docs/FORMULAS.md §DEF).
   */
  baseDef?: number;
  /** Per-element RES. Missing elements default to 0. Caller-supplied. */
  res: Partial<Record<Element, number>>;
  /** Initial toughness-broken state. Default false. */
  broken?: boolean;
  /** Always-on enemy effects (e.g. innate damage reduction). */
  passiveEffects?: readonly EffectDef[];
}

// ---------------------------------------------------------------------------
// Combat state
// ---------------------------------------------------------------------------

export interface UnitState {
  id: string;
  side: 'ally' | 'enemy';
  level: number;
  /** Ally only. */
  build?: CharacterBuild;
  /** Enemy only. */
  enemy?: EnemyConfig;
  broken: boolean;
}

export interface CombatState {
  units: Readonly<Record<string, UnitState>>;
  effects: readonly EffectInstance[];
  /** Unit whose turn is currently in progress, if any. */
  activeTurnUnitId?: string;
}

// ---------------------------------------------------------------------------
// Damage calculation
// ---------------------------------------------------------------------------

export type CritMode = 'expected' | 'crit' | 'nonCrit';

export interface HitSpec {
  /** Defaults to the enclosing action's actorId. */
  attackerId?: string;
  targetId: string;
  scaling: ScalingStat;
  /** Skill multiplier as a fraction (e.g. 1.5 for 150%). Caller-supplied. */
  multiplier: number;
  /** Additional multiplier added to `multiplier` before scaling (Extra Multiplier). */
  extraMultiplier?: number;
  /** Flat DMG added to Base DMG after scaling. */
  flatDmg?: number;
  /** Defaults to the attacker's element. */
  element?: Element;
  tags: readonly DamageTag[];
  /** Defaults to false if tags include 'dot', otherwise true. */
  canCrit?: boolean;
  label?: string;
}

/** Fully resolved inputs used for one hit (useful for UI breakdowns and tests). */
export interface ResolvedHitStats {
  scalingValue: number;
  critRate: number;
  critDmg: number;
  dmgBoost: number;
  weaken: number;
  defIgnore: number;
  resPen: number;
  targetBaseDef: number;
  targetDefPct: number;
  targetDefFlat: number;
  targetDefReduction: number;
  targetBaseRes: number;
  targetResReduction: number;
  vulnerability: number;
  mitigations: readonly number[];
  attackerLevel: number;
  targetBroken: boolean;
}

export interface DamageBreakdown {
  baseDmg: number;
  critMultiplier: number;
  dmgBoostMultiplier: number;
  weakenMultiplier: number;
  defMultiplier: number;
  resMultiplier: number;
  vulnerabilityMultiplier: number;
  mitigationMultiplier: number;
  brokenMultiplier: number;
  /** Product of all of the above. Unrounded. */
  total: number;
}

export interface HitResult {
  eventId: string;
  hitIndex: number;
  label?: string;
  attackerId: string;
  targetId: string;
  element: Element;
  tags: readonly DamageTag[];
  critMode: CritMode;
  canCrit: boolean;
  stats: ResolvedHitStats;
  breakdown: DamageBreakdown;
  damage: number;
}

// ---------------------------------------------------------------------------
// Manual rotation
// ---------------------------------------------------------------------------

/** Who an effect is applied to. */
export type UnitRef = string | 'allAllies' | 'allEnemies';

export type ActionStep =
  | { op: 'apply'; effect: EffectDef; to: UnitRef; sourceId?: string; stacks?: number }
  | { op: 'remove'; effectId: string; from: UnitRef }
  | { op: 'hit'; hit: HitSpec }
  | { op: 'setBroken'; enemyId: string; broken: boolean };

/**
 * A manual rotation is an ordered list of events. The engine does NOT
 * simulate speed or action order; the user states the order.
 *
 * - 'turn':  a unit's turn. Effects tick at turnStart (before steps) and
 *            turnEnd (after steps).
 * - 'extra': something that happens outside a turn (Ultimate, follow-up,
 *            out-of-turn DoT trigger). No duration ticking.
 */
export type RotationEvent =
  | { kind: 'turn'; id: string; actorId: string; label?: string; steps: readonly ActionStep[] }
  | { kind: 'extra'; id: string; actorId: string; label?: string; steps: readonly ActionStep[] };

export interface RotationInput {
  team: readonly CharacterBuild[];
  enemies: readonly EnemyConfig[];
  events: readonly RotationEvent[];
  critMode?: CritMode;
  /** Number of cycles the rotation represents, for per-cycle metrics. User-declared. */
  cycles?: number;
}

export interface EventLogEntry {
  eventId: string;
  kind: RotationEvent['kind'];
  actorId: string;
  label?: string;
  damage: number;
  /** Effect IDs that expired during this event, as `${holderId}:${effectId}`. */
  expired: string[];
}

export interface RotationResult {
  hits: HitResult[];
  log: EventLogEntry[];
  totalDamage: number;
  damageByAttacker: Record<string, number>;
  damageByTag: Partial<Record<DamageTag, number>>;
  cycles?: number;
  damagePerCycle?: number;
  finalState: CombatState;
}

export interface TeamComparison {
  a: { label: string; totalDamage: number; damagePerCycle?: number };
  b: { label: string; totalDamage: number; damagePerCycle?: number };
  /** b − a */
  totalDifference: number;
  /** b / a; undefined if a is 0. */
  totalRatio?: number;
  perCycleDifference?: number;
  perCycleRatio?: number;
}
