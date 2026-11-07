import { describe, expect, it } from 'vitest';
import { DATA_TABLES, validateDataTables } from '..';
import type { DataTables } from '..';
import { FIXTURE_TABLES } from './fixtures';

/** Replace one record in one table (tests only; casts let us build invalid records). */
function withRecord<K extends keyof DataTables>(table: K, record: unknown): DataTables {
  const rows = FIXTURE_TABLES[table] as readonly unknown[];
  return { ...FIXTURE_TABLES, [table]: [record, ...rows.slice(1)] } as DataTables;
}

const paths = (t: DataTables): string[] => validateDataTables(t).map((i) => i.path);

describe('validateDataTables', () => {
  it('accepts the shipped tables', () => {
    expect(validateDataTables(DATA_TABLES)).toEqual([]);
  });

  it('accepts the synthetic fixture', () => {
    expect(validateDataTables(FIXTURE_TABLES)).toEqual([]);
  });

  it('fails a record without a source', () => {
    const { source: _drop, ...rest } = FIXTURE_TABLES.characters[0]!;
    expect(paths(withRecord('characters', rest))).toContain('characters[0].source');
  });

  it('fails a record without a game version', () => {
    const { gameVersion: _drop, ...rest } = FIXTURE_TABLES.lightCones[0]!;
    expect(paths(withRecord('lightCones', rest))).toContain('lightCones[0].gameVersion');
  });

  it('fails a short commit SHA and an empty file list', () => {
    const t = FIXTURE_TABLES.traces[0]!;
    const bad = { ...t, source: { ...t.source, commit: 'abc1234', files: [] } };
    expect(paths(withRecord('traces', bad))).toEqual(['traces[0].source.commit', 'traces[0].source.files']);
  });

  it('fails a percentage stored in percent units (12 instead of 0.12)', () => {
    const s = FIXTURE_TABLES.setBonuses[0]!;
    const bad = { ...s, modifiers: [{ stat: 'atkPct', value: 12 }] };
    expect(paths(withRecord('setBonuses', bad))).toEqual(['setBonuses[0].modifiers[0].value']);
  });

  it('fails out-of-range base stats', () => {
    const c = FIXTURE_TABLES.characters[0]!;
    const a0 = c.ascensions[0]!;
    const bad = { ...c, ascensions: [{ ...a0, hp: { base: 0, perLevel: -1 }, spd: 1000, critRate: 1.5 }, c.ascensions[1]] };
    expect(paths(withRecord('characters', bad))).toEqual([
      'characters[0].ascensions[0].hp.base',
      'characters[0].ascensions[0].hp.perLevel',
      'characters[0].ascensions[0].spd',
      'characters[0].ascensions[0].critRate',
    ]);
  });

  it('fails out-of-order ascensions and non-increasing level caps', () => {
    const c = FIXTURE_TABLES.characters[0]!;
    const [a0, a1] = c.ascensions;
    const bad = { ...c, ascensions: [a1, { ...a0!, maxLevel: 30 }] };
    expect(paths(withRecord('characters', bad))).toEqual([
      'characters[0].ascensions[0].ascension',
      'characters[0].ascensions[1].ascension',
      'characters[0].ascensions[1].maxLevel',
    ]);
  });

  it('fails a relic main stat that is too large at max level', () => {
    const head = FIXTURE_TABLES.relicMainStats[0]!; // flat: 100 + 30 × 15 = 550 is fine
    const flatBad = { ...head, value: { base: 100, perLevel: 70 } }; // 100 + 1050 = 1150 > 1000
    expect(paths(withRecord('relicMainStats', flatBad))).toEqual(['relicMainStats[0].value (at max level)']);
    const pct = { ...FIXTURE_TABLES.relicMainStats[1]!, slot: 'Feet' }; // move it so no key repeats
    const pctBad = { ...pct, value: { base: 0.5, perLevel: 0.05 } }; // 0.5 + 0.75 = 1.25 > 100%
    expect(paths(withRecord('relicMainStats', pctBad))).toEqual(['relicMainStats[0].value (at max level)']);
  });

  it('fails duplicate keys and unknown stats', () => {
    const t = FIXTURE_TABLES.traces[0]!;
    const tables = { ...FIXTURE_TABLES, traces: [t, { ...t, modifiers: [{ stat: 'luck', value: 0.1 }] }] } as DataTables;
    expect(paths(tables)).toEqual(['traces[1].modifiers[0].stat', 'traces[1]']);
  });
});
