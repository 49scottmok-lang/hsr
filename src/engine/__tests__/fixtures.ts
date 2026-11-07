/**
 * TEST FIXTURES — SYNTHETIC NUMBERS, NOT GAME DATA.
 * Values are chosen so expected results can be computed by hand.
 * Never copy these into src/data/.
 */
import type { CharacterBuild, EffectDef, EnemyConfig } from '../types';

/** Final ATK = (600 + 500) × 1.5 + 300 = 1950. CR 0.70, CD 1.50. 40% Fire DMG. */
export function fireDps(overrides: Partial<CharacterBuild> = {}): CharacterBuild {
  return {
    id: 'dps',
    name: 'Fixture DPS',
    level: 80,
    element: 'fire',
    base: { hp: 1000, atk: 600, def: 400, spd: 100 },
    lightCone: { name: 'Fixture LC', base: { hp: 0, atk: 500, def: 0 }, effects: [] },
    relics: {
      stats: [
        { stat: 'atkPct', value: 0.5 },
        { stat: 'atkFlat', value: 300 },
        { stat: 'critRate', value: 0.65 },
        { stat: 'critDmg', value: 1.0 },
        { stat: 'dmgBoost', value: 0.4, condition: { elements: ['fire'] } },
      ],
      setEffects: [],
    },
    ...overrides,
  };
}

/** HP 2000 support with no offensive stats. */
export function support(overrides: Partial<CharacterBuild> = {}): CharacterBuild {
  return {
    id: 'sup',
    name: 'Fixture Support',
    level: 80,
    element: 'ice',
    base: { hp: 2000, atk: 400, def: 500, spd: 120 },
    ...overrides,
  };
}

/** Level 90 enemy: base DEF 1100, 20% Fire RES. */
export function enemy(overrides: Partial<EnemyConfig> = {}): EnemyConfig {
  return { id: 'e1', name: 'Fixture Enemy', level: 90, res: { fire: 0.2 }, ...overrides };
}

export const skillDmgBuff: EffectDef = {
  id: 'skill-dmg',
  name: 'Fixture Skill DMG +20%',
  kind: 'buff',
  modifiers: [{ stat: 'dmgBoost', value: 0.2, condition: { damageTags: ['skill'] } }],
};

/**
 * Expected Skill hit (multiplier 2.0, Fire) of fireDps() + skillDmgBuff vs enemy(),
 * unbroken, expected-value crit:
 * 3900 × 2.05 × 1.6 × (1000/2100) × 0.8 × 0.9
 */
export const EXPECTED_SKILL_HIT = (3900 * 2.05 * 1.6 * (1000 / 2100) * 0.8 * 0.9);
