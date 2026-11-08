// TEST FIXTURE — NOT GAME DATA: every raw row and description below is synthetic,
// written in the shape of A's AvatarSkillConfig / TextMapCHT.
import { describe, expect, it } from 'vitest';
import { parseDamage, plainDescription, transformSkills } from '../skillsA.ts';
import type { RawSkill, RawSkillsA } from '../skillsA.ts';

const pct = (k: number) => `<color=#f29e38ff><unbreak>#${k}[i]%</unbreak></color>`;

describe('parseDamage', () => {
  it('reads one single-target hit', () => {
    expect(parseDamage(`對指定敵方單體造成等同於測試${pct(1)}攻擊力的火屬性傷害。`, 'SingleAttack')).toEqual({
      damage: [{ area: 'target', scaling: 'atk', param: 1, element: 'fire' }],
      otherEffects: false,
    });
  });

  it('reads Blast as main + adjacent, in order, and HP scaling', () => {
    const text = `對指定敵方單體造成等同於測試${pct(2)}生命上限的冰屬性傷害，同時對其相鄰目標造成等同於測試${pct(3)}生命上限的冰屬性傷害。`;
    expect(parseDamage(text, 'Blast').damage).toEqual([
      { area: 'target', scaling: 'hp', param: 2, element: 'ice' },
      { area: 'adjacent', scaling: 'hp', param: 3, element: 'ice' },
    ]);
  });

  it('reads AoE and flags the other effects it skipped', () => {
    const parsed = parseDamage(`對敵方全體造成等同於測試${pct(1)}攻擊力的雷屬性傷害，每消滅1個敵方目標額外恢復#2[i]點能量。`, 'AoEAttack');
    expect(parsed.damage).toEqual([{ area: 'all', scaling: 'atk', param: 1, element: 'lightning' }]);
    expect(parsed.otherEffects).toBe(true);
    expect(parsed.unsupported).toBeUndefined();
  });

  it('a damage buff is another effect, not unread damage', () => {
    const parsed = parseDamage(`對指定敵方單體造成等同於測試${pct(1)}攻擊力的風屬性傷害。若目標處於減速狀態，造成的傷害提高#2[i]%。`, 'SingleAttack');
    expect(parsed.unsupported).toBeUndefined();
    expect(parsed.otherEffects).toBe(true);
  });

  it('accepts a support skill with no damage', () => {
    expect(parseDamage('使我方全體攻擊力提高#1[i]%，持續#2[i]回合。', 'Support')).toEqual({ damage: [], otherEffects: true });
  });

  it.each([
    ['bounces', `對指定敵方單體造成等同於測試${pct(1)}攻擊力的火屬性傷害，並額外造成2次傷害。`, 'Bounce'],
    ['random targets', `對指定敵方單體造成等同於測試${pct(1)}攻擊力的火屬性傷害。每次傷害對敵方隨機單體造成等同於測試${pct(1)}攻擊力的火屬性傷害。`, 'SingleAttack'],
    ['an HP cost before the hit', `消耗等同於測試生命上限#1[i]%的生命值對指定敵方單體造成等同於測試${pct(2)}攻擊力的火屬性傷害。`, 'SingleAttack'],
    ['a two-stat multiplier', `對指定敵方單體造成等同於測試${pct(1)}攻擊力+${pct(2)}生命上限的火屬性傷害。`, 'SingleAttack'],
    ['an area that does not match the effect', `對指定敵方單體造成等同於測試${pct(1)}攻擊力的火屬性傷害。`, 'Blast'],
    ['a damage effect with no damage sentence', '使指定敵方單體陷入凍結狀態。', 'SingleAttack'],
  ])('rejects %s', (_, text, effect) => {
    const parsed = parseDamage(text, effect);
    expect(parsed.unsupported).toBeDefined();
    expect(parsed.damage).toEqual([]);
  });

  it('turns literal \\n line breaks into sentence ends', () => {
    expect(plainDescription('<i>甲</i>\\n乙')).toBe('甲。乙');
  });
});

const row = (SkillID: number, Level: number, over: Partial<RawSkill> = {}): RawSkill => ({
  SkillID,
  Level,
  SkillName: { Hash: `n${SkillID}` },
  SkillDesc: { Hash: `d${SkillID}` },
  StanceDamageType: 'Fire',
  ParamList: [{ Value: Level / 10 }, { Value: Level / 100 }],
  ...over,
});

function raw(): RawSkillsA {
  return {
    avatars: [
      { AvatarID: 9001, DamageType: 'Fire', Release: true, RankIDList: [900101, 900103] },
      { AvatarID: 9002, DamageType: 'Ice', Release: false },
    ],
    skillTree: [
      { PointID: 9001001, Level: 1, AvatarID: 9001, AnchorType: 'Point01', LevelUpSkillID: [900101] },
      { PointID: 9001002, Level: 1, AvatarID: 9001, AnchorType: 'Point02', LevelUpSkillID: [900102] },
      { PointID: 9001003, Level: 1, AvatarID: 9001, AnchorType: 'Point03', LevelUpSkillID: [900103] },
      { PointID: 9001004, Level: 1, AvatarID: 9001, AnchorType: 'Point04', LevelUpSkillID: [900104] },
    ],
    skills: [
      row(900101, 1, { AttackType: 'Normal', SkillEffect: 'SingleAttack', SPBase: { Value: 20 }, BPAdd: { Value: 1 }, BPNeed: { Value: -1 } }),
      row(900101, 2, { AttackType: 'Normal', SkillEffect: 'SingleAttack', SPBase: { Value: 20 }, BPAdd: { Value: 1 }, BPNeed: { Value: -1 } }),
      row(900102, 1, { AttackType: 'BPSkill', SkillEffect: 'Blast', SPBase: { Value: 30 }, BPNeed: { Value: 1 } }),
      row(900103, 1, { AttackType: 'Ultra', SkillEffect: 'AoEAttack', SPBase: { Value: 5 }, StanceDamageType: 'Ice' }),
    ],
    ranks: [
      { RankID: 900101, Rank: 1, SkillAddLevelList: {} },
      { RankID: 900103, Rank: 3, SkillAddLevelList: { '900101': 1, '900102': 2, '900104': 2 } },
    ],
    textMap: {
      n900101: '普攻', n900102: '戰技', n900103: '終結技',
      d900101: `對指定敵方單體造成等同於測試${pct(1)}攻擊力的火屬性傷害。`,
      d900102: `對指定敵方單體造成等同於測試${pct(1)}攻擊力的火屬性傷害，同時對其相鄰目標造成等同於測試${pct(2)}攻擊力的火屬性傷害。`,
      // The description says fire, but the row deals ice: must not be trusted.
      d900103: `對敵方全體造成等同於測試${pct(1)}攻擊力的火屬性傷害。`,
    },
  };
}

describe('transformSkills', () => {
  const [kit, ...rest] = transformSkills(raw());

  it('one base kit per released character', () => {
    expect(rest).toEqual([]);
    expect(kit).toMatchObject({ characterId: '9001', tree: 'base' });
  });

  it('copies multipliers per level, Energy and skill points', () => {
    expect(kit!.skills[0]).toEqual({
      skillId: '900101', slot: 'basic', variant: 0, name: '普攻', element: 'fire',
      energy: 20, skillPointGain: 1, skillPointCost: 0, maxLevel: 2,
      damage: [{ area: 'target', scaling: 'atk', multipliers: [0.1, 0.2] }],
      otherEffects: false,
    });
    expect(kit!.skills[1]).toMatchObject({
      slot: 'skill', skillPointGain: 0, skillPointCost: 1,
      damage: [{ area: 'target', multipliers: [0.1] }, { area: 'adjacent', multipliers: [0.01] }],
    });
  });

  it('marks a description whose element differs from the row as unsupported', () => {
    expect(kit!.skills[2]).toMatchObject({ slot: 'ultimate', element: 'ice', damage: [] });
    expect(kit!.skills[2]!.unsupported).toMatch(/element/);
  });

  it('maps eidolon skill levels to slots and drops the talent', () => {
    expect(kit!.eidolonLevels).toEqual([
      { eidolon: 3, slot: 'basic', add: 1 },
      { eidolon: 3, slot: 'skill', add: 2 },
    ]);
  });

  it('throws when levels have gaps or a slot has the wrong attack type', () => {
    const gap = raw();
    gap.skills = gap.skills.filter((s) => !(s.SkillID === 900101 && s.Level === 1));
    expect(() => transformSkills(gap)).toThrow(/levels/);
    const wrong = raw();
    wrong.skills = wrong.skills.map((s) => (s.SkillID === 900102 ? { ...s, AttackType: 'Normal' } : s));
    expect(() => transformSkills(wrong)).toThrow(/AttackType/);
  });
});
