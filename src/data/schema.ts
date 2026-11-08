/**
 * Schema for the sourced stat tables (TASKS D2). Every record names where its
 * numbers came from (`source`) and which game version they describe
 * (`gameVersion`). `validateDataTables` rejects records without them.
 *
 * Values are stored exactly as the source gives them: per-ascension `base`
 * plus a per-level increment. Lookups in `lookup.ts` apply the documented
 * level formulas (docs/FORMULAS.md § Level scaling); nothing is pre-computed
 * or interpolated here.
 */
import type { DotType, Element, ModifierCondition, StatKey, StatModifier } from '../engine';

/** A pinned file set in a git repository. */
export interface DataSource {
  /** `owner/name` on GitHub. */
  readonly repo: string;
  /** Full 40-character commit SHA the files were read at. */
  readonly commit: string;
  /** Repository paths the record's numbers came from. */
  readonly files: readonly string[];
}

export interface Cited {
  readonly source: DataSource;
  /** Game version the source describes, e.g. `"4.6.0"`. */
  readonly gameVersion: string;
}

/** A value that grows with level: `base` at the first level, plus `perLevel` per level. */
export interface LevelScaled {
  readonly base: number;
  readonly perLevel: number;
}

export interface CharacterAscension {
  /** Ascension (promotion) 0–6. */
  readonly ascension: number;
  /** Highest level reachable at this ascension. */
  readonly maxLevel: number;
  readonly hp: LevelScaled;
  readonly atk: LevelScaled;
  readonly def: LevelScaled;
  /** SPD does not scale with level. */
  readonly spd: number;
  readonly critRate: number;
  readonly critDmg: number;
}

export interface CharacterRecord extends Cited {
  /** Game character ID, as in the account export. */
  readonly id: string;
  readonly element: Element;
  /** Ultimate Energy cost (`SPNeed`, added 2026-11-08 for the auto battle). */
  readonly energyCost: number;
  /** Ordered by ascension, starting at 0. */
  readonly ascensions: readonly CharacterAscension[];
}

export interface LightConeAscension {
  readonly ascension: number;
  readonly maxLevel: number;
  readonly hp: LevelScaled;
  readonly atk: LevelScaled;
  readonly def: LevelScaled;
}

export interface LightConeRecord extends Cited {
  readonly id: string;
  readonly ascensions: readonly LightConeAscension[];
}

/** Relic slot names as written by the Reliquary Archiver export. */
export const RELIC_SLOTS = ['Head', 'Hands', 'Body', 'Feet', 'Planar Sphere', 'Link Rope'] as const;
export type RelicSlot = (typeof RELIC_SLOTS)[number];

/** Where a game property lands in the engine; `null` = not modelled by the engine. */
export interface StatTarget {
  readonly stat: StatKey;
  readonly condition?: ModifierCondition;
}

export interface RelicMainStatRecord extends Cited {
  readonly slot: RelicSlot;
  readonly rarity: number;
  readonly maxLevel: number;
  /** Source main-affix group (`RelicMainAffixConfig.GroupID`), kept for cross-checking. */
  readonly groupId: number;
  /** Game property name, e.g. `HPDelta` (flat) or `HPAddedRatio` (percent). */
  readonly property: string;
  /** Main stat name as written by the export (`mainstat`), e.g. `"HP"`. */
  readonly exportName: string;
  /** Engine stat, or `null` if the engine does not model this stat. */
  readonly target: StatTarget | null;
  /** Value at +0 and per relic level (fractions for percentage stats). */
  readonly value: LevelScaled;
}

/** A game property the engine does not model, kept so reports can name it. */
export interface UnsupportedProperty {
  readonly property: string;
  readonly value: number;
}

export interface SetBonusRecord extends Cited {
  readonly setId: string;
  readonly pieces: 2;
  /** The bonus's unconditional stat part (the source's `PropertyList`). */
  readonly modifiers: readonly StatModifier[];
  readonly unsupported: readonly UnsupportedProperty[];
  /**
   * True when the bonus also has an ability part (usually conditional).
   * That part is never in `modifiers` and must be entered by the user.
   */
  readonly hasAbilityPart: boolean;
}

export const STAT_TRACES = [
  'stat_1',
  'stat_2',
  'stat_3',
  'stat_4',
  'stat_5',
  'stat_6',
  'stat_7',
  'stat_8',
  'stat_9',
  'stat_10',
] as const;
export type StatTrace = (typeof STAT_TRACES)[number];

/**
 * `base` is the normal trace tree. `enhanced` is the alternative tree some
 * characters have (skill-tree IDs prefixed with `1`); which one an account
 * uses is not yet confirmed (see docs/IMPORT_FORMAT.md, `ability_version`).
 */
export type TraceTree = 'base' | 'enhanced';

export interface TraceRecord extends Cited {
  readonly characterId: string;
  readonly tree: TraceTree;
  /** Export key (`traces.stat_N`). */
  readonly trace: StatTrace;
  /** Source skill-tree point ID. */
  readonly pointId: string;
  readonly modifiers: readonly StatModifier[];
  readonly unsupported: readonly UnsupportedProperty[];
}

/**
 * Break DMG level multiplier (E4): the base that Break and Super Break DMG
 * scale from, by the attacker's level. Source column: `BreakBaseDamage`.
 */
export interface BreakLevelMultiplierRecord extends Cited {
  readonly level: number;
  readonly value: number;
}

export interface DataTables {
  readonly characters: readonly CharacterRecord[];
  readonly lightCones: readonly LightConeRecord[];
  readonly relicMainStats: readonly RelicMainStatRecord[];
  readonly setBonuses: readonly SetBonusRecord[];
  readonly traces: readonly TraceRecord[];
  readonly breakLevelMultipliers: readonly BreakLevelMultiplierRecord[];
}

// --- Display names (Traditional Chinese) -------------------------------------
//
// Text comes from the source's Traditional Chinese text map
// (`TextMap/TextMapCHT.json`), joined by the hash each config row names.
// It is the game's own text, so no name here is a translation of ours.

/** Path (命途) as the source names it, e.g. `Warrior` = 毀滅. */
export interface PathNameRecord extends Cited {
  /** Source path ID (`AvatarBaseType.ID`). */
  readonly id: string;
  readonly name: string;
}

export interface CharacterNameRecord extends Cited {
  readonly id: string;
  /**
   * `null` when the game shows the player's chosen nickname instead of a
   * fixed name (the Trailblazer). The UI must supply its own label then.
   */
  readonly name: string | null;
  /** Path ID; join with `PathNameRecord`. Two characters can share a name (e.g. 1001 and 1224), but not a name and path. */
  readonly path: string;
  /** Set only when `name` is `null`, from the source's multi-path table. */
  readonly gender?: 'male' | 'female';
}

export interface LightConeNameRecord extends Cited {
  readonly id: string;
  readonly name: string;
  /** Path ID; join with `PathNameRecord`. */
  readonly path: string;
}

export interface RelicSetNameRecord extends Cited {
  readonly setId: string;
  readonly name: string;
}

export interface NameTables {
  readonly paths: readonly PathNameRecord[];
  readonly characters: readonly CharacterNameRecord[];
  readonly lightCones: readonly LightConeNameRecord[];
  readonly relicSets: readonly RelicSetNameRecord[];
}

// --- Endgame enemies (added 2026-11-08) ---------------------------------------
//
// Enemies of the top floor of the latest endgame rotations, from source A's
// stage and monster tables. Like the stat tables, records hold the source's
// raw numbers; `stageEnemies` in `enemies.ts` applies the stage's level and
// elite scaling (docs/FORMULAS.md § Enemy stats). Kept apart from
// `DataTables` because the account import does not need them.

/** Memory of Chaos (`memory`), Pure Fiction (`story`), Apocalyptic Shadow (`boss`): the source's own group types. */
export const ENDGAME_MODES = ['memory', 'story', 'boss'] as const;
export type EndgameMode = (typeof ENDGAME_MODES)[number];

/** The source's `Rank` column, weakest first. */
export const ENEMY_RANKS = ['Minion', 'MinionLv2', 'Elite', 'LittleBoss', 'BigBoss'] as const;
export type EnemyRank = (typeof ENEMY_RANKS)[number];

/**
 * One raw enemy stat: the template's `base`, the variant's own multiplier
 * (`…ModifyRatio`) and the flat `…ModifyValue` (0 when the source has none).
 */
export interface EnemyBaseStat {
  readonly base: number;
  readonly ratio: number;
  readonly add: number;
}

/** One enemy variant: a `MonsterConfig` row joined with its template. */
export interface EnemyRecord extends Cited {
  /** `MonsterID`. Variants of one template differ in RES, weaknesses and multipliers. */
  readonly id: string;
  readonly templateId: string;
  /** Traditional Chinese name from the text map. */
  readonly name: string;
  readonly rank: EnemyRank;
  /** Elements that reduce Toughness (`StanceWeakList`). */
  readonly weaknesses: readonly Element[];
  /** `DamageTypeResistance`, copied as listed (fractions). */
  readonly res: Partial<Record<Element, number>>;
  /** DoT entries of `DebuffResist` (fractions). Other debuff RES types are not modelled. */
  readonly debuffRes: Partial<Record<DotType, number>>;
  readonly hp: EnemyBaseStat;
  readonly def: EnemyBaseStat;
  readonly spd: EnemyBaseStat;
  /** Toughness in source units (`Stance`): `formulas.STANCE_PER_TOUGHNESS` per displayed point. */
  readonly stance: EnemyBaseStat;
  /** Template Effect RES (`StatusResistanceBase`) before the level bonus. */
  readonly effectRes: number;
  /** The variant's own `EliteGroup`. */
  readonly eliteGroup: number;
}

/** Multipliers a level row or elite group applies to the four scaled stats. */
export interface EnemyStatRatios {
  readonly hp: number;
  readonly def: number;
  readonly spd: number;
  readonly stance: number;
}

/** One `HardLevelGroup` row: the multipliers for enemies of `group` at `level`. */
export interface EnemyLevelRecord extends Cited {
  readonly group: number;
  readonly level: number;
  readonly ratios: EnemyStatRatios;
  /** Effect RES added at this level (`StatusResistance`, 0 when absent). */
  readonly effectRes: number;
}

export interface EliteGroupRecord extends Cited {
  readonly id: number;
  readonly ratios: EnemyStatRatios;
}

/** One node (half) of an endgame floor and its enemies. */
export interface EndgameStageRecord extends Cited {
  /** `StageID`. */
  readonly id: string;
  readonly mode: EndgameMode;
  readonly groupId: string;
  /** The rotation's Traditional Chinese title. */
  readonly groupName: string;
  /** First day of the rotation (`YYYY-MM-DD`, server time 04:00). */
  readonly startDate: string;
  readonly floor: number;
  /** 1 and 2 are the two halves; 3 is the third node some rotations add. */
  readonly node: number;
  /** Enemy level of the stage. */
  readonly level: number;
  /** `HardLevelGroup` of the stage; with `level`, picks the `EnemyLevelRecord`. */
  readonly levelGroup: number;
  /** Stage-wide `EliteGroup`, or `null` when the stage has none. */
  readonly eliteGroup: number | null;
  /** Enemy IDs per wave, in slot order. */
  readonly waves: readonly (readonly string[])[];
}

export interface EnemyTables {
  readonly enemies: readonly EnemyRecord[];
  readonly levels: readonly EnemyLevelRecord[];
  readonly eliteGroups: readonly EliteGroupRecord[];
  readonly stages: readonly EndgameStageRecord[];
}
