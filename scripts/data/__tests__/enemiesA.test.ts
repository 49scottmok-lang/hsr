// TEST FIXTURE — NOT GAME DATA: every raw row below is synthetic.
import { describe, expect, it } from 'vitest';
import { transformEnemies } from '../enemiesA.ts';
import type { RawEnemiesA, RawModeTables } from '../enemiesA.ts';

const ratios = { HPRatio: { Value: 1 }, DefenceRatio: { Value: 1 }, SpeedRatio: { Value: 1 }, StanceRatio: { Value: 1 } };
const empty: RawModeTables = { groups: [], mazes: [], schedules: [], tierces: [] };

function raw(over: Partial<RawEnemiesA> = {}): RawEnemiesA {
  return {
    monsters: [
      {
        MonsterID: 501,
        MonsterTemplateID: 50,
        MonsterName: { Hash: '1' },
        EliteGroup: 1,
        HPModifyRatio: { Value: 1.5 },
        DefenceModifyRatio: { Value: 1 },
        SpeedModifyRatio: { Value: 1 },
        SpeedModifyValue: { Value: 5 },
        StanceModifyRatio: { Value: 1 },
        StanceWeakList: ['Thunder', 'Fire'],
        DamageTypeResistance: [{ DamageType: 'Ice', Value: { Value: 0.2 } }, { DamageType: 'Wind', Value: {} }],
        DebuffResist: [
          { Key: 'STAT_DOT_Poison', Value: { Value: 0.5 } },
          { Key: 'STAT_CTRL', Value: { Value: 1 } },
        ],
      },
      { MonsterID: 502, MonsterTemplateID: 50, MonsterName: { Hash: '2' }, EliteGroup: 1, HPModifyRatio: { Value: 1 }, DefenceModifyRatio: { Value: 1 }, SpeedModifyRatio: { Value: 1 }, StanceModifyRatio: { Value: 1 }, StanceWeakList: [], DamageTypeResistance: [], DebuffResist: [] },
    ],
    templates: [
      { MonsterTemplateID: 50, Rank: 'LittleBoss', HPBase: { Value: 100 }, DefenceBase: { Value: 210 }, SpeedBase: { Value: 120 }, StanceBase: { Value: 300 }, StatusResistanceBase: { Value: 0.2 } },
    ],
    hardLevels: [
      { HardLevelGroup: 3, Level: 95, ...ratios, StatusResistance: { Value: 0.1 } },
      { HardLevelGroup: 3, Level: 94, ...ratios },
    ],
    eliteGroups: [
      { EliteGroup: 1, ...ratios },
      { EliteGroup: 7, ...ratios, HPRatio: { Value: 6.5 } },
      { EliteGroup: 8, ...ratios },
    ],
    stages: [
      { StageID: 9001, StageType: 'Challenge', HardLevelGroup: 3, Level: 95, EliteGroup: 7, MonsterList: [{ Monster1: 502, Monster0: 501 }, { Monster0: 0 }] },
      { StageID: 9002, StageType: 'Challenge', HardLevelGroup: 3, Level: 95, MonsterList: [{ Monster0: 501 }] },
      { StageID: 9003, StageType: 'Challenge', HardLevelGroup: 3, Level: 95, MonsterList: [{ Monster0: 502 }] },
      { StageID: 8001, StageType: 'Challenge', HardLevelGroup: 3, Level: 94, MonsterList: [{ Monster0: 501 }] },
    ],
    modes: {
      memory: {
        groups: [
          { GroupID: 10, GroupName: { Hash: '10' }, ScheduleDataID: 100, TierceID: 77 },
          { GroupID: 11, GroupName: { Hash: '10' }, ScheduleDataID: 101 }, // starts after the cutoff
          { GroupID: 12, ScheduleDataID: 999 }, // no schedule row
        ],
        mazes: [
          { ID: 1011, GroupID: 10, Floor: 11, EventIDList1: [8001], EventIDList2: [8001] },
          { ID: 1012, GroupID: 10, Floor: 12, EventIDList1: [9001], EventIDList2: [9002] },
          { ID: 1112, GroupID: 11, Floor: 12, EventIDList1: [9001], EventIDList2: [9002] },
        ],
        schedules: [
          { ID: 100, BeginTime: '2026-01-05 04:00:00' },
          { ID: 101, BeginTime: '2026-12-01 04:00:00' },
        ],
        tierces: [{ XQZ: 77, ABC: 1012, LIST: [9003], ELEM: ['Physical'], REWARD: [601, 602] }],
      },
      story: empty,
      boss: empty,
    },
    textMap: { '1': '首領甲', '2': '小怪乙', '10': '測試輪次' },
    ...over,
  };
}

const SELECT = { cutoff: '2026-11-08 04:00:00', groupsPerMode: 3 };

describe('transformEnemies', () => {
  it('takes started rotations, their top floor and the third node found by shape', () => {
    const out = transformEnemies(raw(), SELECT);
    expect(out.stages.map((s) => [s.id, s.groupId, s.floor, s.node, s.startDate])).toEqual([
      ['9001', '10', 12, 1, '2026-01-05'],
      ['9002', '10', 12, 2, '2026-01-05'],
      ['9003', '10', 12, 3, '2026-01-05'],
    ]);
    // Wave keys are ordered by their number; empty slots (0) and empty waves are dropped.
    expect(out.stages[0]).toMatchObject({ level: 95, levelGroup: 3, eliteGroup: 7, waves: [['501', '502']], groupName: '測試輪次' });
    expect(out.stages[1]?.eliteGroup).toBeNull();
  });

  it('keeps only the newest groupsPerMode rotations', () => {
    expect(transformEnemies(raw(), { ...SELECT, groupsPerMode: 0 }).stages).toEqual([]);
  });

  it('copies the enemy, mapping elements and DoT Debuff RES', () => {
    const e = transformEnemies(raw(), SELECT).enemies.find((x) => x.id === '501');
    expect(e).toEqual({
      id: '501',
      templateId: '50',
      name: '首領甲',
      rank: 'LittleBoss',
      weaknesses: ['lightning', 'fire'],
      res: { ice: 0.2, wind: 0 },
      debuffRes: { windShear: 0.5 },
      hp: { base: 100, ratio: 1.5, add: 0 },
      def: { base: 210, ratio: 1, add: 0 },
      spd: { base: 120, ratio: 1, add: 5 },
      stance: { base: 300, ratio: 1, add: 0 },
      effectRes: 0.2,
      eliteGroup: 1,
    });
  });

  it('keeps only the level rows and elite groups in use', () => {
    const out = transformEnemies(raw(), SELECT);
    expect(out.levels).toEqual([{ group: 3, level: 95, ratios: { hp: 1, def: 1, spd: 1, stance: 1 }, effectRes: 0.1 }]);
    expect(out.eliteGroups.map((g) => g.id)).toEqual([1, 7]);
  });

  it('fails loudly on unknown data', () => {
    const r = raw();
    const badKey = { ...r, monsters: [{ ...r.monsters[0]!, DebuffResist: [{ Key: 'STAT_New', Value: { Value: 1 } }] }, r.monsters[1]!] };
    expect(() => transformEnemies(badKey, SELECT)).toThrow(/unknown DebuffResist STAT_New/);
    expect(() => transformEnemies({ ...r, textMap: {} }, SELECT)).toThrow(/text map/);
    const noRatio = { ...r, monsters: [{ ...r.monsters[0]!, HPModifyRatio: undefined }, r.monsters[1]!] };
    expect(() => transformEnemies(noRatio, SELECT)).toThrow(/missing ratio/);
  });
});
