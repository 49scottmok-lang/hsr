/**
 * Pure transform: source A's stage and monster tables → the endgame enemy
 * tables in `src/data` (added 2026-11-08). No I/O here; `extract.ts` does the
 * fetching and writing. Numbers are copied exactly; the stage scaling is
 * applied later by `src/data/enemies.ts`.
 *
 * Selection: for each endgame mode, the `groupsPerMode` latest rotations that
 * started on or before `cutoff`, and of each rotation only its top floor (every
 * node). A fixed cutoff keeps the output deterministic and excludes rotations
 * the pinned build already contains but that have not started (unreleased).
 *
 * Throws on anything unexpected so a format change fails loudly.
 */
import type { DotType, Element } from '../../src/engine/types.ts';
import { DAMAGE_TYPE_ELEMENTS } from '../../src/data/properties.ts';
import { ENEMY_RANKS } from '../../src/data/schema.ts';
import type { EndgameMode, EnemyBaseStat, EnemyRank, EnemyStatRatios } from '../../src/data/schema.ts';
import { cleanName } from './sourceA.ts';
import type { TextHash } from './sourceA.ts';

// --- Raw shapes (only the fields we read) -----------------------------------

interface Num {
  Value?: number;
}
export interface RawMonster {
  MonsterID: number;
  MonsterTemplateID: number;
  MonsterName: TextHash;
  EliteGroup: number;
  HPModifyRatio?: Num;
  DefenceModifyRatio?: Num;
  SpeedModifyRatio?: Num;
  SpeedModifyValue?: Num;
  StanceModifyRatio?: Num;
  StanceModifyValue?: Num;
  StanceWeakList: string[];
  DamageTypeResistance: { DamageType: string; Value?: Num }[];
  DebuffResist: { Key: string; Value?: Num }[];
}
export interface RawMonsterTemplate {
  MonsterTemplateID: number;
  Rank: string;
  HPBase?: Num;
  DefenceBase?: Num;
  SpeedBase?: Num;
  SpeedModifyValue?: Num;
  StanceBase?: Num;
  StanceModifyValue?: Num;
  StatusResistanceBase?: Num;
}
interface RawRatios {
  HPRatio?: Num;
  DefenceRatio?: Num;
  SpeedRatio?: Num;
  StanceRatio?: Num;
}
export interface RawHardLevel extends RawRatios {
  HardLevelGroup: number;
  Level: number;
  StatusResistance?: Num;
}
export interface RawEliteGroup extends RawRatios {
  EliteGroup: number;
}
export interface RawStage {
  StageID: number;
  StageType: string;
  HardLevelGroup: number;
  Level: number;
  EliteGroup?: number;
  MonsterList: Record<string, number>[];
}
export interface RawChallengeGroup {
  GroupID: number;
  GroupName?: TextHash;
  ScheduleDataID?: number;
  TierceID?: number;
}
export interface RawChallengeMaze {
  ID: number;
  GroupID: number;
  Floor: number;
  EventIDList1: number[];
  EventIDList2: number[];
}
export interface RawSchedule {
  ID: number;
  BeginTime: string;
}
/** Third-node rows; the source obfuscates their column names, so they are read by shape. */
export type RawTierce = Record<string, unknown>;

export interface RawModeTables {
  groups: RawChallengeGroup[];
  mazes: RawChallengeMaze[];
  schedules: RawSchedule[];
  tierces: RawTierce[];
}

export interface RawEnemiesA {
  monsters: RawMonster[];
  templates: RawMonsterTemplate[];
  hardLevels: RawHardLevel[];
  eliteGroups: RawEliteGroup[];
  stages: RawStage[];
  modes: Record<EndgameMode, RawModeTables>;
  textMap: Record<string, string>;
}

export interface EnemySelection {
  /** `YYYY-MM-DD hh:mm:ss`, compared with the schedules' `BeginTime`. */
  cutoff: string;
  groupsPerMode: number;
}

// --- Output rows (records minus the citation fields) ------------------------

export interface EnemyRow {
  id: string;
  templateId: string;
  name: string;
  rank: EnemyRank;
  weaknesses: Element[];
  res: Partial<Record<Element, number>>;
  debuffRes: Partial<Record<DotType, number>>;
  hp: EnemyBaseStat;
  def: EnemyBaseStat;
  spd: EnemyBaseStat;
  stance: EnemyBaseStat;
  effectRes: number;
  eliteGroup: number;
}
export interface EnemyLevelRow {
  group: number;
  level: number;
  ratios: EnemyStatRatios;
  effectRes: number;
}
export interface EliteGroupRow {
  id: number;
  ratios: EnemyStatRatios;
}
export interface EndgameStageRow {
  id: string;
  mode: EndgameMode;
  groupId: string;
  groupName: string;
  startDate: string;
  floor: number;
  node: number;
  level: number;
  levelGroup: number;
  eliteGroup: number | null;
  waves: string[][];
}
export interface EnemiesA {
  enemies: EnemyRow[];
  levels: EnemyLevelRow[];
  eliteGroups: EliteGroupRow[];
  stages: EndgameStageRow[];
}

/**
 * `DebuffResist` keys for the four DoTs. Wind Shear is `STAT_DOT_Poison`: its
 * icon in `MonsterStatusResistanceType` is `IconImmuneWind.png`.
 */
export const DEBUFF_RES_DOT_TYPES: Readonly<Record<string, DotType>> = {
  STAT_DOT_Bleed: 'bleed',
  STAT_DOT_Burn: 'burn',
  STAT_DOT_Electric: 'shock',
  STAT_DOT_Poison: 'windShear',
};
/** `DebuffResist` keys the engine does not model; any other key fails the generator. */
export const UNMODELLED_DEBUFF_RES = [
  'STAT_CTRL',
  'STAT_CTRL_Frozen',
  'STAT_Confine',
  'STAT_DefenceDown',
  'STAT_Entangle',
  'STAT_Fatigue',
  'STAT_SpeedDown',
] as const;

// --- Helpers ----------------------------------------------------------------

/** The game omits zero values (`{}`), so a present but empty value is 0. */
const v = (n: Num | undefined): number => n?.Value ?? 0;

/** A ratio column must be present; `{}` would mean 0, which no multiplier should be. */
function ratio(n: Num | undefined, where: string): number {
  if (n === undefined) throw new Error(`${where}: missing ratio`);
  return v(n);
}

function ratios(r: RawRatios, where: string): EnemyStatRatios {
  return {
    hp: ratio(r.HPRatio, `${where}.HPRatio`),
    def: ratio(r.DefenceRatio, `${where}.DefenceRatio`),
    spd: ratio(r.SpeedRatio, `${where}.SpeedRatio`),
    stance: ratio(r.StanceRatio, `${where}.StanceRatio`),
  };
}

function element(damageType: string, where: string): Element {
  const e = DAMAGE_TYPE_ELEMENTS[damageType];
  if (!e) throw new Error(`${where}: unknown DamageType ${damageType}`);
  return e;
}

/** Template and variant flat additions; only one side may set one, so the stored value is a copy. */
function addition(template: Num | undefined, variant: Num | undefined, where: string): number {
  const t = v(template);
  const m = v(variant);
  if (t !== 0 && m !== 0) throw new Error(`${where}: both template and variant set a flat addition`);
  return t + m;
}

function waveIds(wave: Record<string, number>, where: string): string[] {
  return Object.entries(wave)
    .map(([key, id]) => {
      const m = /^Monster(\d+)$/.exec(key);
      if (!m?.[1]) throw new Error(`${where}: unexpected wave key ${key}`);
      return [Number(m[1]), id] as const;
    })
    .filter(([, id]) => id !== 0)
    .sort((a, b) => a[0] - b[0])
    .map(([, id]) => String(id));
}

/** Finds a group's third-node stages: the row naming both the tierce ID and the top floor, and its one stage-ID list. */
function tierceStages(rows: readonly RawTierce[], tierceId: number, floorId: number, stageIds: ReadonlySet<number>, where: string): number[] {
  const row = rows.find((r) => {
    const nums = Object.values(r).filter((x): x is number => typeof x === 'number');
    return nums.includes(tierceId) && nums.includes(floorId);
  });
  if (!row) return [];
  const lists = Object.values(row).filter(
    (x): x is number[] => Array.isArray(x) && x.length > 0 && x.every((n) => typeof n === 'number' && stageIds.has(n)),
  );
  if (lists.length !== 1) throw new Error(`${where}: third node has ${lists.length} stage lists, expected 1`);
  return lists[0]!;
}

const MODE_ORDER: readonly EndgameMode[] = ['memory', 'story', 'boss'];

// --- Transform --------------------------------------------------------------

export function transformEnemies(raw: RawEnemiesA, selection: EnemySelection): EnemiesA {
  const text = (h: TextHash | undefined, where: string): string => {
    const t = h ? raw.textMap[h.Hash] : undefined;
    if (t === undefined) throw new Error(`${where}: text hash ${h?.Hash ?? '(none)'} is not in the text map`);
    return cleanName(t, where);
  };
  const stagesById = new Map(raw.stages.map((s) => [s.StageID, s]));
  const challengeStageIds = new Set(raw.stages.filter((s) => s.StageType === 'Challenge').map((s) => s.StageID));

  const stages: EndgameStageRow[] = [];
  for (const mode of MODE_ORDER) {
    const t = raw.modes[mode];
    const begin = new Map(t.schedules.map((s) => [s.ID, s.BeginTime]));
    const started = t.groups
      .map((g) => ({ g, start: g.ScheduleDataID === undefined ? undefined : begin.get(g.ScheduleDataID) }))
      .filter((x): x is { g: RawChallengeGroup; start: string } => x.start !== undefined && x.start <= selection.cutoff)
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.g.GroupID - b.g.GroupID));
    // Not `slice(-n)`: `slice(-0)` would keep every group.
    started.splice(0, Math.max(0, started.length - selection.groupsPerMode));

    for (const { g, start } of started) {
      const where = `${mode} group ${g.GroupID}`;
      const groupName = text(g.GroupName, where);
      const floors = t.mazes.filter((m) => m.GroupID === g.GroupID);
      const top = floors.reduce<RawChallengeMaze | undefined>((a, m) => (!a || m.Floor > a.Floor ? m : a), undefined);
      if (!top) throw new Error(`${where}: no floors`);
      const nodes: [number, number[]][] = [
        [1, top.EventIDList1],
        [2, top.EventIDList2],
      ];
      if (g.TierceID !== undefined) {
        const third = tierceStages(t.tierces, g.TierceID, top.ID, challengeStageIds, where);
        if (third.length > 0) nodes.push([3, third]);
      }
      for (const [node, ids] of nodes) {
        if (ids.length === 0) throw new Error(`${where} floor ${top.Floor} node ${node}: no stage`);
        for (const id of ids) {
          const s = stagesById.get(id);
          if (!s) throw new Error(`${where}: stage ${id} is not in StageConfig`);
          stages.push({
            id: String(id),
            mode,
            groupId: String(g.GroupID),
            groupName,
            startDate: start.slice(0, 10),
            floor: top.Floor,
            node,
            level: s.Level,
            levelGroup: s.HardLevelGroup,
            eliteGroup: s.EliteGroup ?? null,
            waves: s.MonsterList.map((w, i) => waveIds(w, `stage ${id} wave ${i + 1}`)).filter((w) => w.length > 0),
          });
        }
      }
    }
  }

  // Enemies the stages name.
  const monsters = new Map(raw.monsters.map((m) => [m.MonsterID, m]));
  const templates = new Map(raw.templates.map((t) => [t.MonsterTemplateID, t]));
  const enemyIds = [...new Set(stages.flatMap((s) => s.waves.flat()))].map(Number).sort((a, b) => a - b);
  const enemies: EnemyRow[] = enemyIds.map((id) => {
    const where = `monster ${id}`;
    const m = monsters.get(id);
    if (!m) throw new Error(`${where}: not in MonsterConfig`);
    const t = templates.get(m.MonsterTemplateID);
    if (!t) throw new Error(`${where}: template ${m.MonsterTemplateID} is not in MonsterTemplateConfig`);
    if (!(ENEMY_RANKS as readonly string[]).includes(t.Rank)) throw new Error(`${where}: unknown rank ${t.Rank}`);
    const res: Partial<Record<Element, number>> = {};
    for (const r of m.DamageTypeResistance) {
      const e = element(r.DamageType, where);
      if (e in res) throw new Error(`${where}: duplicate RES for ${r.DamageType}`);
      res[e] = v(r.Value);
    }
    const debuffRes: Partial<Record<DotType, number>> = {};
    for (const d of m.DebuffResist) {
      const dot = DEBUFF_RES_DOT_TYPES[d.Key];
      if (dot) debuffRes[dot] = v(d.Value);
      else if (!(UNMODELLED_DEBUFF_RES as readonly string[]).includes(d.Key)) throw new Error(`${where}: unknown DebuffResist ${d.Key}`);
    }
    return {
      id: String(id),
      templateId: String(m.MonsterTemplateID),
      name: text(m.MonsterName, where),
      rank: t.Rank as EnemyRank,
      weaknesses: m.StanceWeakList.map((w) => element(w, where)),
      res,
      debuffRes,
      hp: { base: v(t.HPBase), ratio: ratio(m.HPModifyRatio, `${where}.HPModifyRatio`), add: 0 },
      def: { base: v(t.DefenceBase), ratio: ratio(m.DefenceModifyRatio, `${where}.DefenceModifyRatio`), add: 0 },
      spd: {
        base: v(t.SpeedBase),
        ratio: ratio(m.SpeedModifyRatio, `${where}.SpeedModifyRatio`),
        add: addition(t.SpeedModifyValue, m.SpeedModifyValue, `${where} SPD`),
      },
      stance: {
        base: v(t.StanceBase),
        ratio: ratio(m.StanceModifyRatio, `${where}.StanceModifyRatio`),
        add: addition(t.StanceModifyValue, m.StanceModifyValue, `${where} stance`),
      },
      effectRes: v(t.StatusResistanceBase),
      eliteGroup: m.EliteGroup,
    };
  });

  // Level rows and elite groups the stages and enemies use.
  const levelKeys = new Set(stages.map((s) => `${s.levelGroup}/${s.level}`));
  const levels: EnemyLevelRow[] = raw.hardLevels
    .filter((h) => levelKeys.has(`${h.HardLevelGroup}/${h.Level}`))
    .map((h) => ({
      group: h.HardLevelGroup,
      level: h.Level,
      ratios: ratios(h, `HardLevelGroup ${h.HardLevelGroup} level ${h.Level}`),
      effectRes: v(h.StatusResistance),
    }))
    .sort((a, b) => a.group - b.group || a.level - b.level);
  if (levels.length !== levelKeys.size) throw new Error('a stage names a HardLevelGroup row that is missing or duplicated');

  const eliteIds = new Set([
    ...stages.flatMap((s) => (s.eliteGroup === null ? [] : [s.eliteGroup])),
    ...enemies.map((e) => e.eliteGroup),
  ]);
  const eliteGroups: EliteGroupRow[] = raw.eliteGroups
    .filter((e) => eliteIds.has(e.EliteGroup))
    .map((e) => ({ id: e.EliteGroup, ratios: ratios(e, `EliteGroup ${e.EliteGroup}`) }))
    .sort((a, b) => a.id - b.id);
  if (eliteGroups.length !== eliteIds.size) throw new Error('an elite group is missing or duplicated');

  return { enemies, levels, eliteGroups, stages };
}
