import { describe, expect, it } from 'vitest';
import { parseArchive } from '..';
import type { Archive } from '..';
import { FAKE_UID, archiveFixture } from './fixtures';

function parsedOk(json: unknown): { archive: Archive; warnings: readonly { path: string; message: string }[] } {
  const r = parseArchive(json);
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.errors)}`);
  return r;
}

/** The fixture with one list entry replaced or appended. */
function withEntry(list: 'characters' | 'light_cones' | 'relics', index: number, entry: unknown): Record<string, unknown> {
  const json = archiveFixture();
  const items = [...(json[list] as unknown[])];
  items[index] = entry;
  return { ...json, [list]: items };
}

const relic = (overrides: Record<string, unknown>) => ({
  ...((archiveFixture()['relics'] as Record<string, unknown>[])[0] ?? {}),
  ...overrides,
});

describe('parseArchive: file-level checks', () => {
  it('rejects a non-object', () => {
    expect(parseArchive([1, 2])).toMatchObject({ ok: false });
    expect(parseArchive(null)).toMatchObject({ ok: false });
  });

  it('rejects another tool’s file with a clear error', () => {
    const r = parseArchive({ ...archiveFixture(), source: 'hsr_scanner' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toEqual({
      path: 'source',
      message: 'expected "reliquary_archiver", got "hsr_scanner": not a Reliquary Archiver export',
    });
  });

  it('rejects an unsupported version with a clear error', () => {
    const r = parseArchive({ ...archiveFixture(), version: 5 });
    expect(!r.ok && r.errors).toEqual([{ path: 'version', message: 'unsupported export version 5; supported: 4' }]);
    expect(parseArchive({ ...archiveFixture(), version: '4' })).toMatchObject({ ok: false });
  });

  it('rejects missing lists', () => {
    const { relics: _drop, ...rest } = archiveFixture();
    const r = parseArchive(rest);
    expect(!r.ok && r.errors).toEqual([{ path: 'relics', message: 'must be an array' }]);
  });
});

describe('parseArchive: valid export', () => {
  const { archive, warnings } = parsedOk(archiveFixture());

  it('parses without warnings', () => {
    expect(warnings).toEqual([]);
    expect(archive.build).toBe('0.19.0');
    expect(archive.version).toBe(4);
  });

  it('drops the UID, gacha, materials and item UIDs entirely', () => {
    const text = JSON.stringify(archive);
    expect(text).not.toContain(String(FAKE_UID));
    expect(text).not.toMatch(/uid|gacha|stellar_jade|materials|Fake Material|lock|discard|preview/i);
    expect(Object.keys(archive).sort()).toEqual(['build', 'characters', 'dropped', 'lightCones', 'relics', 'source', 'version']);
  });

  it('keeps equipped items only and counts what it dropped', () => {
    expect(archive.lightCones.map((l) => l.id)).toEqual(['9101']);
    expect(archive.relics.map((r) => r.slot)).toEqual(['Head', 'Body']);
    expect(archive.dropped).toEqual({ lightCones: 1, relics: 1 });
  });

  it('normalises a character', () => {
    expect(archive.characters[0]).toEqual({
      id: '9001',
      name: 'Test Character',
      path: 'Hunt',
      level: 80,
      ascension: 6,
      eidolon: 2,
      skills: { basic: 6, skill: 10, ult: 10, talent: 10 },
      traces: {
        ability_1: true,
        ability_2: true,
        ability_3: false,
        stat_1: true,
        stat_2: true,
        stat_3: false,
        stat_4: true,
        stat_5: false,
        stat_6: false,
        stat_7: false,
        stat_8: false,
        stat_9: false,
        stat_10: true,
        special: false,
      },
      abilityVersion: 0,
    });
  });

  it('treats absent traces as locked and keeps optional skill fields', () => {
    const c = archive.characters[1]!;
    expect(Object.values(c.traces).filter(Boolean)).toHaveLength(1);
    expect(c.traces.stat_1).toBe(true);
    expect(c.skills.elation).toBe(2);
    expect(c.memosprite).toEqual({ skill: 4, talent: 4 });
  });

  it('keeps substat values in export units (I2 converts them)', () => {
    expect(archive.relics[0]!.substats).toEqual([
      { key: 'CRIT Rate_', value: 6.48, count: 2, step: 1 },
      { key: 'ATK', value: 38.1, count: 2, step: 2 },
    ]);
    expect(archive.lightCones[0]).toEqual({
      id: '9101',
      name: 'Test Cone',
      level: 80,
      ascension: 6,
      superimposition: 3,
      location: '9001',
    });
  });
});

describe('parseArchive: bad entries are skipped with a warning', () => {
  it('a character with an out-of-range level', () => {
    const json = withEntry('characters', 1, { ...(archiveFixture()['characters'] as object[])[1], level: 90 });
    const { archive, warnings } = parsedOk(json);
    expect(archive.characters.map((c) => c.id)).toEqual(['9001']);
    expect(warnings).toEqual([{ path: 'characters[1].level', message: 'must be an integer from 1 to 80' }]);
  });

  it('a relic with an unknown substat, slot or a level above 3 × rarity', () => {
    const cases: [Record<string, unknown>, string][] = [
      [relic({ substats: [{ key: 'Luck_', value: 1, count: 1, step: 0 }] }), 'relics[0].substats[0].key'],
      [relic({ slot: 'Hat' }), 'relics[0].slot'],
      [relic({ rarity: 4, level: 15 }), 'relics[0].level'],
    ];
    for (const [bad, path] of cases) {
      const { archive, warnings } = parsedOk(withEntry('relics', 0, bad));
      expect(archive.relics.map((r) => r.slot)).toEqual(['Body']);
      expect(warnings.map((w) => w.path)).toEqual([path]);
    }
  });

  it('items equipped by an unknown character, and a second item in the same place', () => {
    const lc = { id: '9103', name: 'X', level: 1, ascension: 0, superimposition: 1, location: '9001' };
    const json = withEntry('light_cones', 2, lc);
    json['relics'] = [...(json['relics'] as unknown[]), relic({ location: '7777' }), relic({})];
    const { archive, warnings } = parsedOk(json);
    expect(archive.lightCones.map((l) => l.id)).toEqual(['9101']);
    expect(archive.relics).toHaveLength(2);
    expect(warnings).toEqual([
      { path: 'light_cones[2]', message: 'character 9001 already has a light cone; kept the first' },
      { path: 'relics[3]', message: 'equipped by unknown character 7777; skipped' },
      { path: 'relics[4]', message: 'character 9001 already has a Head; kept the first' },
    ]);
  });

  it('a duplicate character', () => {
    const json = withEntry('characters', 2, (archiveFixture()['characters'] as object[])[0]);
    const { archive, warnings } = parsedOk(json);
    expect(archive.characters).toHaveLength(2);
    expect(warnings).toEqual([{ path: 'characters[2]', message: 'duplicate character 9001; kept the first' }]);
  });
});
