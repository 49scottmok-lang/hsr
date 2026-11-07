// TEST FIXTURE — NOT GAME DATA: every raw row below is synthetic.
import { describe, expect, it } from 'vitest';
import { readObfuscatedProperty, transformSourceA } from '../sourceA.ts';
import type { RawSourceA } from '../sourceA.ts';

const promo = (promotion: number | undefined, maxLevel: number) => ({
  ...(promotion === undefined ? {} : { Promotion: promotion }),
  MaxLevel: maxLevel,
  HPBase: { Value: 100 },
  HPAdd: { Value: 5 },
  AttackBase: { Value: 50 },
  AttackAdd: {}, // the game omits zero values
  DefenceBase: { Value: 40 },
  DefenceAdd: { Value: 2 },
  SpeedBase: { Value: 100 },
  CriticalChance: { Value: 0.05 },
  CriticalDamage: { Value: 0.5 },
});

const point = (id: number, avatar: number, anchor: string, prop: string, value: number) => ({
  PointID: id,
  Level: 1,
  AvatarID: avatar,
  PointType: 1,
  AnchorType: anchor,
  StatusAddList: [{ PropertyType: prop, Value: { Value: value } }],
});

function raw(overrides: Partial<RawSourceA> = {}): RawSourceA {
  return {
    avatars: [
      { AvatarID: 9001, DamageType: 'Thunder', Release: true },
      { AvatarID: 9002, DamageType: 'Fire', Release: false },
    ],
    avatarPromotions: [
      { AvatarID: 9001, ...promo(1, 30) },
      { AvatarID: 9001, ...promo(undefined, 20) },
      { AvatarID: 9002, ...promo(undefined, 20) },
    ],
    equipment: [{ EquipmentID: 9101, Release: true }],
    equipmentPromotions: [
      {
        EquipmentID: 9101,
        MaxLevel: 20,
        BaseHP: { Value: 30 },
        BaseHPAdd: { Value: 4 },
        BaseAttack: { Value: 10 },
        BaseAttackAdd: { Value: 1.5 },
        BaseDefence: { Value: 10 },
        BaseDefenceAdd: { Value: 1 },
      },
    ],
    relics: [
      { Type: 'HEAD', MaxLevel: 15, MainAffixGroup: 51, Mode: 'BASIC' },
      { Type: 'BODY', MaxLevel: 15, MainAffixGroup: 53, Mode: 'BASIC' },
      { Type: 'BODY', MaxLevel: 12, MainAffixGroup: 999, Mode: 'CUSTOM' },
    ],
    relicMainAffixes: [
      { GroupID: 51, AffixID: 1, Property: 'HPDelta', BaseValue: { Value: 100 }, LevelAdd: { Value: 30 } },
      { GroupID: 53, AffixID: 1, Property: 'HPAddedRatio', BaseValue: { Value: 0.05 }, LevelAdd: { Value: 0.02 } },
      { GroupID: 53, AffixID: 2, Property: 'HealRatioBase', BaseValue: { Value: 0.03 }, LevelAdd: { Value: 0.01 } },
    ],
    relicSets: [
      { SetID: 9201, Release: true },
      { SetID: 9202, Release: true },
      { SetID: 9203, Release: false },
    ],
    relicSetSkills: [
      { SetID: 9201, RequireNum: 2, PropertyList: [{ XQZ: 'AttackAddedRatio', PLM: { Value: 0.1 } }], AbilityName: '' },
      { SetID: 9201, RequireNum: 4, PropertyList: [{ XQZ: 'CriticalChanceBase', PLM: { Value: 0.1 } }] },
      { SetID: 9202, RequireNum: 2, PropertyList: [], AbilityName: 'Ability1' },
      { SetID: 9203, RequireNum: 2, PropertyList: [{ A: 'AttackAddedRatio', B: { Value: 0.1 } }] },
    ],
    skillTree: [
      point(9001201, 9001, 'Point09', 'AttackAddedRatio', 0.04),
      point(9001210, 9001, 'Point18', 'ThunderAddedRatio', 0.032),
      point(19001201, 9001, 'Point09', 'StatusProbabilityBase', 0.04),
      point(9001202, 9001, 'Point10', 'ElationDamageAddedRatioBase', 0.05),
      { ...point(9001001, 9001, 'Point01', 'AttackAddedRatio', 1), PointType: 2 },
      point(9002201, 9002, 'Point09', 'AttackAddedRatio', 0.04),
    ],
    ...overrides,
  };
}

describe('transformSourceA', () => {
  const out = transformSourceA(raw());

  it('keeps released characters only, sorts ascensions, maps Thunder to lightning, and reads {} as 0', () => {
    expect(out.characters.map((c) => c.id)).toEqual(['9001']);
    const c = out.characters[0]!;
    expect(c.element).toBe('lightning');
    expect(c.ascensions.map((a) => [a.ascension, a.maxLevel])).toEqual([
      [0, 20],
      [1, 30],
    ]);
    expect(c.ascensions[0]!.atk).toEqual({ base: 50, perLevel: 0 });
  });

  it('maps relic slot and rarity (MaxLevel / 3) to the main affix group, skipping CUSTOM relics', () => {
    expect(out.relicMainStats.map((r) => [r.slot, r.rarity, r.groupId, r.exportName, r.target?.stat ?? null])).toEqual([
      ['Head', 5, 51, 'HP', 'hpFlat'],
      ['Body', 5, 53, 'HP', 'hpPct'],
      ['Body', 5, 53, 'Outgoing Healing Boost', null],
    ]);
  });

  it('tabulates released 2-piece PropertyList bonuses only', () => {
    expect(out.setBonuses).toEqual([
      { setId: '9201', pieces: 2, modifiers: [{ stat: 'atkPct', value: 0.1 }], unsupported: [], hasAbilityPart: false },
    ]);
  });

  it('maps anchors Point09–Point18 to stat_1–stat_10 and splits base and enhanced trees', () => {
    expect(out.traces.map((t) => [t.pointId, t.tree, t.trace])).toEqual([
      ['9001201', 'base', 'stat_1'],
      ['9001202', 'base', 'stat_2'],
      ['9001210', 'base', 'stat_10'],
      ['19001201', 'enhanced', 'stat_1'],
    ]);
    expect(out.traces[2]!.modifiers).toEqual([{ stat: 'dmgBoost', value: 0.032, condition: { elements: ['lightning'] } }]);
    expect(out.traces[1]!.unsupported).toEqual([{ property: 'ElationDamageAddedRatioBase', value: 0.05 }]);
  });

  it('fails loudly on unknown properties and odd shapes', () => {
    expect(() => transformSourceA(raw({ skillTree: [point(9001201, 9001, 'Point09', 'LuckRatio', 0.1)] }))).toThrow(/unknown game property/);
    expect(() => transformSourceA(raw({ skillTree: [point(9001201, 9001, 'Point20', 'AttackAddedRatio', 0.1)] }))).toThrow(/unexpected anchor/);
    expect(() => transformSourceA(raw({ avatars: [{ AvatarID: 9001, DamageType: 'Light', Release: true }] }))).toThrow(/DamageType/);
    expect(() => readObfuscatedProperty({ A: 'x', B: 'y' }, 'test')).toThrow(/cannot read/);
  });
});
