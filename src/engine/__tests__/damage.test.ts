import { describe, expect, it } from 'vitest';
import { calculateHit, computeBreakdown } from '../damage';
import { applyEffect } from '../effects';
import { createInitialState } from '../rotation';
import { resolveUnitStats } from '../stats';
import type { CombatState, EffectDef, HitSpec } from '../types';
import { EXPECTED_SKILL_HIT, enemy, fireDps, skillDmgBuff, support } from './fixtures';

function stateWithSkillBuff(): CombatState {
  const s = createInitialState([fireDps(), support()], [enemy()]);
  return applyEffect(s, skillDmgBuff, 'dps', 'sup');
}

const skillHit: HitSpec = { targetId: 'e1', scaling: 'atk', multiplier: 2.0, tags: ['skill'] };

describe('resolveUnitStats', () => {
  it('combines character, light cone, relic stats', () => {
    const s = createInitialState([fireDps()], [enemy()]);
    const st = resolveUnitStats(s, 'dps');
    expect(st.atk).toBe(1950);
    expect(st.hp).toBe(1000);
    expect(st.critRate).toBeCloseTo(0.7, 12);
    expect(st.critDmg).toBeCloseTo(1.5, 12);
  });

  it('excludes conditional modifiers without a hit context', () => {
    const st = resolveUnitStats(stateWithSkillBuff(), 'dps');
    expect(st.dmgBoost).toBe(0);
  });

  it('enemy DEF uses 200 + 10 × level when baseDef is omitted, and honours overrides', () => {
    expect(resolveUnitStats(createInitialState([fireDps()], [enemy()]), 'e1').def).toBe(1100);
    expect(resolveUnitStats(createInitialState([fireDps()], [enemy({ baseDef: 777 })]), 'e1').def).toBe(777);
  });
});

describe('calculateHit', () => {
  it('matches the hand-computed worked example (docs/FORMULAS.md §Worked example)', () => {
    const r = calculateHit(stateWithSkillBuff(), skillHit, 'dps', 'expected');
    expect(r.breakdown.baseDmg).toBe(3900);
    expect(r.breakdown.critMultiplier).toBeCloseTo(2.05, 12);
    expect(r.breakdown.dmgBoostMultiplier).toBeCloseTo(1.6, 12);
    expect(r.breakdown.defMultiplier).toBeCloseTo(1000 / 2100, 12);
    expect(r.breakdown.resMultiplier).toBeCloseTo(0.8, 12);
    expect(r.breakdown.brokenMultiplier).toBe(0.9);
    expect(r.breakdown.total).toBeCloseTo(EXPECTED_SKILL_HIT, 6);
    expect(r.breakdown.total).toBeCloseTo(4385.828571428571, 6);
  });

  it('crit and non-crit modes', () => {
    const s = stateWithSkillBuff();
    const crit = calculateHit(s, skillHit, 'dps', 'crit').breakdown.total;
    const non = calculateHit(s, skillHit, 'dps', 'nonCrit').breakdown.total;
    expect(crit / non).toBeCloseTo(2.5, 12);
    expect(non).toBeCloseTo(EXPECTED_SKILL_HIT / 2.05, 6);
  });

  it('tag-conditional buffs do not apply to other tags', () => {
    const r = calculateHit(stateWithSkillBuff(), { ...skillHit, tags: ['basic'] }, 'dps', 'expected');
    expect(r.breakdown.dmgBoostMultiplier).toBeCloseTo(1.4, 12);
  });

  it('multi-tag hits match a condition on any of their tags', () => {
    const r = calculateHit(stateWithSkillBuff(), { ...skillHit, tags: ['followUp', 'skill'] }, 'dps', 'expected');
    expect(r.breakdown.dmgBoostMultiplier).toBeCloseTo(1.6, 12);
  });

  it('element-conditional buffs and enemy RES follow the hit element', () => {
    const r = calculateHit(stateWithSkillBuff(), { ...skillHit, element: 'ice' }, 'dps', 'expected');
    expect(r.element).toBe('ice');
    expect(r.breakdown.dmgBoostMultiplier).toBeCloseTo(1.2, 12); // only the skill buff
    expect(r.breakdown.resMultiplier).toBe(1); // no ice RES configured
  });

  it('DoT cannot crit by default; canCrit overrides', () => {
    const s = stateWithSkillBuff();
    expect(calculateHit(s, { ...skillHit, tags: ['dot'] }, 'dps', 'crit').breakdown.critMultiplier).toBe(1);
    expect(calculateHit(s, { ...skillHit, tags: ['dot'], canCrit: true }, 'dps', 'crit').canCrit).toBe(true);
  });

  it('applies target-side debuffs and attacker weaken', () => {
    const debuff: EffectDef = {
      id: 'shred',
      name: 'Fixture shred',
      kind: 'debuff',
      modifiers: [
        { stat: 'defReduction', value: 0.4 },
        { stat: 'resReduction', value: 0.1 },
        { stat: 'vulnerability', value: 0.25 },
        { stat: 'dmgMitigation', value: 0.2 },
        { stat: 'dmgMitigation', value: 0.1 },
      ],
    };
    const weaken: EffectDef = { id: 'weak', name: 'Fixture weaken', kind: 'debuff', modifiers: [{ stat: 'weaken', value: 0.1 }] };
    let s = applyEffect(stateWithSkillBuff(), debuff, 'e1', 'sup');
    s = applyEffect(s, weaken, 'dps', 'e1');
    const b = calculateHit(s, skillHit, 'dps', 'expected').breakdown;
    expect(b.defMultiplier).toBeCloseTo(1000 / (660 + 1000), 12);
    expect(b.resMultiplier).toBeCloseTo(0.9, 12);
    expect(b.vulnerabilityMultiplier).toBeCloseTo(1.25, 12);
    expect(b.mitigationMultiplier).toBeCloseTo(0.72, 12);
    expect(b.weakenMultiplier).toBeCloseTo(0.9, 12);
  });

  it('counterpartIds restricts a target-held modifier to a specific attacker', () => {
    const mark: EffectDef = {
      id: 'mark',
      name: 'Fixture mark',
      kind: 'debuff',
      modifiers: [{ stat: 'vulnerability', value: 0.5, condition: { counterpartIds: ['sup'] } }],
    };
    const s = applyEffect(stateWithSkillBuff(), mark, 'e1', 'sup');
    expect(calculateHit(s, skillHit, 'dps', 'expected').breakdown.vulnerabilityMultiplier).toBe(1);
    expect(
      calculateHit(s, { ...skillHit, attackerId: 'sup' }, 'dps', 'expected').breakdown.vulnerabilityMultiplier,
    ).toBe(1.5);
  });

  it('final DMG sources multiply separately and respect conditions; true DMG adds', () => {
    const fin: EffectDef = {
      id: 'final',
      name: 'Fixture final DMG',
      kind: 'buff',
      modifiers: [
        { stat: 'finalDmgBoost', value: 0.3, condition: { damageTags: ['ultimate'] } },
        { stat: 'finalDmgBoost', value: 0.2 },
        { stat: 'trueDmg', value: 0.1 },
        { stat: 'trueDmg', value: 0.15 },
      ],
    };
    const s = applyEffect(stateWithSkillBuff(), fin, 'dps', 'dps');
    const skillB = calculateHit(s, skillHit, 'dps', 'expected').breakdown;
    expect(skillB.finalDmgMultiplier).toBeCloseTo(1.2, 12);
    expect(skillB.trueDmgMultiplier).toBeCloseTo(1.25, 12);
    expect(skillB.total).toBeCloseTo(EXPECTED_SKILL_HIT * 1.2 * 1.25, 6);
    const ultB = calculateHit(s, { ...skillHit, tags: ['ultimate'] }, 'dps', 'expected').breakdown;
    expect(ultB.finalDmgMultiplier).toBeCloseTo(1.3 * 1.2, 12);
  });

  it('vulnerability is capped at +250%', () => {
    const big: EffectDef = { id: 'v', name: 'Fixture vuln', kind: 'debuff', modifiers: [{ stat: 'vulnerability', value: 3 }] };
    const s = applyEffect(stateWithSkillBuff(), big, 'e1', 'sup');
    expect(calculateHit(s, skillHit, 'dps', 'expected').breakdown.vulnerabilityMultiplier).toBe(3.5);
  });

  it('HP scaling uses final HP', () => {
    const r = calculateHit(stateWithSkillBuff(), { ...skillHit, attackerId: 'sup', scaling: 'hp', multiplier: 1 }, 'dps', 'nonCrit');
    expect(r.stats.scalingValue).toBe(2000);
    expect(r.breakdown.baseDmg).toBe(2000);
  });

  it('stacks multiply modifier values', () => {
    const stacking: EffectDef = {
      id: 'stack',
      name: 'Fixture stacking',
      kind: 'buff',
      maxStacks: 3,
      modifiers: [{ stat: 'atkPct', value: 0.1 }],
    };
    const s = applyEffect(createInitialState([fireDps()], [enemy()]), stacking, 'dps', 'dps', 2);
    expect(resolveUnitStats(s, 'dps').atk).toBeCloseTo(1100 * 1.7 + 300, 9);
  });

  it('computeBreakdown is usable without CombatState', () => {
    const b = computeBreakdown({
      multiplier: 1,
      canCrit: false,
      critMode: 'expected',
      stats: {
        scalingValue: 1000,
        critRate: 0,
        critDmg: 0,
        dmgBoost: 0,
        weaken: 0,
        finalDmgBoosts: [],
        trueDmg: 0,
        defIgnore: 0,
        resPen: 0,
        targetBaseDef: 1000,
        targetDefPct: 0,
        targetDefFlat: 0,
        targetDefReduction: 0,
        targetBaseRes: 0,
        targetResReduction: 0,
        vulnerability: 0,
        mitigations: [],
        attackerLevel: 80,
        targetBroken: true,
      },
    });
    expect(b.total).toBe(500);
  });
});
