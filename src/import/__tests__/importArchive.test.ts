/**
 * I2 + I3: import the synthetic export against synthetic tables and check the
 * final stats against hand-computed values. TEST FIXTURE — NOT GAME DATA.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState, resolveUnitStats } from '../../engine';
import type { CharacterBuild, EnemyConfig } from '../../engine';
import { validateDataTables } from '../../data';
import { importArchive, parseArchive } from '..';
import type { Archive } from '..';
import { archiveFixture } from './fixtures';
import { IMPORT_TABLES } from './tables';

const ENEMY: EnemyConfig = { id: 'e1', name: 'Dummy', level: 80, res: {} };

function parse(json: Record<string, unknown> = archiveFixture()): Archive {
  const r = parseArchive(json);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.archive;
}

const stats = (build: CharacterBuild, element?: 'fire') =>
  resolveUnitStats(
    createInitialState([build], [ENEMY]),
    build.id,
    element ? { element, tags: ['skill'], counterpartId: ENEMY.id } : undefined,
  );

describe('importArchive (I2) with the synthetic fixture (I3)', () => {
  it('the fixture tables are valid', () => {
    expect(validateDataTables(IMPORT_TABLES)).toEqual([]);
  });

  const { builds, report } = importArchive(parse(), IMPORT_TABLES);
  const build = builds[0]!;

  it('builds the covered character and reports the uncovered one', () => {
    expect(builds.map((b) => b.id)).toEqual(['9001']);
    // The game ID doubles as the portrait key (characterId) for the UI.
    expect(builds.map((b) => b.characterId)).toEqual(['9001']);
    expect(report.builds.map((b) => [b.characterId, b.built])).toEqual([
      ['9001', true],
      ['9002', false],
    ]);
    expect(report.builds[1]!.problems).toEqual([
      { kind: 'tableMiss', what: 'character', message: 'character 9002 is not in the table' },
    ]);
    expect(report.dropped).toEqual({ lightCones: 1, relics: 1 });
  });

  it('fills level, eidolon, element, base stats and light cone from the tables', () => {
    expect(build).toMatchObject({
      id: '9001',
      level: 80,
      eidolon: 2,
      element: 'fire',
      base: { hp: 900, atk: 455, def: 445, spd: 100 }, // 110 + 10×79, 60 + 5×79, 50 + 5×79
      baseCritRate: 0.05,
      baseCritDmg: 0.5,
      lightCone: { name: 'Test Cone', superimposition: 3, base: { hp: 495, atk: 440, def: 420 }, effects: [] }, // 100 + 5×79 …
    });
  });

  it('converts relics: main stat from the table, substats ÷ 100 for `_` keys', () => {
    const expected: [string, number][] = [
      ['hpFlat', 550], // Head HP +15: 100 + 30 × 15
      ['critRate', 0.0648], // 6.48%
      ['atkFlat', 38.1],
      ['critDmg', 0.34], // Body CRIT DMG +12: 0.1 + 0.02 × 12
      ['spdFlat', 4.6],
    ];
    const got = build.relics?.stats ?? [];
    expect(got.map((m) => m.stat)).toEqual(expected.map(([s]) => s));
    expected.forEach(([, v], i) => expect(got[i]!.value).toBeCloseTo(v, 12));
    expect(got.every((m) => m.condition === undefined)).toBe(true);
    expect(build.relics?.setEffects).toEqual([
      {
        id: 'set-9201-2pc',
        name: 'Test Set (2-piece, unconditional part)',
        kind: 'buff',
        modifiers: [{ stat: 'atkPct', value: 0.1 }],
        source: 'example/import-fixture@fedcba9 (fixture.json), game 1.0',
      },
    ]);
  });

  it('applies unlocked stat traces only (stat_3 is locked)', () => {
    expect(build.traces).toEqual([
      { stat: 'atkPct', value: 0.04 },
      { stat: 'critDmg', value: 0.05 },
      { stat: 'spdFlat', value: 2 },
      { stat: 'dmgBoost', value: 0.032, condition: { elements: ['fire'] } },
    ]);
  });

  it('final stats match the hand computation', () => {
    const s = stats(build);
    expect(s.hp).toBeCloseTo(1945, 9); // (900 + 495) × 1 + 550
    expect(s.atk).toBeCloseTo(1058.4, 9); // (455 + 440) × (1 + 0.1 + 0.04) + 38.1 = 1020.3 + 38.1
    expect(s.def).toBeCloseTo(865, 9); // 445 + 420
    expect(s.spd).toBeCloseTo(106.6, 9); // 100 + 4.6 + 2
    expect(s.critRate).toBeCloseTo(0.1148, 9); // 0.05 + 0.0648
    expect(s.critDmg).toBeCloseTo(0.89, 9); // 0.5 + 0.34 + 0.05
    expect(s.dmgBoost).toBe(0); // the Fire trace is conditional
    expect(stats(build, 'fire').dmgBoost).toBeCloseTo(0.032, 12);
  });

  it('reports what was looked up and what is left to enter', () => {
    const r = report.builds[0]!;
    expect(r.lookedUp.map((i) => i.kind)).toEqual([
      'characterBase',
      'breakLevelMultiplier',
      'lightConeBase',
      'relicMainStat',
      'relicMainStat',
      'setBonus2pc',
      'trace',
      'trace',
      'trace',
      'trace',
    ]);
    expect(r.toEnter.map((i) => i.kind)).toEqual(['kit', 'eidolonEffects', 'lightConePassive']);
    expect(r.toEnter[2]).toMatchObject({ lightConeId: '9101', superimposition: 3 });
    expect(r.problems).toEqual([]);
  });

  it('fills the break level multiplier for the build level from the table', () => {
    expect(builds[0]!.breakLevelMultiplier).toBe(4000); // fixture row for level 80
  });

  it('reports a table miss, and leaves the field out, when the level has no break row', () => {
    const tables = { ...IMPORT_TABLES, breakLevelMultipliers: [] };
    const out = importArchive(parse(), tables);
    expect(out.builds[0]!.breakLevelMultiplier).toBeUndefined();
    expect(out.report.builds[0]!.problems).toContainEqual({
      kind: 'tableMiss',
      what: 'breakLevelMultiplier',
      message: 'no break level multiplier for level 80',
    });
  });
});

describe('importArchive edge cases', () => {
  const char = (overrides: Record<string, unknown>) => {
    const json = archiveFixture();
    const chars = json['characters'] as Record<string, unknown>[];
    return { ...json, characters: [{ ...chars[0], ...overrides }] };
  };
  const relicsOf = (relics: Record<string, unknown>[]) => ({ ...archiveFixture(), relics });
  const piece = (slot: string, setId: string, mainstat = 'HP') => ({
    set_id: setId,
    name: `Set ${setId}`,
    slot,
    rarity: 5,
    level: 0,
    mainstat,
    substats: [],
    location: '9001',
  });

  it('a non-zero ability_version uses the enhanced tree and says so', () => {
    const { builds, report } = importArchive(parse(char({ ability_version: 1 })), IMPORT_TABLES);
    expect(builds[0]!.traces).toEqual([{ stat: 'critDmg', value: 0.04 }]);
    const problems = report.builds[0]!.problems;
    expect(problems[0]).toMatchObject({ kind: 'traceTree', tree: 'enhanced' });
    // stat_2, stat_4 and stat_10 have no enhanced rows in the fixture.
    expect(problems.filter((p) => p.kind === 'tableMiss').length).toBe(3);
  });

  it('sets: 4-piece and ability parts are left to the user; unknown sets are flagged', () => {
    const json = relicsOf([
      piece('Head', '9201'),
      piece('Hands', '9201', 'ATK'),
      piece('Body', '9201', 'CRIT DMG'),
      piece('Feet', '9201', 'SPD'),
      piece('Planar Sphere', '9203', 'Fire DMG Boost'),
      piece('Link Rope', '9203', 'Break Effect'),
    ]);
    const { report } = importArchive(parse(json), IMPORT_TABLES);
    const toEnter = report.builds[0]!.toEnter.map((i) => i.kind);
    expect(toEnter).toContain('setBonus4pc');
    expect(toEnter).toContain('setBonus2pcAbility');
    // Hands ATK, Feet SPD, Sphere and Rope main stats are not in the fixture table.
    const misses = report.builds[0]!.problems.filter((p) => p.kind === 'tableMiss' && p.what === 'relicMainStat');
    expect(misses).toHaveLength(4);

    const unknown = importArchive(parse(relicsOf([piece('Head', '9999'), piece('Body', '9999', 'CRIT DMG')])), IMPORT_TABLES);
    expect(unknown.report.builds[0]!.toEnter).toContainEqual({
      kind: 'setBonus2pc',
      setId: '9999',
      setName: 'Set 9999',
      message: 'Set 9999 2-piece bonus: not in the stat table',
    });
  });

  it('a main stat the engine does not model is reported, not dropped silently', () => {
    const { builds, report } = importArchive(parse(relicsOf([piece('Body', '9201', 'Outgoing Healing Boost')])), IMPORT_TABLES);
    expect(builds[0]!.relics?.stats).toEqual([]);
    expect(report.builds[0]!.problems).toContainEqual(
      expect.objectContaining({ kind: 'unsupportedStat', property: 'HealRatioBase', value: 0.03 }),
    );
  });

  it('E0 needs no eidolon effects; does not mutate its inputs', () => {
    const archive = parse(char({ eidolon: 0 }));
    const before = JSON.stringify(archive);
    const { report } = importArchive(archive, IMPORT_TABLES);
    expect(report.builds[0]!.toEnter.map((i) => i.kind)).toEqual(['kit', 'lightConePassive']);
    expect(JSON.stringify(archive)).toBe(before);
  });
});
