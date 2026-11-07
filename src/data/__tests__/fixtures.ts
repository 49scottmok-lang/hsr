// TEST FIXTURE — NOT GAME DATA. Synthetic tables for validator and lookup tests.
import type { DataSource, DataTables } from '../schema';

export const FIXTURE_SOURCE: DataSource = {
  repo: 'example/fixture',
  commit: '0123456789abcdef0123456789abcdef01234567',
  files: ['fixture.json'],
};

const cite = { source: FIXTURE_SOURCE, gameVersion: '1.0' } as const;

export const FIXTURE_TABLES: DataTables = {
  characters: [
    {
      ...cite,
      id: '9001',
      element: 'fire',
      ascensions: [
        {
          ascension: 0,
          maxLevel: 20,
          hp: { base: 100, perLevel: 5 },
          atk: { base: 50, perLevel: 2.5 },
          def: { base: 40, perLevel: 2 },
          spd: 100,
          critRate: 0.05,
          critDmg: 0.5,
        },
        {
          ascension: 1,
          maxLevel: 30,
          hp: { base: 140, perLevel: 5 },
          atk: { base: 70, perLevel: 2.5 },
          def: { base: 56, perLevel: 2 },
          spd: 100,
          critRate: 0.05,
          critDmg: 0.5,
        },
      ],
    },
  ],
  lightCones: [
    {
      ...cite,
      id: '9101',
      ascensions: [
        { ascension: 0, maxLevel: 20, hp: { base: 30, perLevel: 4 }, atk: { base: 10, perLevel: 1.5 }, def: { base: 10, perLevel: 1 } },
      ],
    },
  ],
  relicMainStats: [
    {
      ...cite,
      slot: 'Head',
      rarity: 5,
      maxLevel: 15,
      groupId: 1,
      property: 'HPDelta',
      exportName: 'HP',
      target: { stat: 'hpFlat' },
      value: { base: 100, perLevel: 30 },
    },
    {
      ...cite,
      slot: 'Body',
      rarity: 5,
      maxLevel: 15,
      groupId: 2,
      property: 'HPAddedRatio',
      exportName: 'HP',
      target: { stat: 'hpPct' },
      value: { base: 0.05, perLevel: 0.02 },
    },
    {
      ...cite,
      slot: 'Planar Sphere',
      rarity: 5,
      maxLevel: 15,
      groupId: 3,
      property: 'FireAddedRatio',
      exportName: 'Fire DMG Boost',
      target: { stat: 'dmgBoost', condition: { elements: ['fire'] } },
      value: { base: 0.04, perLevel: 0.01 },
    },
    {
      ...cite,
      slot: 'Body',
      rarity: 5,
      maxLevel: 15,
      groupId: 2,
      property: 'HealRatioBase',
      exportName: 'Outgoing Healing Boost',
      target: null,
      value: { base: 0.03, perLevel: 0.01 },
    },
  ],
  setBonuses: [
    { ...cite, setId: '9201', pieces: 2, modifiers: [{ stat: 'atkPct', value: 0.1 }], unsupported: [], hasAbilityPart: false },
  ],
  traces: [
    {
      ...cite,
      characterId: '9001',
      tree: 'base',
      trace: 'stat_1',
      pointId: '9001201',
      modifiers: [{ stat: 'atkPct', value: 0.04 }],
      unsupported: [],
    },
  ],
  breakLevelMultipliers: [
    { ...cite, level: 1, value: 50 },
    { ...cite, level: 2, value: 60 },
    { ...cite, level: 80, value: 4000 },
  ],
};
