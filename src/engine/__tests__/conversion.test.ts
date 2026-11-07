/**
 * E7: stat-conversion modifiers, evaluated at hit time.
 * TEST FIXTURE — NOT GAME DATA: synthetic round numbers.
 *
 * fireDps(): base HP 1000 (no HP modifiers), ATK (600 + 500) × 1.5 + 300 = 1950, CRIT DMG 1.5.
 * support(): base HP 2000.
 */
import { describe, expect, it } from 'vitest';
import { applyEffect, calculateHit, createInitialState, resolveUnitStats, runRotation, validateRotationInput } from '..';
import type { EffectDef, RotationInput, StatConversion } from '..';
import { enemy, fireDps, support } from './fixtures';

const effect = (conversions: readonly StatConversion[], extra: Partial<EffectDef> = {}): EffectDef => ({
  id: 'conv',
  name: 'Fixture conversion',
  kind: 'buff',
  modifiers: [],
  conversions,
  ...extra,
});

const withPassive = (def: EffectDef) => createInitialState([fireDps({ passiveEffects: [def] }), support()], [enemy()]);

describe('stat conversions', () => {
  it('adds ratio × the holder stat: ATK +50% of HP', () => {
    const s = withPassive(effect([{ from: 'hp', to: 'atkFlat', ratio: 0.5 }]));
    // 1950 + 0.5 × 1000 = 2450
    expect(resolveUnitStats(s, 'dps').atk).toBe(2450);
  });

  it('counts only the part above the threshold, and caps the result', () => {
    // CRIT DMG + 0.04% per ATK above 1450: (1950 − 1450) × 0.0004 = 0.2 → 1.5 + 0.2 = 1.7
    const open = withPassive(effect([{ from: 'atk', to: 'critDmg', ratio: 0.0004, threshold: 1450 }]));
    expect(resolveUnitStats(open, 'dps').critDmg).toBeCloseTo(1.7, 12);
    // Cap 0.1 → 1.5 + 0.1 = 1.6
    const capped = withPassive(effect([{ from: 'atk', to: 'critDmg', ratio: 0.0004, threshold: 1450, cap: 0.1 }]));
    expect(resolveUnitStats(capped, 'dps').critDmg).toBeCloseTo(1.6, 12);
    // Below the threshold: max(0, 1950 − 2000) = 0 → unchanged
    const below = withPassive(effect([{ from: 'atk', to: 'critDmg', ratio: 0.0004, threshold: 2000 }]));
    expect(resolveUnitStats(below, 'dps').critDmg).toBeCloseTo(1.5, 12);
  });

  it('multiplies by stacks before the cap', () => {
    const def = effect([{ from: 'hp', to: 'atkFlat', ratio: 0.25, cap: 400 }], { maxStacks: 3 });
    const base = createInitialState([fireDps(), support()], [enemy()]);
    // 1 stack: 0.25 × 1000 = 250 → 2200; 2 stacks: 500, capped at 400 → 2350
    expect(resolveUnitStats(applyEffect(base, def, 'dps', 'dps', 1), 'dps').atk).toBe(2200);
    expect(resolveUnitStats(applyEffect(base, def, 'dps', 'dps', 2), 'dps').atk).toBe(2350);
  });

  it("reads the source unit's stat with fromUnit: 'source'", () => {
    const def = effect([{ from: 'hp', fromUnit: 'source', to: 'atkFlat', ratio: 0.1 }]);
    const s = applyEffect(createInitialState([fireDps(), support()], [enemy()]), def, 'dps', 'sup');
    // 1950 + 0.1 × 2000 (support's HP, not the holder's 1000) = 2150
    expect(resolveUnitStats(s, 'dps').atk).toBe(2150);
  });

  it('never chains: a conversion reads its source stat without conversions', () => {
    const s = withPassive(
      effect([
        { from: 'hp', to: 'atkFlat', ratio: 0.5 },
        { from: 'atk', to: 'hpFlat', ratio: 1 },
      ]),
    );
    // ATK 1950 + 0.5 × 1000 (unconverted HP) = 2450; HP 1000 + 1 × 1950 (unconverted ATK) = 2950
    const r = resolveUnitStats(s, 'dps');
    expect(r.atk).toBe(2450);
    expect(r.hp).toBe(2950);
  });

  it("uses the holder's conditional modifiers for the hit, and its own condition", () => {
    const def = effect([{ from: 'hp', to: 'atkFlat', ratio: 0.5, condition: { damageTags: ['skill'] } }]);
    const s = withPassive({
      ...def,
      modifiers: [{ stat: 'hpFlat', value: 1000, condition: { damageTags: ['skill'] } }],
    });
    const skill = calculateHit(s, { targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['skill'] }, 'dps', 'nonCrit');
    // Skill: HP 1000 + 1000 = 2000 → ATK 1950 + 0.5 × 2000 = 2950
    expect(skill.stats.scalingValue).toBe(2950);
    const basic = calculateHit(s, { targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['basic'] }, 'dps', 'nonCrit');
    expect(basic.stats.scalingValue).toBe(1950);
    // Context-free character sheet: conditional conversion excluded
    expect(resolveUnitStats(s, 'dps').atk).toBe(1950);
  });

  it('follows the source stat when it changes mid-rotation', () => {
    const hpBuff: EffectDef = { id: 'hp', name: 'Fixture HP +100%', kind: 'buff', modifiers: [{ stat: 'hpPct', value: 1 }] };
    const strike = { op: 'hit', hit: { targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['basic'] } } as const;
    const r = runRotation({
      team: [fireDps({ passiveEffects: [effect([{ from: 'hp', to: 'atkFlat', ratio: 0.5 }])] })],
      enemies: [enemy()],
      events: [
        { kind: 'extra', id: 'e1', actorId: 'dps', steps: [strike] },
        { kind: 'extra', id: 'e2', actorId: 'dps', steps: [{ op: 'apply', effect: hpBuff, to: 'dps' }, strike] },
      ],
    });
    // Before: 1950 + 0.5 × 1000 = 2450. After HP +100%: 1950 + 0.5 × 2000 = 2950.
    expect(r.hits.map((h) => h.stats.scalingValue)).toEqual([2450, 2950]);
  });

  it('works on target-held debuffs, e.g. DEF reduction from the source EHR', () => {
    const def: EffectDef = {
      id: 'shred',
      name: 'Fixture DEF reduction = 50% of source EHR',
      kind: 'debuff',
      modifiers: [],
      conversions: [{ from: 'effectHitRate', fromUnit: 'source', to: 'defReduction', ratio: 0.5 }],
    };
    const dps = fireDps();
    const team = [{ ...dps, relics: { ...dps.relics!, stats: [...dps.relics!.stats, { stat: 'effectHitRate' as const, value: 0.4 }] } }];
    const s = applyEffect(createInitialState(team, [enemy()]), def, 'e1', 'dps');
    const c = calculateHit(s, { targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['basic'] }, 'dps', 'nonCrit');
    // defReduction 0.5 × 0.4 = 0.2 → target DEF 1100 × 0.8 = 880
    expect(c.stats.targetDefReduction).toBeCloseTo(0.2, 12);
    expect(c.breakdown.defMultiplier).toBeCloseTo(1000 / 1880, 12);
  });
});

describe('validation', () => {
  it('reports bad conversions', () => {
    const bad = effect([
      { from: 'dmgBoost' as never, to: 'atkFlat', ratio: 1 },
      { from: 'hp', fromUnit: 'target' as never, to: 'nope' as never, ratio: Number.NaN, threshold: Infinity, cap: Number.NaN },
      { from: 'hp', to: 'atkFlat', ratio: 1, condition: { damageTags: ['bogus' as never] } },
    ]);
    const input: RotationInput = { team: [fireDps({ passiveEffects: [bad] })], enemies: [enemy()], events: [] };
    const p = 'team[0].passiveEffects[0].conversions';
    expect(validateRotationInput(input)).toEqual([
      `${p}[0]: unknown conversion source "dmgBoost"`,
      `${p}[1]: fromUnit must be "holder" or "source"`,
      `${p}[1]: unknown stat "nope"`,
      `${p}[1]: ratio must be a finite number`,
      `${p}[1]: threshold must be a finite number`,
      `${p}[1]: cap must be a finite number`,
      `${p}[2]: unknown damage tag "bogus"`,
    ]);
  });
});
