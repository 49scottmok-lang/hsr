import { describe, expect, it } from 'vitest';
import {
  DATA_TABLES,
  NAME_TABLES,
  characterName,
  lightConeName,
  pathName,
  relicSetName,
  validateNameTables,
} from '..';
import type { DataSource, NameTables } from '..';

describe('name tables (generated)', () => {
  it('pass the validator', () => {
    expect(validateNameTables(NAME_TABLES)).toEqual([]);
  });

  it('name every character, light cone and tabulated set in the stat tables', () => {
    const ids = <T,>(rows: readonly T[], key: (r: T) => string) => rows.map(key).sort();
    expect(ids(NAME_TABLES.characters, (c) => c.id)).toEqual(ids(DATA_TABLES.characters, (c) => c.id));
    expect(ids(NAME_TABLES.lightCones, (l) => l.id)).toEqual(ids(DATA_TABLES.lightCones, (l) => l.id));
    for (const s of DATA_TABLES.setBonuses) expect(relicSetName(NAME_TABLES, s.setId), s.setId).toBeDefined();
  });

  it('cite the text map', () => {
    for (const r of [...NAME_TABLES.characters, ...NAME_TABLES.lightCones, ...NAME_TABLES.relicSets, ...NAME_TABLES.paths]) {
      expect(r.source.files).toContain('TextMap/TextMapCHT.json');
    }
  });

  it('look up by ID', () => {
    // Spot checks against source A's TextMapCHT at the pinned commit.
    expect(characterName(NAME_TABLES, '1001')).toMatchObject({ name: '三月七', path: 'Knight' });
    expect(characterName(NAME_TABLES, '1224')).toMatchObject({ name: '三月七', path: 'Rogue' });
    expect(characterName(NAME_TABLES, '1506')?.name).toBe('銀狼LV.999'); // <unbreak> tags removed
    expect(characterName(NAME_TABLES, '8002')).toMatchObject({ name: null, path: 'Warrior', gender: 'female' });
    expect(lightConeName(NAME_TABLES, '20000')).toMatchObject({ name: '鋒鏑', path: 'Rogue' });
    expect(relicSetName(NAME_TABLES, '101')?.name).toBe('雲無留跡的過客');
    expect(pathName(NAME_TABLES, 'Knight')?.name).toBe('存護');
    expect(characterName(NAME_TABLES, '9999')).toBeUndefined();
  });
});

describe('validateNameTables', () => {
  // TEST FIXTURE — NOT GAME DATA
  const source: DataSource = { repo: 'test/fixture', commit: 'a'.repeat(40), files: ['fixture.json'] };
  const cited = { source, gameVersion: '1.0' };
  const valid: NameTables = {
    paths: [{ id: 'P1', name: '路一', ...cited }],
    characters: [
      { id: '1', name: '甲', path: 'P1', ...cited },
      { id: '2', name: null, path: 'P1', gender: 'male', ...cited },
    ],
    lightCones: [{ id: '10', name: '乙', path: 'P1', ...cited }],
    relicSets: [{ setId: '100', name: '丙', ...cited }],
  };

  it('accepts a valid fixture', () => {
    expect(validateNameTables(valid)).toEqual([]);
  });

  it('rejects markup, missing citations, bad paths and nickname rows without a gender', () => {
    const paths = (t: NameTables) => validateNameTables(t).map((i) => i.path);
    const { source: _drop, ...uncited } = valid.relicSets[0]!;
    expect(
      paths({
        ...valid,
        characters: [
          { id: '1', name: '甲<i>', path: 'P1', ...cited },
          { id: '2', name: null, path: 'P1', ...cited },
          { id: '3', name: '丁', path: 'P9', ...cited },
        ],
        relicSets: [uncited as NameTables['relicSets'][number]],
      }),
    ).toEqual(['characters[0].name', 'characters[1].gender', 'characters[2].path', 'relicSets[0].source']);
  });

  it('rejects two characters with the same name and path', () => {
    const issues = validateNameTables({
      ...valid,
      characters: [valid.characters[0]!, { ...valid.characters[0]!, id: '3' }],
    });
    expect(issues.map((i) => i.path)).toEqual(['characters (name, path)[1]']);
  });
});
