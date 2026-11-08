/**
 * E4: Break and Super Break DMG. TEST FIXTURE — NOT GAME DATA: the level
 * multiplier (4000), Toughness and Break Effect are synthetic round numbers
 * so every expected value below can be checked by hand.
 */
import { describe, expect, it } from 'vitest';
import { calculateBreakHit, createInitialState, formulas, runRotation, validateRotationInput } from '..';
import type { BreakHitSpec, CharacterBuild, EffectDef, RotationInput } from '..';
import { enemy, fireDps } from './fixtures';

/** fireDps() plus a level multiplier of 4000 and Break Effect 150%. Its 40% Fire DMG Boost must not apply. */
const breaker = (overrides: Partial<CharacterBuild> = {}): CharacterBuild => {
  const base = fireDps();
  return {
    ...base,
    breakLevelMultiplier: 4000,
    relics: { ...base.relics!, stats: [...base.relics!.stats, { stat: 'breakEffect', value: 1.5 }] },
    ...overrides,
  };
};
/** Lv90 (DEF 1100), Fire RES 20%, max Toughness 120 (displayed units), broken. */
const target = () => enemy({ maxToughness: 120, broken: true });

// Shared factors: DEF 1 − 1100 / (1100 + 1000) = 1000/2100; RES 1 − 0.2 = 0.8; broken 1.0.
const DEF = 1000 / 2100;
const RES = 0.8;

const hit = (spec: BreakHitSpec) => calculateBreakHit(createInitialState([breaker()], [target()]), spec, 'dps');

describe('formulas (E4)', () => {
  it('break toughness factor: 0.5 + 120 / 40 = 3.5', () => {
    expect(formulas.breakToughnessFactor(120)).toBe(3.5);
  });
  it('break base: 4000 × 2 × 3.5 × 0.5 = 14000', () => {
    expect(formulas.breakBaseDmg(4000, 2, 120, 0.5)).toBe(14000);
  });
  it('super break toughness: (1 + 0.5) × 20 + 5 = 35', () => {
    expect(formulas.superBreakToughness(20, 0.5, 5)).toBe(35);
  });
  it('super break base: 4000 × 30 / 10 × 1.5 = 18000', () => {
    expect(formulas.superBreakBaseDmg(4000, 30, 1.5)).toBe(18000);
  });
  it('element factors', () => {
    expect(formulas.BREAK_ELEMENT_FACTOR).toEqual({
      physical: 2,
      fire: 2,
      ice: 1,
      lightning: 1,
      wind: 1.5,
      quantum: 0.5,
      imaginary: 0.5,
    });
  });
});

describe('calculateBreakHit', () => {
  it('Break DMG: 4000 × 2 (fire) × 3.5 × (1 + 1.5) × DEF × RES', () => {
    const c = hit({ kind: 'break', targetId: 'e1' });
    // 4000 × 2 × 3.5 = 28000; × 2.5 = 70000; × 0.8 = 56000; × 1000/2100 = 26666.666…
    expect(c.breakdown.baseDmg).toBe(70000);
    expect(c.breakdown.total).toBeCloseTo(70000 * DEF * RES, 8);
    expect(c.breakdown.total).toBeCloseTo(26666.666667, 6);
    expect(c.breakdown.critMultiplier).toBe(1);
    expect(c.breakdown.dmgBoostMultiplier).toBe(1); // the 40% Fire DMG Boost is ignored
    expect(c.stats.dmgBoost).toBe(0);
    expect(c.details).toEqual({
      kind: 'break',
      levelMultiplier: 4000,
      elementFactor: 2,
      maxToughness: 120,
      multiplier: 1,
      breakEffect: 1.5,
      breakEffectMultiplier: 2.5,
      breakDmgIncrease: 0,
    });
  });

  it('uses the element override for both the element factor and RES', () => {
    // Quantum: factor 0.5, RES 0 (not set) → 4000 × 0.5 × 3.5 × 2.5 × DEF × 1
    const c = hit({ kind: 'break', targetId: 'e1', element: 'quantum' });
    expect(c.breakdown.total).toBeCloseTo(17500 * DEF, 8);
  });

  it('Super Break DMG: 4000 × ((1 + 0.5) × 20) / 10 × 1.5 × (1 + 1.5) × DEF × RES', () => {
    const c = hit({ kind: 'superBreak', targetId: 'e1', toughnessReduction: 20, breakEfficiency: 0.5, multiplier: 1.5 });
    // 4000 × 30 / 10 × 1.5 = 18000; × 2.5 = 45000; × 0.8 = 36000; × 1000/2100 = 17142.857…
    expect(c.details.toughness).toBe(30);
    expect(c.breakdown.baseDmg).toBe(45000);
    expect(c.breakdown.total).toBeCloseTo(17142.857143, 6);
  });

  it('applies target vulnerability and the 0.9 unbroken factor, but not tag-conditioned modifiers', () => {
    const vuln: EffectDef = {
      id: 'v',
      name: 'Fixture vulnerability',
      kind: 'debuff',
      modifiers: [
        { stat: 'vulnerability', value: 0.2 },
        { stat: 'vulnerability', value: 1, condition: { damageTags: ['skill'] } },
      ],
    };
    const state = createInitialState([breaker()], [enemy({ maxToughness: 120, passiveEffects: [vuln] })]);
    const c = calculateBreakHit(state, { kind: 'break', targetId: 'e1' }, 'dps');
    // 70000 × DEF × RES × 1.2 (vulnerability) × 0.9 (unbroken)
    expect(c.breakdown.vulnerabilityMultiplier).toBeCloseTo(1.2, 12);
    expect(c.breakdown.brokenMultiplier).toBe(0.9);
    expect(c.breakdown.total).toBeCloseTo(70000 * DEF * RES * 1.2 * 0.9, 8);
  });
});

describe('break steps in a rotation', () => {
  const input = (overrides: Partial<RotationInput> = {}): RotationInput => ({
    team: [breaker()],
    enemies: [target()],
    critMode: 'crit',
    events: [
      {
        kind: 'turn',
        id: 't1',
        actorId: 'dps',
        steps: [
          { op: 'break', hit: { kind: 'break', targetId: 'e1', label: 'break' } },
          { op: 'break', hit: { kind: 'superBreak', targetId: 'e1', toughnessReduction: 10, multiplier: 1 } },
          { op: 'break', requires: { minEidolon: 1 }, hit: { kind: 'break', targetId: 'e1' } },
        ],
      },
    ],
    ...overrides,
  });

  it('adds break hits to the totals, never crits, tags them by kind, and gates on the attacker eidolon', () => {
    const r = runRotation(input());
    const breakHit = 70000 * DEF * RES; // as above
    const superBreak = 4000 * (10 / 10) * 1 * 2.5 * DEF * RES; // 10000 × DEF × RES
    expect(r.hits.map((h) => [h.break?.kind, h.canCrit, h.tags])).toEqual([
      ['break', false, ['break']],
      ['superBreak', false, ['superBreak']],
    ]);
    expect(r.hits[0]!.label).toBe('break');
    expect(r.totalDamage).toBeCloseTo(breakHit + superBreak, 6);
    expect(r.damageByAttacker['dps']).toBeCloseTo(breakHit + superBreak, 6);
    expect(r.damageByTag.break).toBeCloseTo(breakHit, 6);
    expect(r.damageByTag.superBreak).toBeCloseTo(superBreak, 6);
    expect(r.log[0]!.skippedSteps).toEqual([2]);
  });

  it('validates the break inputs', () => {
    const bad = input({
      team: [breaker({ breakLevelMultiplier: undefined })],
      enemies: [enemy()],
      events: [
        {
          kind: 'extra',
          id: 'x',
          actorId: 'dps',
          steps: [
            { op: 'break', hit: { kind: 'break', targetId: 'e1', multiplier: -1 } },
            { op: 'break', hit: { kind: 'superBreak', targetId: 'nobody', toughnessReduction: -5, multiplier: Number.NaN } },
          ],
        },
      ],
    });
    expect(validateRotationInput(bad)).toEqual([
      'events[0].steps[0]: attacker "dps" needs a breakLevelMultiplier for break hits',
      'events[0].steps[0]: target "e1" needs a maxToughness for Break DMG',
      'events[0].steps[0]: multiplier must be a finite number >= 0',
      'events[0].steps[1]: attacker "dps" needs a breakLevelMultiplier for break hits',
      'events[0].steps[1]: target "nobody" must be an enemy',
      'events[0].steps[1]: toughnessReduction must be a finite number >= 0',
      'events[0].steps[1]: multiplier must be a finite number >= 0',
    ]);
    expect(
      validateRotationInput(input({ team: [breaker({ breakLevelMultiplier: 0 })], enemies: [enemy({ maxToughness: -1 })] })),
    ).toEqual(
      expect.arrayContaining([
        'team[0].breakLevelMultiplier: must be a positive number',
        'enemies[0].maxToughness: must be a positive number',
      ]),
    );
  });
});
