// TEST FIXTURE — NOT GAME DATA. Stat tables that match the synthetic export in
// fixtures.ts, with round numbers so I3's expected stats can be computed by hand.
import type { CharacterAscension, DataSource, DataTables, LightConeAscension } from '../../data';

const source: DataSource = {
  repo: 'example/import-fixture',
  commit: 'fedcba9876543210fedcba9876543210fedcba98',
  files: ['fixture.json'],
};
const cite = { source, gameVersion: '1.0' } as const;
const CAPS = [20, 30, 40, 50, 60, 70, 80];

// Only the last ascension's numbers matter to I3; earlier ones repeat them.
const charAscensions: CharacterAscension[] = CAPS.map((maxLevel, ascension) => ({
  ascension,
  maxLevel,
  hp: { base: 110, perLevel: 10 },
  atk: { base: 60, perLevel: 5 },
  def: { base: 50, perLevel: 5 },
  spd: 100,
  critRate: 0.05,
  critDmg: 0.5,
}));
const lcAscensions: LightConeAscension[] = CAPS.map((maxLevel, ascension) => ({
  ascension,
  maxLevel,
  hp: { base: 100, perLevel: 5 },
  atk: { base: 45, perLevel: 5 },
  def: { base: 25, perLevel: 5 },
}));

const trace = (n: number, stat: 'atkPct' | 'critDmg' | 'spdFlat', value: number, tree: 'base' | 'enhanced' = 'base') => ({
  ...cite,
  characterId: '9001',
  tree,
  trace: `stat_${n}` as 'stat_1',
  pointId: `${tree === 'base' ? '' : '1'}9001${200 + n}`,
  modifiers: [{ stat, value }],
  unsupported: [],
});

export const IMPORT_TABLES: DataTables = {
  characters: [{ ...cite, id: '9001', element: 'fire', energyCost: 120, ascensions: charAscensions }],
  lightCones: [{ ...cite, id: '9101', ascensions: lcAscensions }],
  relicMainStats: [
    {
      ...cite,
      slot: 'Head',
      rarity: 5,
      maxLevel: 15,
      groupId: 51,
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
      groupId: 53,
      property: 'CriticalDamageBase',
      exportName: 'CRIT DMG',
      target: { stat: 'critDmg' },
      value: { base: 0.1, perLevel: 0.02 },
    },
    {
      ...cite,
      slot: 'Body',
      rarity: 5,
      maxLevel: 15,
      groupId: 53,
      property: 'HealRatioBase',
      exportName: 'Outgoing Healing Boost',
      target: null,
      value: { base: 0.03, perLevel: 0.01 },
    },
  ],
  setBonuses: [
    { ...cite, setId: '9201', pieces: 2, modifiers: [{ stat: 'atkPct', value: 0.1 }], unsupported: [], hasAbilityPart: false },
    { ...cite, setId: '9203', pieces: 2, modifiers: [{ stat: 'critRate', value: 0.08 }], unsupported: [], hasAbilityPart: true },
  ],
  traces: [
    trace(1, 'atkPct', 0.04),
    trace(2, 'critDmg', 0.05),
    trace(3, 'atkPct', 0.06), // locked in the export: must not apply
    trace(4, 'spdFlat', 2),
    {
      ...trace(10, 'atkPct', 0),
      modifiers: [{ stat: 'dmgBoost', value: 0.032, condition: { elements: ['fire'] } }],
    },
    trace(1, 'critDmg', 0.04, 'enhanced'),
  ],
  breakLevelMultipliers: [
    { ...cite, level: 60, value: 2000 },
    { ...cite, level: 80, value: 4000 },
  ],
};
