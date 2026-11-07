// TEST FIXTURE — NOT GAME DATA. A hand-written export in the Reliquary Archiver
// shape (docs/IMPORT_FORMAT.md). The UID, IDs, names and values are all fake.

export const FAKE_UID = 987654321;

export function archiveFixture(): Record<string, unknown> {
  return {
    source: 'reliquary_archiver',
    build: '0.19.0',
    version: 4,
    metadata: { uid: FAKE_UID, trailblazer: 'Stelle' },
    gacha: { stellar_jade: 12345, oneric_shards: 678 },
    materials: [{ id: '1', name: 'Fake Material', count: 3 }],
    characters: [
      {
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
        ability_version: 0,
      },
      {
        id: '9002',
        name: 'Second Character',
        path: 'Remembrance',
        level: 60,
        ascension: 4,
        eidolon: 0,
        skills: { basic: 3, skill: 5, ult: 5, talent: 5, elation: 2 },
        traces: { stat_1: true }, // absent keys = locked
        memosprite: { skill: 4, talent: 4 },
      },
    ],
    light_cones: [
      { id: '9101', name: 'Test Cone', level: 80, ascension: 6, superimposition: 3, location: '9001', lock: true, _uid: 'lc_1' },
      { id: '9102', name: 'Spare Cone', level: 1, ascension: 0, superimposition: 1, location: '', lock: false, _uid: 'lc_2' },
    ],
    relics: [
      {
        set_id: '9201',
        name: 'Test Set',
        slot: 'Head',
        rarity: 5,
        level: 15,
        mainstat: 'HP',
        substats: [
          { key: 'CRIT Rate_', value: 6.48, count: 2, step: 1 },
          { key: 'ATK', value: 38.1, count: 2, step: 2 },
        ],
        preview_substats: [{ key: 'SPD', value: 2, count: 1, step: 0 }],
        location: '9001',
        lock: true,
        discard: false,
        _uid: 'relic_1',
      },
      {
        set_id: '9201',
        name: 'Test Set',
        slot: 'Body',
        rarity: 5,
        level: 12,
        mainstat: 'CRIT DMG',
        substats: [{ key: 'SPD', value: 4.6, count: 2, step: 1 }],
        location: '9001',
        lock: false,
        discard: false,
        _uid: 'relic_2',
      },
      {
        set_id: '9202',
        name: 'Spare Set',
        slot: 'Feet',
        rarity: 4,
        level: 0,
        mainstat: 'SPD',
        substats: [],
        location: '',
        lock: false,
        discard: true,
        _uid: 'relic_3',
      },
    ],
  };
}
