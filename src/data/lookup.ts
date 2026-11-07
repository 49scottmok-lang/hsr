/**
 * Table lookups for the account import (I2) and the UI. Values are computed
 * from the stored per-ascension numbers with the engine's documented level
 * formulas; the tables never contain per-level values.
 */
import { formulas } from '../engine';
import type { BaseStats, Element, StatModifier } from '../engine';
import type {
  DataTables,
  RelicMainStatRecord,
  RelicSlot,
  SetBonusRecord,
  StatTrace,
  TraceRecord,
  TraceTree,
} from './schema';

export type Lookup<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const miss = (reason: string): Lookup<never> => ({ ok: false, reason });

/** Levels reachable at `ascension`: from the previous cap (or 1) to this cap. */
function levelRange(caps: readonly { maxLevel: number }[], ascension: number): readonly [number, number] | null {
  const cap = caps[ascension];
  if (!cap) return null;
  const prev = ascension === 0 ? 1 : (caps[ascension - 1]?.maxLevel ?? 1);
  return [prev, cap.maxLevel];
}

function checkLevel(caps: readonly { maxLevel: number }[], level: number, ascension: number): string | null {
  if (!Number.isInteger(level) || !Number.isInteger(ascension)) return 'level and ascension must be integers';
  const range = levelRange(caps, ascension);
  if (!range) return `ascension ${ascension} is not in the table`;
  if (level < range[0] || level > range[1]) {
    return `level ${level} is not reachable at ascension ${ascension} (${range[0]}–${range[1]})`;
  }
  return null;
}

export interface CharacterBase {
  readonly element: Element;
  readonly base: BaseStats & { readonly spd: number };
  readonly critRate: number;
  readonly critDmg: number;
}

export function characterBase(tables: DataTables, id: string, level: number, ascension: number): Lookup<CharacterBase> {
  const record = tables.characters.find((c) => c.id === id);
  if (!record) return miss(`character ${id} is not in the table`);
  const bad = checkLevel(record.ascensions, level, ascension);
  if (bad) return miss(`character ${id}: ${bad}`);
  // checkLevel guarantees the entry exists.
  const a = record.ascensions[ascension]!;
  return {
    ok: true,
    value: {
      element: record.element,
      base: {
        hp: formulas.promotedBaseStat(a.hp.base, a.hp.perLevel, level),
        atk: formulas.promotedBaseStat(a.atk.base, a.atk.perLevel, level),
        def: formulas.promotedBaseStat(a.def.base, a.def.perLevel, level),
        spd: a.spd,
      },
      critRate: a.critRate,
      critDmg: a.critDmg,
    },
  };
}

export function lightConeBase(tables: DataTables, id: string, level: number, ascension: number): Lookup<BaseStats> {
  const record = tables.lightCones.find((l) => l.id === id);
  if (!record) return miss(`light cone ${id} is not in the table`);
  const bad = checkLevel(record.ascensions, level, ascension);
  if (bad) return miss(`light cone ${id}: ${bad}`);
  const a = record.ascensions[ascension]!;
  return {
    ok: true,
    value: {
      hp: formulas.promotedBaseStat(a.hp.base, a.hp.perLevel, level),
      atk: formulas.promotedBaseStat(a.atk.base, a.atk.perLevel, level),
      def: formulas.promotedBaseStat(a.def.base, a.def.perLevel, level),
    },
  };
}

export interface RelicMainStat {
  readonly record: RelicMainStatRecord;
  /** `null` when the engine does not model the stat (e.g. Outgoing Healing Boost). */
  readonly modifier: StatModifier | null;
  readonly value: number;
}

/** `exportName` is the export's `mainstat` text; the slot decides flat vs percent. */
export function relicMainStat(
  tables: DataTables,
  slot: RelicSlot,
  rarity: number,
  exportName: string,
  level: number,
): Lookup<RelicMainStat> {
  const record = tables.relicMainStats.find(
    (r) => r.slot === slot && r.rarity === rarity && r.exportName === exportName,
  );
  if (!record) return miss(`no ${rarity}★ ${slot} main stat "${exportName}" in the table`);
  if (!Number.isInteger(level) || level < 0 || level > record.maxLevel) {
    return miss(`relic level ${level} is outside 0–${record.maxLevel}`);
  }
  const value = formulas.relicMainStatValue(record.value.base, record.value.perLevel, level);
  const modifier: StatModifier | null = record.target
    ? { stat: record.target.stat, value, ...(record.target.condition ? { condition: record.target.condition } : {}) }
    : null;
  return { ok: true, value: { record, modifier, value } };
}

export function setBonus2pc(tables: DataTables, setId: string): SetBonusRecord | undefined {
  return tables.setBonuses.find((s) => s.setId === setId && s.pieces === 2);
}

export function statTrace(
  tables: DataTables,
  characterId: string,
  trace: StatTrace,
  tree: TraceTree = 'base',
): TraceRecord | undefined {
  return tables.traces.find((t) => t.characterId === characterId && t.trace === trace && t.tree === tree);
}

/**
 * Break DMG level multiplier for an attacker at `level` (E4). Only levels the
 * source lists are returned; nothing is interpolated.
 */
export function breakLevelMultiplier(tables: DataTables, level: number): Lookup<number> {
  const record = tables.breakLevelMultipliers.find((r) => r.level === level);
  if (!record) return miss(`no break level multiplier for level ${level}`);
  return { ok: true, value: record.value };
}
