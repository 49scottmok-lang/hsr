/**
 * Pure transform: raw DimbreathBot/TurnBasedGameData `ExcelOutput` tables →
 * `src/data` records (TASKS D3). No I/O here; `extract.ts` does the fetching
 * and writing. Values are copied exactly; nothing is computed per level.
 *
 * Throws on anything unexpected (unknown property, duplicate point, missing
 * relic group) so a format change in a new game build fails loudly instead
 * of producing wrong tables.
 */
import type { StatModifier } from '../../src/engine/types.ts';
import { DAMAGE_TYPE_ELEMENTS, GAME_PROPERTY_TARGETS, MAIN_STAT_EXPORT_NAMES } from '../../src/data/properties.ts';
import type {
  CharacterAscension,
  LightConeAscension,
  RelicSlot,
  StatTrace,
  TraceTree,
  UnsupportedProperty,
} from '../../src/data/schema.ts';

// --- Raw shapes (only the fields we read) -----------------------------------

interface Num {
  Value?: number;
}
export interface RawAvatar {
  AvatarID: number;
  DamageType: string;
  Release?: boolean;
}
export interface RawAvatarPromotion {
  AvatarID: number;
  Promotion?: number;
  MaxLevel: number;
  HPBase: Num;
  HPAdd: Num;
  AttackBase: Num;
  AttackAdd: Num;
  DefenceBase: Num;
  DefenceAdd: Num;
  SpeedBase: Num;
  CriticalChance: Num;
  CriticalDamage: Num;
}
export interface RawEquipment {
  EquipmentID: number;
  Release?: boolean;
}
export interface RawEquipmentPromotion {
  EquipmentID: number;
  Promotion?: number;
  MaxLevel: number;
  BaseHP: Num;
  BaseHPAdd: Num;
  BaseAttack: Num;
  BaseAttackAdd: Num;
  BaseDefence: Num;
  BaseDefenceAdd: Num;
}
export interface RawRelic {
  Type: string;
  MaxLevel: number;
  MainAffixGroup: number;
  Mode: string;
}
export interface RawRelicMainAffix {
  GroupID: number;
  AffixID: number;
  Property: string;
  BaseValue: Num;
  LevelAdd: Num;
}
export interface RawRelicSet {
  SetID: number;
  Release?: boolean;
}
export interface RawRelicSetSkill {
  SetID: number;
  RequireNum: number;
  /** Field names are obfuscated and change between builds; read by value shape. */
  PropertyList: Record<string, unknown>[];
  AbilityName?: string;
}
export interface RawSkillTreePoint {
  PointID: number;
  Level: number;
  AvatarID: number;
  PointType: number;
  AnchorType: string;
  StatusAddList: { PropertyType: string; Value: Num }[];
}

export interface RawAvatarBreakDamage {
  Level: number;
  BreakBaseDamage: Num;
}

export interface RawSourceA {
  avatars: RawAvatar[];
  avatarPromotions: RawAvatarPromotion[];
  equipment: RawEquipment[];
  equipmentPromotions: RawEquipmentPromotion[];
  relics: RawRelic[];
  relicMainAffixes: RawRelicMainAffix[];
  relicSets: RawRelicSet[];
  relicSetSkills: RawRelicSetSkill[];
  skillTree: RawSkillTreePoint[];
  avatarBreakDamage: RawAvatarBreakDamage[];
}

// --- Output shapes (records without the citation, added by the writer) -----

export interface CharacterRow {
  id: string;
  element: string;
  ascensions: CharacterAscension[];
}
export interface LightConeRow {
  id: string;
  ascensions: LightConeAscension[];
}
export interface RelicMainStatRow {
  slot: RelicSlot;
  rarity: number;
  maxLevel: number;
  groupId: number;
  property: string;
  exportName: string;
  target: (typeof GAME_PROPERTY_TARGETS)[string];
  value: { base: number; perLevel: number };
}
export interface SetBonusRow {
  setId: string;
  pieces: 2;
  modifiers: StatModifier[];
  unsupported: UnsupportedProperty[];
  hasAbilityPart: boolean;
}
export interface TraceRow {
  characterId: string;
  tree: TraceTree;
  trace: StatTrace;
  pointId: string;
  modifiers: StatModifier[];
  unsupported: UnsupportedProperty[];
}
export interface BreakLevelMultiplierRow {
  level: number;
  value: number;
}
export interface TablesA {
  characters: CharacterRow[];
  lightCones: LightConeRow[];
  relicMainStats: RelicMainStatRow[];
  setBonuses: SetBonusRow[];
  traces: TraceRow[];
  breakLevelMultipliers: BreakLevelMultiplierRow[];
}

// --- Helpers -----------------------------------------------------------------

// The game omits zero values ({}), so a missing Value means 0.
const v = (n: Num | undefined): number => n?.Value ?? 0;

const SLOT_NAMES: Readonly<Record<string, RelicSlot>> = {
  // Reliquary Archiver `slot_type_to_export` (utils.rs @ 5e50dcb).
  HEAD: 'Head',
  HAND: 'Hands',
  BODY: 'Body',
  FOOT: 'Feet',
  NECK: 'Planar Sphere',
  OBJECT: 'Link Rope',
};

function propertyBonus(
  property: string,
  value: number,
  where: string,
): { modifier?: StatModifier; unsupported?: UnsupportedProperty } {
  if (!(property in GAME_PROPERTY_TARGETS)) throw new Error(`${where}: unknown game property ${property}`);
  const target = GAME_PROPERTY_TARGETS[property];
  if (!target) return { unsupported: { property, value } };
  return { modifier: { stat: target.stat, value, ...(target.condition ? { condition: target.condition } : {}) } };
}

function collectBonuses(
  entries: readonly { property: string; value: number }[],
  where: string,
): { modifiers: StatModifier[]; unsupported: UnsupportedProperty[] } {
  const modifiers: StatModifier[] = [];
  const unsupported: UnsupportedProperty[] = [];
  for (const e of entries) {
    const b = propertyBonus(e.property, e.value, where);
    if (b.modifier) modifiers.push(b.modifier);
    if (b.unsupported) unsupported.push(b.unsupported);
  }
  return { modifiers, unsupported };
}

/** Reads one obfuscated `PropertyList` entry: one string field, one `{ Value }` field. */
export function readObfuscatedProperty(entry: Record<string, unknown>, where: string): { property: string; value: number } {
  const values = Object.values(entry);
  const names = values.filter((x): x is string => typeof x === 'string');
  const nums = values.filter(
    (x): x is Num => typeof x === 'object' && x !== null && (Object.keys(x).length === 0 || 'Value' in x),
  );
  if (names.length !== 1 || nums.length !== 1) {
    throw new Error(`${where}: cannot read PropertyList entry ${JSON.stringify(entry)}`);
  }
  return { property: names[0]!, value: v(nums[0]) };
}

const byNumber = (a: string, b: string): number => Number(a) - Number(b);

function groupBy<T>(rows: readonly T[], key: (r: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// --- Transform -----------------------------------------------------------------

export function transformSourceA(raw: RawSourceA): TablesA {
  const releasedAvatars = new Set(raw.avatars.filter((a) => a.Release === true).map((a) => a.AvatarID));
  const releasedEquipment = new Set(raw.equipment.filter((e) => e.Release === true).map((e) => e.EquipmentID));
  const releasedSets = new Set(raw.relicSets.filter((s) => s.Release === true).map((s) => s.SetID));

  // Characters
  const avatarPromos = groupBy(raw.avatarPromotions, (p) => p.AvatarID);
  const characters: CharacterRow[] = raw.avatars
    .filter((a) => releasedAvatars.has(a.AvatarID))
    .map((a) => {
      const element = DAMAGE_TYPE_ELEMENTS[a.DamageType];
      if (!element) throw new Error(`avatar ${a.AvatarID}: unknown DamageType ${a.DamageType}`);
      const promos = (avatarPromos.get(a.AvatarID) ?? []).slice().sort((x, y) => (x.Promotion ?? 0) - (y.Promotion ?? 0));
      if (promos.length === 0) throw new Error(`avatar ${a.AvatarID}: no promotion rows`);
      return {
        id: String(a.AvatarID),
        element,
        ascensions: promos.map((p) => ({
          ascension: p.Promotion ?? 0,
          maxLevel: p.MaxLevel,
          hp: { base: v(p.HPBase), perLevel: v(p.HPAdd) },
          atk: { base: v(p.AttackBase), perLevel: v(p.AttackAdd) },
          def: { base: v(p.DefenceBase), perLevel: v(p.DefenceAdd) },
          spd: v(p.SpeedBase),
          critRate: v(p.CriticalChance),
          critDmg: v(p.CriticalDamage),
        })),
      };
    })
    .sort((x, y) => byNumber(x.id, y.id));

  // Light cones
  const equipPromos = groupBy(raw.equipmentPromotions, (p) => p.EquipmentID);
  const lightCones: LightConeRow[] = raw.equipment
    .filter((e) => releasedEquipment.has(e.EquipmentID))
    .map((e) => {
      const promos = (equipPromos.get(e.EquipmentID) ?? []).slice().sort((x, y) => (x.Promotion ?? 0) - (y.Promotion ?? 0));
      if (promos.length === 0) throw new Error(`light cone ${e.EquipmentID}: no promotion rows`);
      return {
        id: String(e.EquipmentID),
        ascensions: promos.map((p) => ({
          ascension: p.Promotion ?? 0,
          maxLevel: p.MaxLevel,
          hp: { base: v(p.BaseHP), perLevel: v(p.BaseHPAdd) },
          atk: { base: v(p.BaseAttack), perLevel: v(p.BaseAttackAdd) },
          def: { base: v(p.BaseDefence), perLevel: v(p.BaseDefenceAdd) },
        })),
      };
    })
    .sort((x, y) => byNumber(x.id, y.id));

  // Relic main stats: (slot, rarity) → main affix group, from ordinary relics only.
  // Rarity = MaxLevel / 3, as Reliquary Archiver computes it (converters.rs @ 5e50dcb).
  const groupFor = new Map<string, { slot: RelicSlot; rarity: number; maxLevel: number; groupId: number }>();
  for (const r of raw.relics) {
    if (r.Mode !== 'BASIC') continue;
    const slot = SLOT_NAMES[r.Type];
    if (!slot) throw new Error(`relic: unknown slot type ${r.Type}`);
    const rarity = r.MaxLevel / 3;
    if (!Number.isInteger(rarity)) throw new Error(`relic: MaxLevel ${r.MaxLevel} is not 3 × rarity`);
    const key = `${slot}/${rarity}`;
    const prev = groupFor.get(key);
    if (prev && prev.groupId !== r.MainAffixGroup) {
      throw new Error(`relic ${key}: groups ${prev.groupId} and ${r.MainAffixGroup} disagree`);
    }
    groupFor.set(key, { slot, rarity, maxLevel: r.MaxLevel, groupId: r.MainAffixGroup });
  }
  const affixesByGroup = groupBy(raw.relicMainAffixes, (a) => a.GroupID);
  const relicMainStats: RelicMainStatRow[] = [...groupFor.values()]
    .sort((x, y) => x.groupId - y.groupId)
    .flatMap((g) => {
      const affixes = (affixesByGroup.get(g.groupId) ?? []).slice().sort((x, y) => x.AffixID - y.AffixID);
      if (affixes.length === 0) throw new Error(`relic group ${g.groupId}: no main affixes`);
      return affixes.map((a) => {
        if (!(a.Property in GAME_PROPERTY_TARGETS)) throw new Error(`relic group ${g.groupId}: unknown property ${a.Property}`);
        const exportName = MAIN_STAT_EXPORT_NAMES[a.Property];
        if (!exportName) throw new Error(`relic group ${g.groupId}: no export name for ${a.Property}`);
        return {
          slot: g.slot,
          rarity: g.rarity,
          maxLevel: g.maxLevel,
          groupId: g.groupId,
          property: a.Property,
          exportName,
          target: GAME_PROPERTY_TARGETS[a.Property] ?? null,
          value: { base: v(a.BaseValue), perLevel: v(a.LevelAdd) },
        };
      });
    });

  // 2-piece set bonuses: the PropertyList part only. Sets whose 2-piece is
  // ability-only (empty PropertyList) have nothing unconditional to tabulate.
  const setBonuses: SetBonusRow[] = raw.relicSetSkills
    .filter((s) => s.RequireNum === 2 && releasedSets.has(s.SetID) && s.PropertyList.length > 0)
    .map((s) => {
      const where = `set ${s.SetID}`;
      const { modifiers, unsupported } = collectBonuses(
        s.PropertyList.map((e) => readObfuscatedProperty(e, where)),
        where,
      );
      return {
        setId: String(s.SetID),
        pieces: 2 as const,
        modifiers,
        unsupported,
        hasAbilityPart: Boolean(s.AbilityName),
      };
    })
    .sort((x, y) => byNumber(x.setId, y.setId));

  // Stat traces: export `stat_N` = skill-tree anchor `Point(N + 8)`
  // (Reliquary Archiver `export_skill_tree`, converters.rs @ 5e50dcb).
  const seenPoints = new Set<number>();
  const traces: TraceRow[] = [];
  for (const p of raw.skillTree) {
    if (p.PointType !== 1 || !releasedAvatars.has(p.AvatarID)) continue;
    const anchor = /^Point(\d+)$/.exec(p.AnchorType);
    const n = anchor ? Number(anchor[1]) - 8 : NaN;
    if (!(n >= 1 && n <= 10)) throw new Error(`point ${p.PointID}: stat point at unexpected anchor ${p.AnchorType}`);
    if (seenPoints.has(p.PointID)) throw new Error(`point ${p.PointID}: more than one level`);
    seenPoints.add(p.PointID);
    const id = String(p.PointID);
    const tree: TraceTree = id.length === String(p.AvatarID).length + 3 ? 'base' : 'enhanced';
    if (tree === 'enhanced' && !id.startsWith(`1${p.AvatarID}`)) throw new Error(`point ${id}: unexpected ID shape`);
    const where = `point ${id}`;
    const { modifiers, unsupported } = collectBonuses(
      p.StatusAddList.map((s) => ({ property: s.PropertyType, value: v(s.Value) })),
      where,
    );
    traces.push({ characterId: String(p.AvatarID), tree, trace: `stat_${n}` as StatTrace, pointId: id, modifiers, unsupported });
  }
  traces.sort((x, y) => byNumber(x.characterId, y.characterId) || x.tree.localeCompare(y.tree) || byNumber(x.pointId, y.pointId));

  // Break DMG level multipliers, one row per attacker level, copied as is.
  const seenLevels = new Set<number>();
  const breakLevelMultipliers: BreakLevelMultiplierRow[] = raw.avatarBreakDamage
    .map((r) => {
      if (!Number.isInteger(r.Level) || seenLevels.has(r.Level)) throw new Error(`break level ${r.Level}: duplicate or not an integer`);
      seenLevels.add(r.Level);
      const value = v(r.BreakBaseDamage);
      if (!(value > 0)) throw new Error(`break level ${r.Level}: BreakBaseDamage ${value} is not positive`);
      return { level: r.Level, value };
    })
    .sort((x, y) => x.level - y.level);

  return { characters, lightCones, relicMainStats, setBonuses, traces, breakLevelMultipliers };
}

// --- Display names (Traditional Chinese) ------------------------------------

/** A text-map reference. Hashes are 64-bit, so the loader keeps them as strings. */
export interface TextHash {
  Hash: string;
}
export interface RawNamedAvatar extends RawAvatar {
  AvatarName: TextHash;
  AvatarBaseType: string;
}
export interface RawNamedEquipment extends RawEquipment {
  EquipmentName: TextHash;
  AvatarBaseType: string;
}
export interface RawNamedRelicSet extends RawRelicSet {
  SetName: TextHash;
}
export interface RawAvatarBaseType {
  /** Missing on the "general" row, which no character or light cone uses. */
  ID?: string;
  BaseTypeText: TextHash;
}
export interface RawMultiplePathAvatar {
  AvatarID: number;
  Gender?: string;
}
export interface RawNamesA {
  avatars: RawNamedAvatar[];
  equipment: RawNamedEquipment[];
  relicSets: RawNamedRelicSet[];
  baseTypes: RawAvatarBaseType[];
  multiplePathAvatars: RawMultiplePathAvatar[];
  /** `TextMap/TextMapCHT.json`: hash → text. */
  textMap: Record<string, string>;
}

export interface PathNameRow {
  id: string;
  name: string;
}
export interface CharacterNameRow {
  id: string;
  name: string | null;
  path: string;
  gender?: 'male' | 'female';
}
export interface LightConeNameRow {
  id: string;
  name: string;
  path: string;
}
export interface RelicSetNameRow {
  setId: string;
  name: string;
}
export interface NamesA {
  paths: PathNameRow[];
  characters: CharacterNameRow[];
  lightCones: LightConeNameRow[];
  relicSets: RelicSetNameRow[];
}

/** The text the game swaps for the player's nickname. */
export const NICKNAME_PLACEHOLDER = '{NICKNAME}';

/**
 * Removes the one markup tag seen in names (`<unbreak>`, a no-line-break hint
 * around "999" in 1506's name) and rejects anything else that looks like
 * markup, so a new tag fails the generator instead of reaching the UI.
 */
export function cleanName(text: string, where: string): string {
  const s = text.replace(/<\/?unbreak>/g, '');
  if (/[<>{}]/.test(s)) throw new Error(`${where}: unexpected markup in ${JSON.stringify(text)}`);
  if (s === '' || s !== s.trim()) throw new Error(`${where}: empty or untrimmed name ${JSON.stringify(text)}`);
  return s;
}

const GENDERS: Readonly<Record<string, 'male' | 'female'>> = { GENDER_MAN: 'male', GENDER_WOMAN: 'female' };

export function transformNames(raw: RawNamesA): NamesA {
  const text = (h: TextHash | undefined, where: string): string => {
    const t = h ? raw.textMap[h.Hash] : undefined;
    if (t === undefined) throw new Error(`${where}: text hash ${h?.Hash ?? '(none)'} is not in the text map`);
    return t;
  };

  const paths: PathNameRow[] = raw.baseTypes
    .filter((b): b is RawAvatarBaseType & { ID: string } => typeof b.ID === 'string')
    .map((b) => ({ id: b.ID, name: cleanName(text(b.BaseTypeText, `path ${b.ID}`), `path ${b.ID}`) }))
    .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const pathIds = new Set(paths.map((p) => p.id));
  const checkPath = (path: string, where: string): string => {
    if (!pathIds.has(path)) throw new Error(`${where}: unknown path ${path}`);
    return path;
  };

  const genders = new Map(raw.multiplePathAvatars.map((m) => [m.AvatarID, m.Gender]));
  const characters: CharacterNameRow[] = raw.avatars
    .filter((a) => a.Release === true)
    .map((a) => {
      const where = `avatar ${a.AvatarID}`;
      const t = text(a.AvatarName, where);
      const path = checkPath(a.AvatarBaseType, where);
      if (t !== NICKNAME_PLACEHOLDER) return { id: String(a.AvatarID), name: cleanName(t, where), path };
      const gender = GENDERS[genders.get(a.AvatarID) ?? ''];
      if (!gender) throw new Error(`${where}: nickname character without a multi-path gender`);
      return { id: String(a.AvatarID), name: null, path, gender };
    })
    .sort((x, y) => byNumber(x.id, y.id));

  const lightCones: LightConeNameRow[] = raw.equipment
    .filter((e) => e.Release === true)
    .map((e) => {
      const where = `light cone ${e.EquipmentID}`;
      return {
        id: String(e.EquipmentID),
        name: cleanName(text(e.EquipmentName, where), where),
        path: checkPath(e.AvatarBaseType, where),
      };
    })
    .sort((x, y) => byNumber(x.id, y.id));

  const relicSets: RelicSetNameRow[] = raw.relicSets
    .filter((s) => s.Release === true)
    .map((s) => ({ setId: String(s.SetID), name: cleanName(text(s.SetName, `set ${s.SetID}`), `set ${s.SetID}`) }))
    .sort((x, y) => byNumber(x.setId, y.setId));

  return { paths, characters, lightCones, relicSets };
}

/**
 * Text-map hashes are unsigned 64-bit integers, which `JSON.parse` would
 * round. Quote them before parsing so they stay exact.
 */
export function parseExcelJson(text: string): unknown {
  return JSON.parse(text.replace(/"Hash":\s*(-?\d+)/g, '"Hash":"$1"'));
}
