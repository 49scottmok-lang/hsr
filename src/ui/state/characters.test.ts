// @vitest-environment node
import { expect, it } from 'vitest';
import { characterBase, characterName, DATA_TABLES, NAME_TABLES } from '../../data';
import type { CharacterBuild } from '../../engine/index';
import { suggestedBreakLevelMultiplier } from './break-level';
import { buildCharacterId, CHARACTER_OPTIONS, maxLevelBase, pickCharacter } from './characters';
import { importScenario } from './scenario-json';

// TEST FIXTURE — NOT GAME DATA. Game IDs and stats below are read from the
// sourced tables at run time, never written out here.
const custom: CharacterBuild = {
  id: 'character-1',
  name: 'Test character',
  level: 7,
  element: 'physical',
  eidolon: 2,
  base: { hp: 1, atk: 2, def: 3, spd: 4 },
  relics: { stats: [{ stat: 'atkPct', value: 0.1 }], setEffects: [] },
};
const record = DATA_TABLES.characters.find(({ element }) => element !== 'physical')!;

it('picks a game character for its portrait, name and element without touching any number', () => {
  const picked = pickCharacter(custom, record.id);
  expect(picked).toEqual({
    ...custom,
    characterId: record.id,
    name: CHARACTER_OPTIONS.find(({ id }) => id === record.id)?.name,
    element: record.element,
  });
  // Shared names (e.g. two March 7th paths) gain a path suffix, so match the start.
  expect(picked.name.startsWith(characterName(NAME_TABLES, record.id)?.name ?? '?')).toBe(true);
  const cleared = pickCharacter(picked, undefined);
  expect('characterId' in cleared).toBe(false);
  expect(cleared.id).toBe(custom.id);
});

it('fills base stats from the table at the highest level it covers', () => {
  expect(maxLevelBase(custom)).toBeUndefined();
  const ascension = record.ascensions.length - 1;
  const level = record.ascensions[ascension]!.maxLevel;
  const base = characterBase(DATA_TABLES, record.id, level, ascension);
  if (!base.ok) throw new Error(base.reason);
  const filled = maxLevelBase(pickCharacter(custom, record.id));
  expect(filled).toMatchObject({
    level,
    base: base.value.base,
    baseCritRate: base.value.critRate,
    baseCritDmg: base.value.critDmg,
    breakLevelMultiplier: suggestedBreakLevelMultiplier(level),
    eidolon: custom.eidolon,
    relics: custom.relics,
  });
});

it('reads the portrait from characterId, or from a game ID used as the unit ID', () => {
  expect(buildCharacterId(custom)).toBeUndefined();
  expect(buildCharacterId({ ...custom, id: record.id })).toBe(record.id);
  expect(buildCharacterId({ ...custom, id: record.id, characterId: 'other' })).toBe('other');
});

it('gives every picker option a distinct label, including both Trailblazers of a path', () => {
  const names = CHARACTER_OPTIONS.map(({ name }) => name);
  expect(new Set(names).size).toBe(names.length);
  expect(CHARACTER_OPTIONS).toHaveLength(DATA_TABLES.characters.length);
});

it('keeps characterId through a scenario file round trip', () => {
  const result = importScenario(JSON.stringify({
    critMode: 'expected',
    enemies: [],
    teams: [
      { label: 'A', team: [{ ...custom, characterId: record.id }], events: [] },
      { label: 'B', team: [], events: [] },
    ],
  }));
  if (!result.ok) throw new Error(result.issues.join('\n'));
  expect(result.scenario.teams[0].team[0]?.characterId).toBe(record.id);
});
