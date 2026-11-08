/**
 * E8: DoT application chance (EHR vs Effect RES).
 * TEST FIXTURE — NOT GAME DATA: synthetic round numbers.
 *
 * fireDps(): ATK 1950, 40% Fire DMG Boost. enemy(): Lv90 (DEF 1100), Fire RES 20%, unbroken.
 */
import { describe, expect, it } from 'vitest';
import { calculateHit, createInitialState, formulas, runRotation, validateRotationInput } from '..';
import type { CharacterBuild, EffectDef, EnemyConfig, HitSpec, RotationInput, StatModifier } from '..';
import { enemy, fireDps } from './fixtures';

const withStats = (extra: readonly StatModifier[]): CharacterBuild => {
  const b = fireDps();
  return { ...b, relics: { ...b.relics!, stats: [...b.relics!.stats, ...extra] } };
};

const dot = (baseChance?: number): HitSpec => ({ targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['dot'], baseChance });

// DoT without the chance factor: 1950 × 1 (no crit) × 1.4 × 1000/2100 × 0.8 × 0.9 = 936
const DOT_DAMAGE = 1950 * 1.4 * (1000 / 2100) * 0.8 * 0.9;

describe('formulas.dotApplicationChance', () => {
  it('base × (1 + EHR) × (1 − RES + PEN)', () => {
    // 0.6 × 1.5 × 0.6 = 0.54
    expect(formulas.dotApplicationChance(0.6, 0.5, 0.4, 0)).toBeCloseTo(0.54, 12);
  });
  it('is capped at 1', () => {
    // 1 × 1.5 × (1 − 0.4 + 0.1) = 1.05 → 1
    expect(formulas.dotApplicationChance(1, 0.5, 0.4, 0.1)).toBe(1);
  });
  it('is floored at 0', () => {
    // 1 × 1 × (1 − 1.5) = −0.5 → 0
    expect(formulas.dotApplicationChance(1, 0, 1.5, 0)).toBe(0);
  });
});

describe('DoT hits with baseChance', () => {
  const debuff: EffectDef = {
    id: 'eres-down',
    name: 'Fixture Effect RES −10%',
    kind: 'debuff',
    modifiers: [{ stat: 'effectRes', value: -0.1 }],
  };
  const target = (o: Partial<EnemyConfig> = {}) => enemy({ effectRes: 0.2, passiveEffects: [debuff], ...o });

  it('weights the DoT by its application chance', () => {
    const s = createInitialState([withStats([{ stat: 'effectHitRate', value: 0.5 }])], [target()]);
    const c = calculateHit(s, dot(0.6), 'dps', 'expected');
    // Effect RES 0.2 − 0.1 = 0.1. Chance 0.6 × (1 + 0.5) × (1 − 0.1) = 0.81.
    expect(c.stats.effectHitRate).toBe(0.5);
    expect(c.stats.targetEffectRes).toBeCloseTo(0.1, 12);
    expect(c.breakdown.dotChanceMultiplier).toBeCloseTo(0.81, 12);
    expect(c.breakdown.critMultiplier).toBe(1);
    expect(c.breakdown.total).toBeCloseTo(DOT_DAMAGE * 0.81, 8);
    expect(c.breakdown.total).toBeCloseTo(758.16, 8);
  });

  it('adds Effect RES PEN to the RES term', () => {
    const s = createInitialState(
      [withStats([{ stat: 'effectHitRate', value: 0.5 }, { stat: 'effectResPen', value: 0.1 }])],
      [target()],
    );
    // 0.6 × 1.5 × (1 − 0.1 + 0.1) = 0.9
    const c = calculateHit(s, dot(0.6), 'dps', 'expected');
    expect(c.stats.effectResPen).toBe(0.1);
    expect(c.breakdown.dotChanceMultiplier).toBeCloseTo(0.9, 12);
  });

  it('leaves the DoT unweighted without baseChance', () => {
    const s = createInitialState([withStats([])], [target({ effectRes: 0.9 })]);
    const c = calculateHit(s, dot(), 'dps', 'expected');
    expect(c.breakdown.dotChanceMultiplier).toBe(1);
    expect(c.breakdown.total).toBeCloseTo(DOT_DAMAGE, 8);
  });

  it('applies in every crit mode', () => {
    const input = (critMode: RotationInput['critMode']): RotationInput => ({
      team: [withStats([])],
      enemies: [enemy()],
      critMode,
      events: [{ kind: 'extra', id: 'x', actorId: 'dps', steps: [{ op: 'hit', hit: dot(0.5) }] }],
    });
    // 0.5 × 1 × 1 = 0.5
    for (const mode of ['expected', 'crit', 'nonCrit'] as const) {
      expect(runRotation(input(mode)).totalDamage).toBeCloseTo(DOT_DAMAGE * 0.5, 8);
    }
  });
});

describe('validation', () => {
  it('requires the dot tag and a non-negative base chance; enemy effectRes must be finite', () => {
    const input: RotationInput = {
      team: [fireDps()],
      enemies: [enemy({ effectRes: Number.NaN })],
      events: [
        {
          kind: 'extra',
          id: 'x',
          actorId: 'dps',
          steps: [
            { op: 'hit', hit: { targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['skill'], baseChance: 1 } },
            { op: 'hit', hit: dot(-0.1) },
          ],
        },
      ],
    };
    expect(validateRotationInput(input)).toEqual([
      'enemies[0].effectRes: must be a finite number',
      'events[0].steps[0]: baseChance needs the "dot" tag',
      'events[0].steps[1]: baseChance must be a finite number >= 0',
    ]);
  });
});

describe('Debuff RES (E12, S3: × (1 − Debuff RES))', () => {
  const ehr = withStats([{ stat: 'effectHitRate', value: 0.5 }]);
  const resistant = (): EnemyConfig => enemy({ effectRes: 0.2, debuffRes: { burn: 0.3 } });
  const burn = (dotType?: HitSpec['dotType']): HitSpec => ({ ...dot(0.6), dotType });

  it('formula: base × (1 + EHR) × (1 − Effect RES + PEN) × (1 − Debuff RES)', () => {
    // 0.6 × 1.5 × 0.8 × 0.7 = 0.504
    expect(formulas.dotApplicationChance(0.6, 0.5, 0.2, 0, 0.3)).toBeCloseTo(0.504, 12);
    // Default Debuff RES is 0: 0.6 × 1.5 × 0.8 = 0.72
    expect(formulas.dotApplicationChance(0.6, 0.5, 0.2, 0)).toBeCloseTo(0.72, 12);
  });

  it('applies the target Debuff RES for the hit dotType', () => {
    // 936 × 0.504 = 471.744
    const c = calculateHit(createInitialState([ehr], [resistant()]), burn('burn'), 'dps', 'expected');
    expect(c.breakdown.dotChanceMultiplier).toBeCloseTo(0.504, 12);
    expect(c.breakdown.total).toBeCloseTo(DOT_DAMAGE * 0.504, 8);
    expect(c.breakdown.total).toBeCloseTo(471.744, 6);
  });

  it('uses 0 for a DoT type the enemy has no Debuff RES for, and when dotType is absent', () => {
    // 0.6 × 1.5 × 0.8 = 0.72 → 936 × 0.72 = 673.92
    const state = createInitialState([ehr], [resistant()]);
    expect(calculateHit(state, burn('shock'), 'dps', 'expected').breakdown.dotChanceMultiplier).toBeCloseTo(0.72, 12);
    const plain = calculateHit(state, burn(), 'dps', 'expected');
    expect(plain.breakdown.dotChanceMultiplier).toBeCloseTo(0.72, 12);
    expect(plain.breakdown.total).toBeCloseTo(673.92, 6);
  });

  it('validates dotType and debuffRes', () => {
    const input = {
      team: [fireDps()],
      enemies: [enemy({ debuffRes: { frozen: 0.1, burn: Number.NaN } as unknown as EnemyConfig['debuffRes'] })],
      events: [
        {
          kind: 'extra',
          id: 'x',
          actorId: 'dps',
          steps: [
            { op: 'hit', hit: { ...dot(), dotType: 'burn' } },
            { op: 'hit', hit: { ...dot(0.5), dotType: 'poison' } },
          ],
        },
      ],
    } as unknown as RotationInput;
    expect(validateRotationInput(input)).toEqual([
      'enemies[0].debuffRes: unknown DoT type "frozen"',
      'enemies[0].debuffRes.burn: must be a finite number',
      'events[0].steps[0]: dotType needs baseChance',
      'events[0].steps[1]: unknown DoT type "poison"',
    ]);
  });
});
