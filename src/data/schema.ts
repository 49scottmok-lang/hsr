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
import type { Element, ModifierCondition, StatKey, StatModifier } from '../engine';

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

export interface DataTables {
  readonly characters: readonly CharacterRecord[];
  readonly lightCones: readonly LightConeRecord[];
  readonly relicMainStats: readonly RelicMainStatRecord[];
  readonly setBonuses: readonly SetBonusRecord[];
  readonly traces: readonly TraceRecord[];
}
