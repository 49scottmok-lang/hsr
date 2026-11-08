/**
 * E4 follow-up: `break` / `superBreak` tags and the `breakEfficiency` /
 * `superBreakDmg` stats. TEST FIXTURE — NOT GAME DATA: synthetic round
 * numbers so every expected value can be checked by hand.
 */
import { describe, expect, it } from 'vitest';
import { BREAK_DAMAGE_TAGS, DAMAGE_TAGS, HIT_DAMAGE_TAGS, calculateBreakHit, createInitialState, validateRotationInput } from '..';
import type { BreakHitSpec, CharacterBuild, EffectDef, RotationInput, StatModifier } from '..';
import { enemy, fireDps } from './fixtures';

/** fireDps() (40% Fire DMG Boost) plus level multiplier 4000, Break Effect 150% and `extra` relic stats. */
const breaker = (extra: readonly StatModifier[] = []): CharacterBuild => {
  const base = fireDps();
  return {
    ...base,
    breakLevelMultiplier: 4000,
    relics: { ...base.relics!, stats: [...base.relics!.stats, { stat: 'breakEffect', value: 1.5 }, ...extra] },
  };
};

// Lv90 target (DEF 1100), Fire RES 20%, max Toughness 120, broken:
// DEF = 1 − 1100 / 2100 = 1000/2100, RES = 0.8, broken = 1.
const DEF = 1000 / 2100;
const RES = 0.8;

const hit = (extra: readonly StatModifier[], spec: BreakHitSpec) =>
  calculateBreakHit(createInitialState([breaker(extra)], [enemy({ maxToughness: 120, broken: true })]), spec, 'dps');

const breakDmg: StatModifier = { stat: 'dmgBoost', value: 0.3, condition: { damageTags: ['break'] } };
const superBreakDmgBoost: StatModifier = { stat: 'dmgBoost', value: 0.6, condition: { damageTags: ['superBreak'] } };
const plainDmg: StatModifier = { stat: 'dmgBoost', value: 1 };

describe('break-tagged DMG Boost', () => {
  it('Break DMG takes only DMG Boost that names `break`', () => {
    // Base 4000 × 2 × (0.5 + 120/40) × 1 = 28000; × (1 + 1.5) = 70000.
    // DMG Boost 1 + 0.3 (break-tagged only; the 40% Fire and the unconditional 100% are ignored).
    // 70000 × 1.3 × 0.8 × 1000/2100 = 34666.666…
    const c = hit([breakDmg, superBreakDmgBoost, plainDmg], { kind: 'break', targetId: 'e1' });
    expect(c.tags).toEqual(['break']);
    expect(c.stats.dmgBoost).toBeCloseTo(0.3, 12);
    expect(c.breakdown.dmgBoostMultiplier).toBeCloseTo(1.3, 12);
    expect(c.breakdown.total).toBeCloseTo(70000 * 1.3 * RES * DEF, 8);
    expect(c.breakdown.total).toBeCloseTo(34666.666667, 6);
  });

  it('Super Break DMG multiplies Break DMG Increase and Super Break DMG Increase (E11, S3)', () => {
    // Base 4000 × 10 / 10 × 1 = 4000; × 2.5 = 10000.
    // (1 + 0.3 break-tagged) × (1 + 0.6 superBreak-tagged) = 2.08; the unconditional 100% is ignored.
    // 10000 × 2.08 × 0.8 × 1000/2100 = 7923.809…
    const c = hit([breakDmg, superBreakDmgBoost, plainDmg], {
      kind: 'superBreak',
      targetId: 'e1',
      toughnessReduction: 10,
      multiplier: 1,
    });
    expect(c.tags).toEqual(['superBreak']);
    expect(c.details.breakDmgIncrease).toBeCloseTo(0.3, 12);
    expect(c.details.superBreakDmgIncrease).toBeCloseTo(0.6, 12);
    expect(c.breakdown.dmgBoostMultiplier).toBeCloseTo(2.08, 12);
    expect(c.breakdown.total).toBeCloseTo(10000 * 2.08 * RES * DEF, 8);
    expect(c.breakdown.total).toBeCloseTo(7923.809524, 6);
  });

  it('counts a modifier naming both tags once, as Break DMG Increase (E11)', () => {
    // { break, superBreak } +50% → (1 + 0.5) × (1 + 0) = 1.5, not 2.25.
    const both: StatModifier = { stat: 'dmgBoost', value: 0.5, condition: { damageTags: ['break', 'superBreak'] } };
    const c = hit([both], { kind: 'superBreak', targetId: 'e1', toughnessReduction: 10, multiplier: 1 });
    expect(c.breakdown.dmgBoostMultiplier).toBeCloseTo(1.5, 12);
    expect(c.details.superBreakDmgIncrease).toBe(0);
  });

  it('applies other modifiers conditioned on the break tag (DEF ignore on Super Break only)', () => {
    const ignore: StatModifier = { stat: 'defIgnore', value: 0.2, condition: { damageTags: ['superBreak'] } };
    const sb = hit([ignore], { kind: 'superBreak', targetId: 'e1', toughnessReduction: 10, multiplier: 1 });
    // Target DEF 1100 × (1 − 0.2) = 880; DEF multiplier 1 − 880 / (880 + 1000) = 1000/1880.
    expect(sb.breakdown.defMultiplier).toBeCloseTo(1000 / 1880, 12);
    const b = hit([ignore], { kind: 'break', targetId: 'e1' });
    expect(b.breakdown.defMultiplier).toBeCloseTo(DEF, 12);
  });

  it('target-held vulnerability conditioned on `break` applies to Break and Super Break DMG (E11)', () => {
    const vuln: EffectDef = {
      id: 'break-vuln',
      name: 'Fixture Break DMG taken +25%',
      kind: 'debuff',
      modifiers: [{ stat: 'vulnerability', value: 0.25, condition: { damageTags: ['break'] } }],
    };
    const state = createInitialState([breaker()], [enemy({ maxToughness: 120, broken: true, passiveEffects: [vuln] })]);
    expect(calculateBreakHit(state, { kind: 'break', targetId: 'e1' }, 'dps').breakdown.vulnerabilityMultiplier).toBe(1.25);
    const sb = calculateBreakHit(state, { kind: 'superBreak', targetId: 'e1', toughnessReduction: 10, multiplier: 1 }, 'dps');
    // S3: Super Break DMG is also considered Break DMG, so the Break DMG vulnerability reaches it.
    expect(sb.breakdown.vulnerabilityMultiplier).toBe(1.25);
    expect(sb.tags).toEqual(['superBreak']);
  });
});

describe('breakEfficiency and superBreakDmg stats', () => {
  it('add to the Super Break step values', () => {
    const c = hit(
      [
        { stat: 'breakEfficiency', value: 0.25 },
        { stat: 'superBreakDmg', value: 0.5 },
      ],
      { kind: 'superBreak', targetId: 'e1', toughnessReduction: 20, breakEfficiency: 0.5, multiplier: 1 },
    );
    // Toughness (1 + 0.5 + 0.25) × 20 = 35. Multiplier 1 + 0.5 = 1.5.
    // Base 4000 × 35 / 10 × 1.5 = 21000; × 2.5 = 52500; × 0.8 = 42000; × 1000/2100 = 20000.
    expect(c.details.breakEfficiency).toBeCloseTo(0.75, 12);
    expect(c.details.toughness).toBeCloseTo(35, 12);
    expect(c.details.multiplier).toBeCloseTo(1.5, 12);
    expect(c.breakdown.baseDmg).toBeCloseTo(52500, 8);
    expect(c.breakdown.total).toBeCloseTo(20000, 8);
  });

  it('let a Super Break step with multiplier 0 take its whole multiplier from buffs', () => {
    const c = hit([{ stat: 'superBreakDmg', value: 1 }], {
      kind: 'superBreak',
      targetId: 'e1',
      toughnessReduction: 10,
      multiplier: 0,
    });
    // 4000 × 10 / 10 × 1 × 2.5 × 0.8 × 1000/2100 = 7619.047…
    expect(c.breakdown.total).toBeCloseTo(10000 * RES * DEF, 8);
  });

  it('do not affect Break DMG', () => {
    const c = hit(
      [
        { stat: 'breakEfficiency', value: 1 },
        { stat: 'superBreakDmg', value: 1 },
      ],
      { kind: 'break', targetId: 'e1' },
    );
    expect(c.details.breakEfficiency).toBeUndefined();
    expect(c.breakdown.total).toBeCloseTo(70000 * RES * DEF, 8);
  });
});

describe('validation', () => {
  it('splits DAMAGE_TAGS into hit tags and break tags', () => {
    expect([...HIT_DAMAGE_TAGS, ...BREAK_DAMAGE_TAGS]).toEqual(DAMAGE_TAGS);
  });

  it('rejects the break tags on ordinary hit steps', () => {
    const input: RotationInput = {
      team: [breaker()],
      enemies: [enemy()],
      events: [
        {
          kind: 'turn',
          id: 't1',
          actorId: 'dps',
          steps: [{ op: 'hit', hit: { targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['skill', 'superBreak'] } }],
        },
      ],
    };
    expect(validateRotationInput(input)).toEqual(['events[0].steps[0]: damage tag "superBreak" is only for break steps']);
  });

  it('accepts the break tags in modifier conditions', () => {
    const input: RotationInput = { team: [breaker([breakDmg, superBreakDmgBoost])], enemies: [enemy()], events: [] };
    expect(validateRotationInput(input)).toEqual([]);
  });
});

describe('Weaken on break hits (E1 regression, 2026-11-08)', () => {
  // S3 (Fandom Weaken and Weakness Break pages): Break-related DMG is not affected by Weaken.
  const weaken: StatModifier = { stat: 'weaken', value: 0.3 };

  it('Break DMG ignores the attacker\'s Weaken', () => {
    // 70000 × 0.8 × 1000/2100 = 26666.666…, unchanged by Weaken 30% (it would be × 0.7).
    const c = hit([weaken], { kind: 'break', targetId: 'e1' });
    expect(c.stats.weaken).toBeCloseTo(0.3, 12);
    expect(c.breakdown.weakenMultiplier).toBe(1);
    expect(c.breakdown.total).toBeCloseTo(70000 * RES * DEF, 8);
    expect(c.breakdown.total).toBeCloseTo(26666.666667, 6);
  });

  it('Super Break DMG ignores the attacker\'s Weaken', () => {
    // 4000 × 10/10 × 1 × 2.5 = 10000; × 0.8 × 1000/2100 = 3809.523…
    const c = hit([weaken], { kind: 'superBreak', targetId: 'e1', toughnessReduction: 10, multiplier: 1 });
    expect(c.breakdown.weakenMultiplier).toBe(1);
    expect(c.breakdown.total).toBeCloseTo(10000 * RES * DEF, 8);
    expect(c.breakdown.total).toBeCloseTo(3809.523810, 6);
  });
});
