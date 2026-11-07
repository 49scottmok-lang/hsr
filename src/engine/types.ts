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
 * Ultimate DMG). Break / Super Break DMG are not tags: they are separate
 * `break` steps with their own formula (docs/FORMULAS.md § Break DMG).
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
  /** Separate "Final DMG" multiplier zone. Each modifier multiplies: Π(1 + v). Read from the attacker. */
  'finalDmgBoost',
  /** "True DMG" multiplier, 1 + Σ. Read from the attacker. */
  'trueDmg',
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

/**
 * Gate on the source unit's build. A requirement on a non-ally source
 * (enemy) is evaluated with eidolon 0.
 */
export interface Requirement {
  /** Source character's eidolon must be >= this (0–6). */
  minEidolon?: number;
}

/**
 * What re-applying an effect (same `id`, same holder) does. Abilities differ,
 * so each effect states its own rule (TASKS E5; replaces assumption A1).
 *
 * - `refresh` (default): replace the definition and source, add stacks up to
 *   `maxStacks`, and restart the duration.
 * - `noRefresh`: keep the live instance (definition, source, remaining
 *   turns) and only add stacks up to `maxStacks`. With one stack, nothing happens.
 * - `independent`: every application is its own instance with its own
 *   duration. `maxStacks` caps the holder's total stacks; when it is exceeded
 *   the oldest instances lose stacks first.
 */
export const STACKING_POLICIES = ['refresh', 'noRefresh', 'independent'] as const;
export type StackingPolicy = (typeof STACKING_POLICIES)[number];

/** Definition of a buff or debuff. Pure data; instances live in CombatState. */
export interface EffectDef {
  /**
   * Only applied if the SOURCE unit meets this (e.g. an E2 effect). For
   * always-on effects (light cone, relic sets, passives) the source is the holder.
   */
  requires?: Requirement;
  /** Stable ID. Re-applying the same ID to the same holder follows `stacking`. */
  id: string;
  name: string;
  kind: 'buff' | 'debuff';
  modifiers: readonly StatModifier[];
  /** Absent = permanent until explicitly removed. */
  duration?: DurationSpec;
  /** Default 1. With `independent` stacking, the cap on the holder's total stacks. */
  maxStacks?: number;
  /** Re-application rule. Default `refresh`. */
  stacking?: StackingPolicy;
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
  /**
   * Superimposition 1–5 (default 1). Metadata only: the engine does not scale
   * values by it. Callers/data must supply the effect values for the chosen S.
   */
  superimposition?: number;
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
  /** Eidolon level 0–6 (default 0). Gates effects and rotation steps via `requires`. */
  eidolon?: number;
  /**
   * Break DMG level multiplier at this character's level, needed only for
   * `break` steps. Caller-supplied; `src/data` has the sourced table
   * (`breakLevelMultiplier`), and the account import fills it in.
   */
  breakLevelMultiplier?: number;
  /** Character base HP/ATK/DEF at the chosen level/ascension. */
  base: BaseStats & { spd: number };
  /** Base CRIT. Defaults: 0.05 / 0.5 (see docs/FORMULAS.md §Base CRIT). */
  baseCritRate?: number;
  baseCritDmg?: number;
  lightCone?: LightCone;
  relics?: Relics;
  /** Minor trace stat bonuses. */
  traces?: readonly StatModifier[];
  /**
   * Any other always-on effects (talents, traces, team passives, eidolons).
   * Eidolon effects should carry `requires.minEidolon` so one list serves E0–E6.
   */
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
  /**
   * Max Toughness in displayed units (a Basic ATK typically reduces 10).
   * Needed only for Break DMG (`break` steps of kind 'break'). Caller-supplied.
   */
  maxToughness?: number;
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

interface BreakHitBase {
  /** Defaults to the enclosing action's actorId. */
  attackerId?: string;
  targetId: string;
  /** Defaults to the attacker's element. Sets the Break DMG element factor and the RES used. */
  element?: Element;
  label?: string;
}

/** Break DMG, dealt when the attacker breaks the target's Toughness (docs/FORMULAS.md § Break DMG). */
export interface BreakDmgSpec extends BreakHitBase {
  kind: 'break';
  /** Fraction of the full Break DMG, for abilities that deal "X% of Break DMG". Default 1. */
  multiplier?: number;
}

/** Super Break DMG, dealt by a hit against a broken target (docs/FORMULAS.md § Super Break DMG). */
export interface SuperBreakDmgSpec extends BreakHitBase {
  kind: 'superBreak';
  /** The triggering hit's Toughness reduction in displayed units, before Weakness Break Efficiency. */
  toughnessReduction: number;
  /** Weakness Break Efficiency of the triggering hit (fraction). Default 0. */
  breakEfficiency?: number;
  /** Toughness reduction that Weakness Break Efficiency does not scale. Default 0. */
  fixedToughnessReduction?: number;
  /** Super Break DMG multiplier, the sum of the active sources (e.g. 1.5 for 150%). Caller-supplied. */
  multiplier: number;
}

export type BreakHitSpec = BreakDmgSpec | SuperBreakDmgSpec;

/** The break-specific inputs of a break hit, for display. */
export interface BreakDetails {
  kind: BreakHitSpec['kind'];
  levelMultiplier: number;
  /** Break only. */
  elementFactor?: number;
  /** Break only: the target's max Toughness. */
  maxToughness?: number;
  /** Super Break only: (1 + breakEfficiency) × toughnessReduction + fixedToughnessReduction. */
  toughness?: number;
  multiplier: number;
  breakEffect: number;
  /** 1 + breakEffect. Already included in the breakdown's `baseDmg`. */
  breakEffectMultiplier: number;
}

/** Fully resolved inputs used for one hit (useful for UI breakdowns and tests). */
export interface ResolvedHitStats {
  scalingValue: number;
  critRate: number;
  critDmg: number;
  dmgBoost: number;
  weaken: number;
  finalDmgBoosts: readonly number[];
  trueDmg: number;
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
  finalDmgMultiplier: number;
  trueDmgMultiplier: number;
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
  /**
   * Set for Break and Super Break DMG (`break` steps). Such hits have no tags
   * and never crit, and their `breakdown.baseDmg` already includes 1 + Break Effect.
   */
  break?: BreakDetails;
}

// ---------------------------------------------------------------------------
// Manual rotation
// ---------------------------------------------------------------------------

/** Who an effect is applied to. */
export type UnitRef = string | 'allAllies' | 'allEnemies';

/**
 * One step of a rotation event. `requires` skips the step unless its source
 * unit meets it: hit and break → attacker, apply → sourceId, otherwise the event actor.
 * This lets one rotation be reused across eidolon levels.
 */
export type ActionStep = { requires?: Requirement } & (
  | { op: 'apply'; effect: EffectDef; to: UnitRef; sourceId?: string; stacks?: number }
  | { op: 'remove'; effectId: string; from: UnitRef }
  | { op: 'hit'; hit: HitSpec }
  | { op: 'break'; hit: BreakHitSpec }
  | { op: 'setBroken'; enemyId: string; broken: boolean }
);

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
  /** Indexes of steps skipped because a `requires` gate was not met (step or effect). */
  skippedSteps: number[];
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
