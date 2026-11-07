import { describe, expect, it } from 'vitest';
import { breakLevelMultiplier, characterBase, lightConeBase, relicMainStat, setBonus2pc, statTrace } from '..';
import { FIXTURE_TABLES as T } from './fixtures';

describe('characterBase (base + perLevel × (level − 1))', () => {
  it('level 1, ascension 0 is the base itself', () => {
    const r = characterBase(T, '9001', 1, 0);
    expect(r).toEqual({
      ok: true,
      value: { element: 'fire', base: { hp: 100, atk: 50, def: 40, spd: 100 }, critRate: 0.05, critDmg: 0.5 },
    });
  });

  it('level 20 before and after ascending use different bases', () => {
    // Ascension 0: HP 100 + 5 × 19 = 195, ATK 50 + 2.5 × 19 = 97.5, DEF 40 + 2 × 19 = 78
    const before = characterBase(T, '9001', 20, 0);
    expect(before.ok && before.value.base).toEqual({ hp: 195, atk: 97.5, def: 78, spd: 100 });
    // Ascension 1: HP 140 + 5 × 19 = 235, ATK 70 + 2.5 × 19 = 117.5, DEF 56 + 2 × 19 = 94
    const after = characterBase(T, '9001', 20, 1);
    expect(after.ok && after.value.base).toEqual({ hp: 235, atk: 117.5, def: 94, spd: 100 });
  });

  it('rejects a level outside the ascension range', () => {
    expect(characterBase(T, '9001', 21, 0)).toMatchObject({ ok: false });
    expect(characterBase(T, '9001', 19, 1)).toMatchObject({ ok: false });
    expect(characterBase(T, '9001', 30, 2)).toMatchObject({ ok: false });
    expect(characterBase(T, '9001', 2.5, 0)).toMatchObject({ ok: false });
  });

  it('reports an unknown character', () => {
    expect(characterBase(T, '1', 1, 0)).toEqual({ ok: false, reason: 'character 1 is not in the table' });
  });
});

describe('lightConeBase', () => {
  it('level 10: HP 30 + 4 × 9 = 66, ATK 10 + 1.5 × 9 = 23.5, DEF 10 + 1 × 9 = 19', () => {
    expect(lightConeBase(T, '9101', 10, 0)).toEqual({ ok: true, value: { hp: 66, atk: 23.5, def: 19 } });
  });
});

describe('relicMainStat (base + perLevel × level)', () => {
  it('Head "HP" is flat: +15 = 100 + 30 × 15 = 550', () => {
    const r = relicMainStat(T, 'Head', 5, 'HP', 15);
    expect(r.ok && r.value.modifier).toEqual({ stat: 'hpFlat', value: 550 });
  });

  it('Body "HP" is a percentage: +0 = 0.05, +10 = 0.05 + 0.02 × 10 = 0.25', () => {
    const r0 = relicMainStat(T, 'Body', 5, 'HP', 0);
    expect(r0.ok && r0.value.modifier).toEqual({ stat: 'hpPct', value: 0.05 });
    const r10 = relicMainStat(T, 'Body', 5, 'HP', 10);
    expect(r10.ok && r10.value.modifier?.value).toBeCloseTo(0.25, 12);
  });

  it('elemental DMG keeps its element condition: 0.04 + 0.01 × 5 = 0.09', () => {
    const r = relicMainStat(T, 'Planar Sphere', 5, 'Fire DMG Boost', 5);
    expect(r.ok && r.value.modifier?.condition).toEqual({ elements: ['fire'] });
    expect(r.ok && r.value.modifier?.value).toBeCloseTo(0.09, 12);
  });

  it('a stat the engine does not model has a value but no modifier', () => {
    const r = relicMainStat(T, 'Body', 5, 'Outgoing Healing Boost', 15);
    expect(r.ok && r.value.modifier).toBeNull();
    expect(r.ok && r.value.value).toBeCloseTo(0.18, 12); // 0.03 + 0.01 × 15
  });

  it('rejects an unknown combination and an out-of-range level', () => {
    expect(relicMainStat(T, 'Feet', 5, 'SPD', 15)).toMatchObject({ ok: false });
    expect(relicMainStat(T, 'Head', 5, 'HP', 16)).toMatchObject({ ok: false });
    expect(relicMainStat(T, 'Head', 5, 'HP', -1)).toMatchObject({ ok: false });
  });
});

describe('set and trace lookups', () => {
  it('finds a 2-piece bonus and a stat trace', () => {
    expect(setBonus2pc(T, '9201')?.modifiers).toEqual([{ stat: 'atkPct', value: 0.1 }]);
    expect(statTrace(T, '9001', 'stat_1')?.modifiers).toEqual([{ stat: 'atkPct', value: 0.04 }]);
    expect(statTrace(T, '9001', 'stat_1', 'enhanced')).toBeUndefined();
    expect(setBonus2pc(T, '1')).toBeUndefined();
  });
});

describe('breakLevelMultiplier (exact rows only)', () => {
  it('returns the row for a listed level and misses otherwise', () => {
    expect(breakLevelMultiplier(T, 80)).toEqual({ ok: true, value: 4000 });
    expect(breakLevelMultiplier(T, 79)).toEqual({ ok: false, reason: 'no break level multiplier for level 79' });
  });
});
