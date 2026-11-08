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
 * Ultimate DMG).
 *
 * `break` and `superBreak` are set by the engine on `break` steps only (their
 * own formula, docs/FORMULAS.md § Break DMG); a `hit` step may not use them.
 * They let "Break DMG +X%" style modifiers condition on break hits.
 */
export const DAMAGE_TAGS = [
  'basic',
  'skill',
  'ultimate',
  'talent',
  'followUp',
  'dot',
  'additional',
  'break',
  'superBreak',
] as const;
export type DamageTag = (typeof DAMAGE_TAGS)[number];

/** Tags the engine sets on `break` steps (the step's kind). */
export const BREAK_DAMAGE_TAGS = ['break', 'superBreak'] as const satisfies readonly DamageTag[];
/** Tags a `hit` step may carry: every tag except `BREAK_DAMAGE_TAGS`. */
export const HIT_DAMAGE_TAGS: readonly Exclude<DamageTag, (typeof BREAK_DAMAGE_TAGS)[number]>[] = [
  'basic',
  'skill',
  'ultimate',
  'talent',
  'followUp',
  'dot',
  'additional',
];

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
  /** Weakness Break Efficiency, added to a Super Break step's own. Read from the attacker. */
  'breakEfficiency',
  /** Super Break DMG multiplier, added to a Super Break step's own. Read from the attacker. */
  'superBreakDmg',
  /** Effect RES PEN for DoT application chance (E8). Read from the attacker. */
  'effectResPen',
  // --- target (defender) stats ---
  /** Subtracts from the holder's DEF% pool. Read from the target. */
  'defReduction',
  /** Lowers the holder's RES. Read from the target; stacks additively with attacker resPen. */
  'resReduction',
  /** "DMG taken +X%" on the holder. Read from the target. */
  'vulnerability',
  /** "DMG taken -X%" on the holder. Multiplicative per instance. Read from the target. */
  'dmgMitigation',
  // --- other unit stats ---
  /** Break Effect. Read from the attacker on break hits. */
  'breakEffect',
  /** Effect Hit Rate. Read from the attacker for DoT application chance (E8). */
  'effectHitRate',
  /** Effect RES. Read from the target for DoT application chance (E8); negative values lower it. */
  'effectRes',
  /** Tracked only; energy is not simulated. */
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

/**
 * Final stats a conversion can read (E7). These are the same quantities as
 * `ResolvedUnitStats` minus DMG Boost.
 */
export const CONVERSION_SOURCES = [
  'hp',
  'atk',
  'def',
  'spd',
  'critRate',
  'critDmg',
  'breakEffect',
  'effectHitRate',
  'effectRes',
  'energyRegenRate',
] as const;
export type ConversionSource = (typeof CONVERSION_SOURCES)[number];

/**
 * A stat-conversion modifier (TASKS E7): "`to` increases by `ratio` of
 * `from`", evaluated at hit time from the current state
 * (docs/FORMULAS.md § Stat conversion).
 *
 * contribution = min(cap, ratio × stacks × max(0, from − threshold))
 *
 * `from` is read WITHOUT any conversion contributions (single pass), so
 * conversions never chain or loop.
 */
export interface StatConversion {
  from: ConversionSource;
  /**
   * Whose `from` stat is read. `holder` (default): the unit holding the
   * effect, with the current hit's conditional modifiers. `source`: the unit
   * that applied the effect, context-free (as on its character sheet).
   */
  fromUnit?: 'holder' | 'source';
  /** The stat that is increased, with the usual holder-side semantics. */
  to: StatKey;
  /** Fraction of `from` per stack (e.g. 0.5 for "50% of …"). Caller-supplied. */
  ratio: number;
  /** Only the part of `from` above this value counts ("… exceeding 1800"). Default 0. */
  threshold?: number;
  /** Maximum contribution, after stacks ("up to +50%"). Default: no cap. */
  cap?: number;
  /** When the converted value applies, matched against the holder's hit context. */
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
  /** Stat conversions (E7), evaluated at hit time. */
  conversions?: readonly StatConversion[];
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
  /**
   * Game character ID (e.g. `1102`), for display only (portraits, names).
   * The engine never reads it; every number still comes from the fields below.
   */
  characterId?: string;
  /**
   * Skill-tree levels from the account export (eidolon bonuses not included)
   * and which skill tree they belong to. Metadata for prefilling auto-battle
   * kits from `src/data`; the engine never reads it.
   */
  skillLevels?: { basic: number; skill: number; ultimate: number; tree?: 'base' | 'enhanced' };
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

/**
 * DoT debuffs with their own Debuff RES (E12; S3 Debuff RES lists Bleed, Burn,
 * Shock and Wind Shear among its types). Non-DoT debuffs (Frozen, Entanglement,
 * Imprisonment, Control Effects) are not listed: `apply` steps always land.
 */
export const DOT_TYPES = ['bleed', 'burn', 'shock', 'windShear'] as const;
export type DotType = (typeof DOT_TYPES)[number];

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
   * Base SPD, for the turn order helper's caller only (added 2026-11-08, D6):
   * `runRotation` never reads it. Set when an endgame enemy is picked.
   */
  spd?: number;
  /**
   * Max Toughness in displayed units (a Basic ATK typically reduces 10).
   * Needed only for Break DMG (`break` steps of kind 'break'). Caller-supplied.
   */
  maxToughness?: number;
  /**
   * Base Effect RES (fraction), used for DoT application chance (E8). Default 0.
   * Caller-supplied.
   */
  effectRes?: number;
  /**
   * Debuff RES per DoT type (fractions), used for DoT application chance (E12).
   * Missing types default to 0. Caller-supplied.
   */
  debuffRes?: Partial<Record<DotType, number>>;
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
  /**
   * DoT only (E8): base chance of the debuff that deals this DoT (fraction,
   * may exceed 1). When set, the hit is weighted by its application chance
   * (docs/FORMULAS.md § DoT application chance). Absent: the DoT always landed.
   */
  baseChance?: number;
  /**
   * DoT only (E12): which DoT debuff this is, so the target's `debuffRes` for it
   * lowers the application chance. Needs `baseChance`.
   */
  dotType?: DotType;
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
  /** Super Break only: the step's Weakness Break Efficiency plus the attacker's `breakEfficiency` stat. */
  breakEfficiency?: number;
  /** Super Break: the step's multiplier plus the attacker's `superBreakDmg` stat. */
  multiplier: number;
  breakEffect: number;
  /** 1 + breakEffect. Already included in the breakdown's `baseDmg`. */
  breakEffectMultiplier: number;
  /** Σ DMG Boost naming `break` (S3's Break DMG Increase). Same as `stats.dmgBoost`. Added 2026-11-08 (E11). */
  breakDmgIncrease: number;
  /** Super Break only: Σ DMG Boost naming `superBreak` but not `break`, a separate factor (E11). */
  superBreakDmgIncrease?: number;
}

/** Fully resolved inputs used for one hit (useful for UI breakdowns and tests). */
export interface ResolvedHitStats {
  scalingValue: number;
  critRate: number;
  critDmg: number;
  dmgBoost: number;
  /** Combined Weaken: 1 − Π (1 − w_i) over the attacker's sources (E1, FORMULAS § Weaken). */
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
  /** Attacker Effect Hit Rate, Effect RES PEN and target Effect RES (E8; used only by DoT with `baseChance`). */
  effectHitRate: number;
  effectResPen: number;
  targetEffectRes: number;
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
  /** DoT application chance (E8). 1 unless the hit is a DoT with `baseChance`. */
  dotChanceMultiplier: number;
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
   * Set for Break and Super Break DMG (`break` steps). Such hits carry only the
   * tag `break` or `superBreak`, never crit, and their `breakdown.baseDmg`
   * already includes 1 + Break Effect.
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

// ---------------------------------------------------------------------------
// Turn order helper (E6). Suggests the order of `turn` events from SPD; it
// never runs damage, and the manual event list stays the authority.
// ---------------------------------------------------------------------------

export interface TimelineUnit {
  id: string;
  side: 'ally' | 'enemy';
  /** Final SPD at battle start (allies: `resolveUnitStats(...).spd`; enemies: user input). */
  spd: number;
}

/**
 * A manual change to one unit's action gauge or SPD (FORMULAS.md § Action Value).
 * Advance and SPD changes commute: both act on the gauge, which a SPD change keeps.
 */
export interface TimelineAdjustment {
  /** `'start'`: before the first turn. Otherwise right after the given turn of `unitId` ends (1-based, that unit's own count). */
  at: 'start' | { unitId: string; turn: number };
  /** Unit whose gauge or SPD changes. */
  targetId: string;
  /** Action Advance as a fraction of the 10000 gauge (`0.25` = 25%). Negative = Action Delay. The gauge never goes below 0. */
  advance?: number;
  /** New SPD from this point on (absolute value, not a delta). */
  spd?: number;
  /**
   * "Immediately take action": sets the gauge to 0, unlike a 100% advance, which
   * cannot undo a delay. Applied after `spd` and `advance`.
   */
  actNow?: true;
}

export interface TimelineInput {
  /** Units in slot order. Within a side, earlier units win AV ties. */
  units: readonly TimelineUnit[];
  /** Include turns whose elapsed AV is <= this limit. */
  avLimit: number;
  adjustments?: readonly TimelineAdjustment[];
  /** Cycle lengths in AV, user-supplied (no game default ships). When set, each turn gets a `cycle`. */
  cycleAv?: { first: number; later: number };
}

export interface TimelineTurn {
  unitId: string;
  /** That unit's own turn count, 1-based. */
  turn: number;
  /** Elapsed action value at which the turn starts. */
  av: number;
  /** 1-based cycle, only when `TimelineInput.cycleAv` is set. */
  cycle?: number;
}

export interface TimelineResult {
  turns: readonly TimelineTurn[];
  /** True if `MAX_TIMELINE_TURNS` stopped the timeline before `avLimit`. */
  truncated: boolean;
  /** Indexes of adjustments whose trigger turn never happened within the limit. */
  unusedAdjustments: readonly number[];
}

// ---------------------------------------------------------------------------
// Auto battle (D7, added 2026-11-08)
// ---------------------------------------------------------------------------

/** One action of an auto-battle kit. Every number is user input (no kit data ships). */
export interface AutoAction {
  steps: readonly ActionStep[];
  /** Energy gained by the action, before Energy Regeneration Rate. */
  energy: number;
  /** Event label in the generated rotation. */
  label?: string;
}

/** How one team member plays in the auto battle. */
export interface AutoKit {
  /** Team member ID. */
  unitId: string;
  /** Energy at battle start. */
  startEnergy: number;
  /** Basic ATK; `skillPoints` is the number it generates. */
  basic: AutoAction & { skillPoints: number };
  /** Skill; `skillPoints` is the number it costs. */
  skill?: AutoAction & { skillPoints: number };
  /** Ultimate; `energyCost` is the Energy needed (also the Energy cap). */
  ultimate?: AutoAction & { energyCost: number };
  /** Use the Skill whenever affordable while keeping `skillPointReserve` points. */
  useSkill: boolean;
  /** Skill points to keep after casting the Skill. Default 0. */
  skillPointReserve?: number;
  /** Cast the Ultimate as soon as Energy is full. */
  useUltimate: boolean;
}

export interface AutoBattleInput {
  team: readonly CharacterBuild[];
  /** Every enemy needs `spd`. */
  enemies: readonly EnemyConfig[];
  /** At most one per team member; members without one take empty turns. */
  kits: readonly AutoKit[];
  /** Simulate turns up to this elapsed AV. */
  avLimit: number;
  cycleAv?: { first: number; later: number };
  /** Team skill points at battle start and the cap. User input. */
  skillPoints: { start: number; max: number };
}

export const AUTO_ACTIONS = ['basic', 'skill', 'ultimate', 'idle', 'enemyTurn'] as const;
export type AutoActionKind = (typeof AUTO_ACTIONS)[number];

export interface AutoBattleAction {
  /** ID of the generated event. */
  eventId: string;
  unitId: string;
  action: AutoActionKind;
  av: number;
  cycle?: number;
  /** Team skill points after the action. */
  skillPoints: number;
  /** The acting ally's Energy after the action (kit members only). */
  energy?: number;
}

export interface AutoBattleResult {
  /** The rotation, ready for `runRotation`. */
  events: RotationEvent[];
  /** One entry per event, in order. */
  actions: AutoBattleAction[];
  /** True if `MAX_TIMELINE_TURNS` stopped the battle before `avLimit`. */
  truncated: boolean;
  /** With `cycleAv`: the cycle `avLimit` falls in, for `RotationInput.cycles`. */
  cycles?: number;
}
