import { describe, expect, it } from 'vitest';
import * as f from '../formulas';

describe('formulas', () => {
  it('enemy base DEF = 200 + 10 × level', () => {
    expect(f.enemyBaseDef(90)).toBe(1100);
    expect(f.enemyBaseDef(80)).toBe(1000);
  });

  it('finalStat = base × (1 + pct) + flat', () => {
    expect(f.finalStat(1100, 0.5, 300)).toBe(1950);
  });

  it('baseDmg = (mult + extra) × scaling + flat', () => {
    expect(f.baseDmg(1.5, 0.5, 1000, 100)).toBe(2100);
  });

  describe('critMultiplier', () => {
    it('expected = 1 + CR × CD', () => {
      expect(f.critMultiplier('expected', true, 0.7, 1.5)).toBeCloseTo(2.05, 12);
    });
    it('clamps CR to [0, 1] in expected mode', () => {
      expect(f.critMultiplier('expected', true, 1.2, 1.5)).toBe(2.5);
      expect(f.critMultiplier('expected', true, -0.1, 1.5)).toBe(1);
    });
    it('crit / nonCrit / cannot-crit', () => {
      expect(f.critMultiplier('crit', true, 0.1, 1.5)).toBe(2.5);
      expect(f.critMultiplier('nonCrit', true, 1, 1.5)).toBe(1);
      expect(f.critMultiplier('crit', false, 1, 1.5)).toBe(1);
    });
  });

  describe('DEF', () => {
    it('equal levels with no DEF changes gives 0.5', () => {
      const def = f.targetDef(f.enemyBaseDef(80), 0, 0, 0, 0);
      expect(f.defMultiplier(def, 80)).toBe(0.5);
    });
    it('Lv80 attacker vs Lv90 enemy = 1000/2100', () => {
      expect(f.defMultiplier(1100, 80)).toBeCloseTo(1000 / 2100, 12);
    });
    it('DEF reduction and DEF ignore subtract from the same pool', () => {
      const def = f.targetDef(1100, 0, 0, 0.4, 0.2);
      expect(def).toBeCloseTo(440, 9);
      expect(f.defMultiplier(def, 80)).toBeCloseTo(1000 / 1440, 12);
    });
    it('DEF% bonus on the target increases DEF', () => {
      expect(f.targetDef(1000, 0.5, 0, 0, 0)).toBe(1500);
    });
    it('DEF floors at 0, giving multiplier 1', () => {
      const def = f.targetDef(1100, 0, 0, 1.5, 0);
      expect(def).toBe(0);
      expect(f.defMultiplier(def, 80)).toBe(1);
    });
  });

  describe('RES', () => {
    it('1 − (RES − PEN − reduction)', () => {
      expect(f.resMultiplier(0.2, 0, 0)).toBeCloseTo(0.8, 12);
      expect(f.resMultiplier(0.2, 0.3, 0.1)).toBeCloseTo(1.2, 12);
    });
    it('clamps to [0.1, 2.0]', () => {
      expect(f.resMultiplier(-1.5, 0, 0)).toBe(2);
      expect(f.resMultiplier(0.95, 0, 0)).toBe(0.1);
    });
  });

  it('weaken multiplier, floored at 0', () => {
    expect(f.weakenMultiplier(0.1)).toBeCloseTo(0.9, 12);
    expect(f.weakenMultiplier(1.5)).toBe(0);
  });

  it('combined weaken multiplies sources (E1, R3 srsim)', () => {
    // 1 − (1 − 0.1)(1 − 0.2) = 1 − 0.72 = 0.28, not 0.3
    expect(f.combinedWeaken([0.1, 0.2])).toBeCloseTo(0.28, 12);
    expect(f.weakenMultiplier(f.combinedWeaken([0.1, 0.2]))).toBeCloseTo(0.72, 12);
    expect(f.combinedWeaken([])).toBe(0);
    // Each factor is floored at 0: (0)(0) = 0, so the result is 1, not 1 − 0.04.
    expect(f.combinedWeaken([1.2, 1.2])).toBe(1);
  });

  it('vulnerability multiplier is additive, clamped to [0, 2.5]', () => {
    expect(f.vulnerabilityMultiplier(0.35)).toBeCloseTo(1.35, 12);
    expect(f.vulnerabilityMultiplier(2.5)).toBe(3.5);
    expect(f.vulnerabilityMultiplier(3.0)).toBe(3.5);
    expect(f.vulnerabilityMultiplier(-0.2)).toBe(1);
  });

  it('final DMG multiplies each source; true DMG adds', () => {
    expect(f.finalDmgMultiplier([0.3, 0.2])).toBeCloseTo(1.3 * 1.2, 12);
    expect(f.finalDmgMultiplier([])).toBe(1);
    expect(f.trueDmgMultiplier(0.25)).toBe(1.25);
  });

  it('mitigation multiplies each instance', () => {
    expect(f.mitigationMultiplier([0.2, 0.1])).toBeCloseTo(0.72, 12);
    expect(f.mitigationMultiplier([])).toBe(1);
  });

  it('broken multiplier', () => {
    expect(f.brokenMultiplier(true)).toBe(1);
    expect(f.brokenMultiplier(false)).toBe(0.9);
  });

  it('action value = 10000 / SPD', () => {
    expect(f.actionValue(100)).toBe(100);
    expect(f.actionValue(134)).toBeCloseTo(74.6268656716, 9);
    expect(() => f.actionValue(0)).toThrow(RangeError);
  });

  // TEST FIXTURE — NOT GAME DATA: base 100, add 5 (synthetic).
  it('promotedBaseStat = base + add × (level − 1)', () => {
    expect(f.promotedBaseStat(100, 5, 1)).toBe(100); // 100 + 5 × 0
    expect(f.promotedBaseStat(100, 5, 20)).toBe(195); // 100 + 5 × 19
    expect(f.promotedBaseStat(100, 5, 80)).toBe(495); // 100 + 5 × 79
    expect(f.promotedBaseStat(144, 7.2, 80)).toBeCloseTo(712.8, 9); // 144 + 568.8
  });

  // TEST FIXTURE — NOT GAME DATA: base 10, perLevel 2 (synthetic).
  it('relicMainStatValue = base + perLevel × level (levels start at +0)', () => {
    expect(f.relicMainStatValue(10, 2, 0)).toBe(10); // 10 + 2 × 0
    expect(f.relicMainStatValue(10, 2, 15)).toBe(40); // 10 + 2 × 15
    expect(f.relicMainStatValue(0.05, 0.01, 12)).toBeCloseTo(0.17, 12); // 0.05 + 0.12
  });
});
