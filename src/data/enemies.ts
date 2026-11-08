/**
 * Endgame enemies (added 2026-11-08): the top floor of the latest Memory of
 * Chaos, Pure Fiction and Apocalyptic Shadow rotations in the pinned build
 * (schema.ts § Endgame enemies). `stageEnemies` applies the stage's level and
 * elite scaling (docs/FORMULAS.md § Enemy stats); `stageEnemyConfig` turns a
 * result into an engine `EnemyConfig`.
 */
import { DOT_TYPES, ELEMENTS, formulas } from '../engine';
import type { EnemyConfig } from '../engine';
import { ELITE_GROUPS } from './generated/eliteGroups';
import { ENDGAME_STAGES } from './generated/endgameStages';
import { ENEMIES } from './generated/enemies';
import { ENEMY_LEVELS } from './generated/enemyLevels';
import type { Lookup } from './lookup';
import { ENDGAME_MODES, ENEMY_RANKS } from './schema';
import type { EndgameMode, EndgameStageRecord, EnemyBaseStat, EnemyRecord, EnemyStatRatios, EnemyTables } from './schema';
import { checkCited, checkUnique } from './validate';
import type { DataIssue, Push } from './validate';

export const ENEMY_TABLES: EnemyTables = {
  enemies: ENEMIES,
  levels: ENEMY_LEVELS,
  eliteGroups: ELITE_GROUPS,
  stages: ENDGAME_STAGES,
};

/** One enemy of a stage, with its stats at that stage. */
export interface StageEnemy {
  readonly enemy: EnemyRecord;
  /** 1-based wave and slot within the wave. */
  readonly wave: number;
  readonly slot: number;
  readonly level: number;
  readonly hp: number;
  readonly def: number;
  readonly spd: number;
  /** Displayed Toughness units, as `EnemyConfig.maxToughness`. */
  readonly toughness: number;
  /** Template Effect RES plus the level row's bonus. */
  readonly effectRes: number;
}

/** Stages of one mode, newest rotation first, then by node. */
export function endgameStages(tables: EnemyTables, mode: EndgameMode): readonly EndgameStageRecord[] {
  return tables.stages
    .filter((s) => s.mode === mode)
    .sort((a, b) => (a.startDate === b.startDate ? a.node - b.node : a.startDate < b.startDate ? 1 : -1));
}

const scaled = (s: EnemyBaseStat, key: keyof EnemyStatRatios, groups: readonly EnemyStatRatios[]): number =>
  formulas.enemyStageStat(s.base, [s.ratio, ...groups.map((g) => g[key])], s.add);

/** Every enemy of `stageId`, wave by wave, scaled to the stage. */
export function stageEnemies(tables: EnemyTables, stageId: string): Lookup<readonly (readonly StageEnemy[])[]> {
  const stage = tables.stages.find((s) => s.id === stageId);
  if (!stage) return { ok: false, reason: `stage ${stageId} is not in the table` };
  const level = tables.levels.find((l) => l.group === stage.levelGroup && l.level === stage.level);
  if (!level) return { ok: false, reason: `stage ${stageId}: no level row ${stage.levelGroup}/${stage.level}` };
  let stageElite: EnemyStatRatios | undefined;
  if (stage.eliteGroup !== null) {
    stageElite = tables.eliteGroups.find((e) => e.id === stage.eliteGroup)?.ratios;
    if (!stageElite) return { ok: false, reason: `stage ${stageId}: no elite group ${stage.eliteGroup}` };
  }

  const waves: StageEnemy[][] = [];
  for (const [w, ids] of stage.waves.entries()) {
    const wave: StageEnemy[] = [];
    for (const [s, id] of ids.entries()) {
      const enemy = tables.enemies.find((e) => e.id === id);
      if (!enemy) return { ok: false, reason: `stage ${stageId}: enemy ${id} is not in the table` };
      const own = tables.eliteGroups.find((e) => e.id === enemy.eliteGroup)?.ratios;
      if (!own) return { ok: false, reason: `enemy ${id}: no elite group ${enemy.eliteGroup}` };
      // Order matches docs/FORMULAS.md § Enemy stats; multiplication is commutative anyway.
      const groups = stageElite ? [own, stageElite, level.ratios] : [own, level.ratios];
      wave.push({
        enemy,
        wave: w + 1,
        slot: s + 1,
        level: stage.level,
        hp: scaled(enemy.hp, 'hp', groups),
        def: scaled(enemy.def, 'def', groups),
        spd: scaled(enemy.spd, 'spd', groups),
        toughness: scaled(enemy.stance, 'stance', groups) / formulas.STANCE_PER_TOUGHNESS,
        effectRes: enemy.effectRes + level.effectRes,
      });
    }
    waves.push(wave);
  }
  return { ok: true, value: waves };
}

/**
 * The engine's enemy input for a stage enemy. `baseDef` is set only when the
 * stage DEF differs from `formulas.enemyBaseDef(level)`, so a later level edit
 * still moves DEF. `spd` is for the turn order helper; HP is not part of
 * `EnemyConfig` (the engine never caps damage by HP).
 */
export function stageEnemyConfig(e: StageEnemy, unitId: string): EnemyConfig {
  const config: EnemyConfig = {
    id: unitId,
    name: e.enemy.name,
    level: e.level,
    res: { ...e.enemy.res },
    maxToughness: e.toughness,
    effectRes: e.effectRes,
    debuffRes: { ...e.enemy.debuffRes },
    spd: e.spd,
  };
  const levelDef = formulas.enemyBaseDef(e.level);
  if (Math.abs(e.def - levelDef) > DEF_TOLERANCE * levelDef) config.baseDef = e.def;
  return config;
}

/**
 * Relative gap below which a stage DEF counts as `200 + 10 × level`. The source's
 * level ratios are rounded (`210 × 5.47619 = 1149.9999`), so exact equality
 * would set a spurious `baseDef` (docs/FORMULAS.md § Enemy stats).
 */
export const DEF_TOLERANCE = 1e-4;

// --- Validation ---------------------------------------------------------------

/** [ENGINE] sanity bounds against extraction bugs, not claims about the game. */
export const ENEMY_LIMITS = {
  level: 200,
  /** RES, Effect RES and Debuff RES as fractions. */
  res: { min: -1, max: 2 },
  base: 1e7,
  ratio: 1e5,
} as const;

const ID_RE = /^\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bounded(push: Push, path: string, v: number, min: number, max: number): void {
  if (!Number.isFinite(v) || v < min || v > max) push(path, `${v} is outside [${min}, ${max}]`);
}

function checkStat(push: Push, path: string, s: EnemyBaseStat): void {
  bounded(push, `${path}.base`, s.base, 0, ENEMY_LIMITS.base);
  if (!(s.ratio > 0)) push(`${path}.ratio`, `must be positive, got ${s.ratio}`);
  bounded(push, `${path}.ratio`, s.ratio, 0, ENEMY_LIMITS.ratio);
  bounded(push, `${path}.add`, s.add, -ENEMY_LIMITS.base, ENEMY_LIMITS.base);
}

function checkRatios(push: Push, path: string, r: EnemyStatRatios): void {
  for (const k of ['hp', 'def', 'spd', 'stance'] as const) {
    if (!(r[k] > 0) || r[k] > ENEMY_LIMITS.ratio) push(`${path}.${k}`, `must be in (0, ${ENEMY_LIMITS.ratio}], got ${r[k]}`);
  }
}

/** Returns every problem found; an empty list means the enemy tables are valid. */
export function validateEnemyTables(tables: EnemyTables): DataIssue[] {
  const issues: DataIssue[] = [];
  const push: Push = (path, message) => issues.push({ path, message });
  const { min, max } = ENEMY_LIMITS.res;

  tables.enemies.forEach((e, i) => {
    const p = `enemies[${i}]`;
    checkCited(push, p, e);
    if (!ID_RE.test(e.id)) push(`${p}.id`, 'must be a numeric ID');
    if (!ID_RE.test(e.templateId)) push(`${p}.templateId`, 'must be a numeric ID');
    if (typeof e.name !== 'string' || e.name === '' || /[<>{}]/.test(e.name)) push(`${p}.name`, 'must be plain non-empty text');
    if (!(ENEMY_RANKS as readonly string[]).includes(e.rank)) push(`${p}.rank`, `unknown rank ${e.rank}`);
    e.weaknesses.forEach((w, j) => {
      if (!(ELEMENTS as readonly string[]).includes(w)) push(`${p}.weaknesses[${j}]`, `unknown element ${w}`);
    });
    for (const [k, v] of Object.entries(e.res)) {
      if (!(ELEMENTS as readonly string[]).includes(k)) push(`${p}.res`, `unknown element ${k}`);
      bounded(push, `${p}.res.${k}`, v, min, max);
    }
    for (const [k, v] of Object.entries(e.debuffRes)) {
      if (!(DOT_TYPES as readonly string[]).includes(k)) push(`${p}.debuffRes`, `unknown DoT type ${k}`);
      bounded(push, `${p}.debuffRes.${k}`, v, min, max);
    }
    checkStat(push, `${p}.hp`, e.hp);
    checkStat(push, `${p}.def`, e.def);
    checkStat(push, `${p}.spd`, e.spd);
    checkStat(push, `${p}.stance`, e.stance);
    bounded(push, `${p}.effectRes`, e.effectRes, min, max);
    if (!tables.eliteGroups.some((g) => g.id === e.eliteGroup)) push(`${p}.eliteGroup`, `unknown elite group ${e.eliteGroup}`);
  });
  checkUnique(push, 'enemies', tables.enemies.map((e) => e.id));

  tables.levels.forEach((l, i) => {
    const p = `levels[${i}]`;
    checkCited(push, p, l);
    if (!Number.isInteger(l.group) || !Number.isInteger(l.level)) push(p, 'group and level must be integers');
    bounded(push, `${p}.level`, l.level, 1, ENEMY_LIMITS.level);
    checkRatios(push, `${p}.ratios`, l.ratios);
    bounded(push, `${p}.effectRes`, l.effectRes, min, max);
  });
  checkUnique(push, 'levels', tables.levels.map((l) => `${l.group}/${l.level}`));

  tables.eliteGroups.forEach((g, i) => {
    checkCited(push, `eliteGroups[${i}]`, g);
    checkRatios(push, `eliteGroups[${i}].ratios`, g.ratios);
  });
  checkUnique(push, 'eliteGroups', tables.eliteGroups.map((g) => String(g.id)));

  const enemyIds = new Set(tables.enemies.map((e) => e.id));
  tables.stages.forEach((s, i) => {
    const p = `stages[${i}]`;
    checkCited(push, p, s);
    if (!ID_RE.test(s.id) || !ID_RE.test(s.groupId)) push(p, 'id and groupId must be numeric IDs');
    if (!(ENDGAME_MODES as readonly string[]).includes(s.mode)) push(`${p}.mode`, `unknown mode ${s.mode}`);
    if (!s.groupName || /[<>{}]/.test(s.groupName)) push(`${p}.groupName`, 'must be plain non-empty text');
    if (!DATE_RE.test(s.startDate)) push(`${p}.startDate`, 'must be YYYY-MM-DD');
    if (!Number.isInteger(s.node) || s.node < 1) push(`${p}.node`, 'must be an integer ≥ 1');
    if (!tables.levels.some((l) => l.group === s.levelGroup && l.level === s.level)) {
      push(`${p}.level`, `no level row ${s.levelGroup}/${s.level}`);
    }
    if (s.eliteGroup !== null && !tables.eliteGroups.some((g) => g.id === s.eliteGroup)) {
      push(`${p}.eliteGroup`, `unknown elite group ${s.eliteGroup}`);
    }
    if (s.waves.length === 0) push(`${p}.waves`, 'needs at least one wave');
    s.waves.forEach((w, j) => {
      if (w.length === 0) push(`${p}.waves[${j}]`, 'empty wave');
      w.forEach((id, k) => {
        if (!enemyIds.has(id)) push(`${p}.waves[${j}][${k}]`, `unknown enemy ${id}`);
      });
    });
  });
  checkUnique(push, 'stages', tables.stages.map((s) => s.id));

  return issues;
}
