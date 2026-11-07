/**
 * Validator for the stat tables (TASKS D2). The bounds below are [ENGINE]
 * sanity limits that catch extraction bugs (wrong field, wrong units, a
 * percentage stored as 12 instead of 0.12). They are not claims about the
 * game: real values sit well inside them.
 */
import { ELEMENTS, STAT_KEYS } from '../engine';
import type { StatModifier } from '../engine';
import { isFlatStat } from './properties';
import { RELIC_SLOTS, STAT_TRACES } from './schema';
import type { Cited, DataTables, LevelScaled, UnsupportedProperty } from './schema';

export interface DataIssue {
  readonly path: string;
  readonly message: string;
}

export const DATA_LIMITS = {
  maxLevel: 80,
  maxAscensions: 7,
  baseStat: { min: 0, max: 5000 },
  perLevel: { min: 0, max: 500 },
  spd: { min: 50, max: 200 },
  critRate: { min: 0, max: 1 },
  critDmg: { min: 0, max: 5 },
  relicRarity: { min: 2, max: 5 },
  relicMaxLevel: 15,
  relicFlatMax: 1000,
  /** Largest flat value a trace or 2-piece bonus may grant. */
  bonusFlatMax: 100,
} as const;

const COMMIT_RE = /^[0-9a-f]{40}$/;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const VERSION_RE = /^\d+\.\d+(\.\d+)?$/;
const ID_RE = /^\d+$/;

type Push = (path: string, message: string) => void;

function inRange(push: Push, path: string, v: number, min: number, max: number, minExclusive = false): void {
  const low = minExclusive ? v <= min : v < min;
  if (!Number.isFinite(v) || low || v > max) {
    push(path, `${v} is outside ${minExclusive ? '(' : '['}${min}, ${max}]`);
  }
}

function checkCited(push: Push, path: string, r: Cited): void {
  // Records come from generated code, but a hand edit could drop these fields,
  // so check presence before shape.
  const source = (r as Partial<Cited>).source;
  if (!source) {
    push(`${path}.source`, 'missing source');
  } else {
    if (typeof source.repo !== 'string' || !REPO_RE.test(source.repo)) push(`${path}.source.repo`, 'must be owner/name');
    if (typeof source.commit !== 'string' || !COMMIT_RE.test(source.commit)) {
      push(`${path}.source.commit`, 'must be a full 40-character commit SHA');
    }
    if (!Array.isArray(source.files) || source.files.length === 0 || source.files.some((f) => !f)) {
      push(`${path}.source.files`, 'must list at least one file');
    }
  }
  const version = (r as Partial<Cited>).gameVersion;
  if (typeof version !== 'string' || !VERSION_RE.test(version)) push(`${path}.gameVersion`, 'missing or malformed');
}

function checkScaled(push: Push, path: string, s: LevelScaled): void {
  inRange(push, `${path}.base`, s.base, DATA_LIMITS.baseStat.min, DATA_LIMITS.baseStat.max, true);
  inRange(push, `${path}.perLevel`, s.perLevel, DATA_LIMITS.perLevel.min, DATA_LIMITS.perLevel.max);
}

function checkAscensions(
  push: Push,
  path: string,
  list: readonly { ascension: number; maxLevel: number }[],
): void {
  if (list.length === 0 || list.length > DATA_LIMITS.maxAscensions) {
    push(path, `needs 1–${DATA_LIMITS.maxAscensions} ascensions, got ${list.length}`);
  }
  let prevMax = 0;
  list.forEach((a, i) => {
    if (a.ascension !== i) push(`${path}[${i}].ascension`, `expected ${i}, got ${a.ascension}`);
    if (!Number.isInteger(a.maxLevel) || a.maxLevel <= prevMax || a.maxLevel > DATA_LIMITS.maxLevel) {
      push(`${path}[${i}].maxLevel`, `must be an integer above ${prevMax} and at most ${DATA_LIMITS.maxLevel}`);
    }
    prevMax = a.maxLevel;
  });
}

function checkModifiers(push: Push, path: string, mods: readonly StatModifier[]): void {
  mods.forEach((m, i) => {
    const p = `${path}[${i}]`;
    if (!(STAT_KEYS as readonly string[]).includes(m.stat)) push(`${p}.stat`, `unknown stat ${m.stat}`);
    const max = isFlatStat(m.stat) ? DATA_LIMITS.bonusFlatMax : 1;
    inRange(push, `${p}.value`, m.value, 0, max, true);
    for (const e of m.condition?.elements ?? []) {
      if (!(ELEMENTS as readonly string[]).includes(e)) push(`${p}.condition`, `unknown element ${e}`);
    }
  });
}

function checkUnsupported(push: Push, path: string, list: readonly UnsupportedProperty[]): void {
  list.forEach((u, i) => {
    if (!u.property) push(`${path}[${i}].property`, 'missing');
    inRange(push, `${path}[${i}].value`, u.value, 0, DATA_LIMITS.bonusFlatMax, true);
  });
}

function checkUnique(push: Push, path: string, keys: readonly string[]): void {
  const seen = new Set<string>();
  keys.forEach((k, i) => {
    if (seen.has(k)) push(`${path}[${i}]`, `duplicate key ${k}`);
    seen.add(k);
  });
}

/** Returns every problem found; an empty list means the tables are valid. */
export function validateDataTables(tables: DataTables): DataIssue[] {
  const issues: DataIssue[] = [];
  const push: Push = (path, message) => issues.push({ path, message });

  tables.characters.forEach((c, i) => {
    const p = `characters[${i}]`;
    checkCited(push, p, c);
    if (!ID_RE.test(c.id)) push(`${p}.id`, 'must be a numeric ID');
    if (!(ELEMENTS as readonly string[]).includes(c.element)) push(`${p}.element`, `unknown element ${c.element}`);
    checkAscensions(push, `${p}.ascensions`, c.ascensions);
    c.ascensions.forEach((a, j) => {
      const q = `${p}.ascensions[${j}]`;
      checkScaled(push, `${q}.hp`, a.hp);
      checkScaled(push, `${q}.atk`, a.atk);
      checkScaled(push, `${q}.def`, a.def);
      inRange(push, `${q}.spd`, a.spd, DATA_LIMITS.spd.min, DATA_LIMITS.spd.max);
      inRange(push, `${q}.critRate`, a.critRate, DATA_LIMITS.critRate.min, DATA_LIMITS.critRate.max);
      inRange(push, `${q}.critDmg`, a.critDmg, DATA_LIMITS.critDmg.min, DATA_LIMITS.critDmg.max);
    });
  });
  checkUnique(push, 'characters', tables.characters.map((c) => c.id));

  tables.lightCones.forEach((l, i) => {
    const p = `lightCones[${i}]`;
    checkCited(push, p, l);
    if (!ID_RE.test(l.id)) push(`${p}.id`, 'must be a numeric ID');
    checkAscensions(push, `${p}.ascensions`, l.ascensions);
    l.ascensions.forEach((a, j) => {
      const q = `${p}.ascensions[${j}]`;
      checkScaled(push, `${q}.hp`, a.hp);
      checkScaled(push, `${q}.atk`, a.atk);
      checkScaled(push, `${q}.def`, a.def);
    });
  });
  checkUnique(push, 'lightCones', tables.lightCones.map((l) => l.id));

  tables.relicMainStats.forEach((r, i) => {
    const p = `relicMainStats[${i}]`;
    checkCited(push, p, r);
    if (!(RELIC_SLOTS as readonly string[]).includes(r.slot)) push(`${p}.slot`, `unknown slot ${r.slot}`);
    if (!Number.isInteger(r.rarity)) push(`${p}.rarity`, 'must be an integer');
    inRange(push, `${p}.rarity`, r.rarity, DATA_LIMITS.relicRarity.min, DATA_LIMITS.relicRarity.max);
    if (!Number.isInteger(r.maxLevel)) push(`${p}.maxLevel`, 'must be an integer');
    inRange(push, `${p}.maxLevel`, r.maxLevel, 0, DATA_LIMITS.relicMaxLevel, true);
    if (!r.property) push(`${p}.property`, 'missing');
    if (!r.exportName) push(`${p}.exportName`, 'missing');
    if (r.target && !(STAT_KEYS as readonly string[]).includes(r.target.stat)) {
      push(`${p}.target.stat`, `unknown stat ${r.target.stat}`);
    }
    const flat = r.target ? isFlatStat(r.target.stat) : false;
    const atMax = r.value.base + r.value.perLevel * r.maxLevel;
    inRange(push, `${p}.value.base`, r.value.base, 0, flat ? DATA_LIMITS.relicFlatMax : 1, true);
    inRange(push, `${p}.value.perLevel`, r.value.perLevel, 0, flat ? DATA_LIMITS.relicFlatMax : 1);
    inRange(push, `${p}.value (at max level)`, atMax, 0, flat ? DATA_LIMITS.relicFlatMax : 1, true);
  });
  checkUnique(push, 'relicMainStats', tables.relicMainStats.map((r) => `${r.slot}/${r.rarity}/${r.exportName}`));

  tables.setBonuses.forEach((s, i) => {
    const p = `setBonuses[${i}]`;
    checkCited(push, p, s);
    if (!ID_RE.test(s.setId)) push(`${p}.setId`, 'must be a numeric ID');
    if (s.pieces !== 2) push(`${p}.pieces`, 'only 2-piece bonuses are tabulated');
    if (s.modifiers.length + s.unsupported.length === 0) push(p, 'has no stat bonus');
    checkModifiers(push, `${p}.modifiers`, s.modifiers);
    checkUnsupported(push, `${p}.unsupported`, s.unsupported);
  });
  checkUnique(push, 'setBonuses', tables.setBonuses.map((s) => `${s.setId}/${s.pieces}`));

  tables.traces.forEach((t, i) => {
    const p = `traces[${i}]`;
    checkCited(push, p, t);
    if (!ID_RE.test(t.characterId)) push(`${p}.characterId`, 'must be a numeric ID');
    if (!(STAT_TRACES as readonly string[]).includes(t.trace)) push(`${p}.trace`, `unknown trace ${t.trace}`);
    if (t.tree !== 'base' && t.tree !== 'enhanced') push(`${p}.tree`, `unknown tree ${String(t.tree)}`);
    if (t.modifiers.length + t.unsupported.length === 0) push(p, 'has no stat bonus');
    checkModifiers(push, `${p}.modifiers`, t.modifiers);
    checkUnsupported(push, `${p}.unsupported`, t.unsupported);
  });
  checkUnique(push, 'traces', tables.traces.map((t) => `${t.characterId}/${t.tree}/${t.trace}`));

  return issues;
}
