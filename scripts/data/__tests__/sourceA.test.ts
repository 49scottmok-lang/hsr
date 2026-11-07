// TEST FIXTURE — NOT GAME DATA: every raw row below is synthetic.
import { describe, expect, it } from 'vitest';
import { cleanName, parseExcelJson, readObfuscatedProperty, transformNames, transformSourceA } from '../sourceA.ts';
import type { RawNamesA, RawSourceA } from '../sourceA.ts';

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
    avatarBreakDamage: [
      { Level: 2, BreakBaseDamage: { Value: 60.5 } },
      { Level: 1, BreakBaseDamage: { Value: 54 } },
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
    expect(() => transformSourceA(raw({ avatarBreakDamage: [{ Level: 1, BreakBaseDamage: {} }] }))).toThrow(/not positive/);
  });

  it('copies break level multipliers by level, sorted', () => {
    expect(out.breakLevelMultipliers).toEqual([
      { level: 1, value: 54 },
      { level: 2, value: 60.5 },
    ]);
  });
});

describe('transformNames', () => {
  const h = (Hash: string) => ({ Hash });
  const names = (overrides: Partial<RawNamesA> = {}): RawNamesA => ({
    avatars: [
      { AvatarID: 9002, DamageType: 'Fire', Release: true, AvatarName: h('2'), AvatarBaseType: 'Mage' },
      { AvatarID: 9001, DamageType: 'Thunder', Release: true, AvatarName: h('1'), AvatarBaseType: 'Knight' },
      { AvatarID: 9801, DamageType: 'Physical', Release: true, AvatarName: h('9'), AvatarBaseType: 'Knight' },
      { AvatarID: 9003, DamageType: 'Ice', Release: false, AvatarName: h('404'), AvatarBaseType: 'Mage' },
    ],
    equipment: [{ EquipmentID: 9101, Release: true, EquipmentName: h('3'), AvatarBaseType: 'Mage' }],
    relicSets: [
      { SetID: 9201, Release: true, SetName: h('4') },
      { SetID: 9202, Release: false, SetName: h('404') },
    ],
    baseTypes: [
      { ID: 'Mage', BaseTypeText: h('10') },
      { ID: 'Knight', BaseTypeText: h('11') },
      { BaseTypeText: h('12') }, // the "general" row has no ID
    ],
    multiplePathAvatars: [{ AvatarID: 9801, Gender: 'GENDER_WOMAN' }],
    textMap: {
      '1': '甲',
      '2': '乙<unbreak>99</unbreak>',
      '3': '丙',
      '4': '丁',
      '9': '{NICKNAME}',
      '10': '智',
      '11': '護',
      '12': '通',
    },
    ...overrides,
  });

  it('joins text by hash, keeps released rows only, sorts by ID and strips <unbreak>', () => {
    const out = transformNames(names());
    expect(out.paths).toEqual([
      { id: 'Knight', name: '護' },
      { id: 'Mage', name: '智' },
    ]);
    expect(out.characters).toEqual([
      { id: '9001', name: '甲', path: 'Knight' },
      { id: '9002', name: '乙99', path: 'Mage' },
      { id: '9801', name: null, path: 'Knight', gender: 'female' },
    ]);
    expect(out.lightCones).toEqual([{ id: '9101', name: '丙', path: 'Mage' }]);
    expect(out.relicSets).toEqual([{ setId: '9201', name: '丁' }]);
  });

  it('fails loudly on missing text, unknown paths, new markup and nickname rows without a gender', () => {
    expect(() => transformNames(names({ textMap: {} }))).toThrow(/not in the text map/);
    expect(() =>
      transformNames(names({ equipment: [{ EquipmentID: 9101, Release: true, EquipmentName: h('3'), AvatarBaseType: 'Bard' }] })),
    ).toThrow(/unknown path Bard/);
    expect(() => transformNames(names({ multiplePathAvatars: [] }))).toThrow(/without a multi-path gender/);
    expect(() => cleanName('名<color=#fff>', 'test')).toThrow(/markup/);
    expect(() => cleanName(' 名', 'test')).toThrow(/untrimmed/);
  });

  it('keeps 64-bit text hashes exact', () => {
    const raw = '[{"AvatarName":{"Hash":12345678901234567891}}]';
    // A double cannot hold this hash, so plain JSON.parse would give a different text-map key.
    expect(String((JSON.parse(raw) as [{ AvatarName: { Hash: number } }])[0].AvatarName.Hash)).not.toBe('12345678901234567891');
    expect(parseExcelJson(raw)).toEqual([{ AvatarName: { Hash: '12345678901234567891' } }]);
  });
});
