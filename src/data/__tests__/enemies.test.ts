import { describe, expect, it } from 'vitest';
import { formulas } from '../../engine';
import { ENEMY_TABLES, endgameStages, stageEnemies, stageEnemyConfig, validateEnemyTables } from '..';
import type { EnemyRecord, EnemyTables, StageEnemy } from '..';
import { FIXTURE_SOURCE } from './fixtures';

// TEST FIXTURE — NOT GAME DATA: every record below is synthetic.
const cite = { source: FIXTURE_SOURCE, gameVersion: '1.0' } as const;
const one = { hp: 1, def: 1, spd: 1, stance: 1 } as const;

const enemy = (over: Partial<EnemyRecord> & Pick<EnemyRecord, 'id'>): EnemyRecord => ({
  ...cite,
  templateId: '1',
  name: '測試敵人',
  rank: 'Elite',
  weaknesses: ['fire'],
  res: { ice: 0.2 },
  debuffRes: {},
  hp: { base: 1000, ratio: 1.5, add: 0 },
  def: { base: 150, ratio: 1, add: 0 },
  spd: { base: 100, ratio: 1.2, add: 10 },
  stance: { base: 300, ratio: 1, add: 0 },
  effectRes: 0.2,
  eliteGroup: 1,
  ...over,
});

const T: EnemyTables = {
  enemies: [
    enemy({ id: '11' }),
    enemy({
      id: '12',
      name: '測試首領',
      rank: 'LittleBoss',
      debuffRes: { burn: 0.5 },
      hp: { base: 500, ratio: 1, add: 0 },
      def: { base: 150, ratio: 1.1, add: 0 },
      spd: { base: 80, ratio: 1, add: 0 },
      stance: { base: 60, ratio: 1, add: 0 },
      effectRes: 0,
      eliteGroup: 2,
    }),
  ],
  levels: [{ ...cite, group: 3, level: 10, ratios: { hp: 300, def: 2, spd: 1.32, stance: 1 }, effectRes: 0.1 }],
  eliteGroups: [
    { ...cite, id: 1, ratios: one },
    { ...cite, id: 2, ratios: { ...one, hp: 2 } },
    { ...cite, id: 9, ratios: { hp: 6.5, def: 1, spd: 1, stance: 1.5 } },
  ],
  stages: [
    {
      ...cite,
      id: '100',
      mode: 'memory',
      groupId: '7',
      groupName: '測試輪次',
      startDate: '2026-01-01',
      floor: 12,
      node: 1,
      level: 10,
      levelGroup: 3,
      eliteGroup: 9,
      waves: [['11'], ['12']],
    },
    {
      ...cite,
      id: '101',
      mode: 'memory',
      groupId: '7',
      groupName: '測試輪次',
      startDate: '2026-01-01',
      floor: 12,
      node: 2,
      level: 10,
      levelGroup: 3,
      eliteGroup: null,
      waves: [['11']],
    },
  ],
};

const resolve = (tables: EnemyTables, id: string): readonly (readonly StageEnemy[])[] => {
  const r = stageEnemies(tables, id);
  if (!r.ok) throw new Error(r.reason);
  return r.value;
};

describe('stageEnemies (base × ratios + add, docs/FORMULAS.md § Enemy stats)', () => {
  it('applies own elite, stage elite and level ratios', () => {
    const [[a], [b]] = resolve(T, '100') as [[StageEnemy], [StageEnemy]];
    // Enemy 11: elite 1 (all 1), stage elite 9, level 3/10.
    expect(a.hp).toBeCloseTo(2_925_000, 6); // 1000 × 1.5 × 6.5 × 300
    expect(a.def).toBe(300); // 150 × 2
    expect(a.spd).toBeCloseTo(168.4, 9); // 100 × 1.2 × 1.32 + 10
    expect(a.toughness).toBeCloseTo(150, 9); // 300 × 1.5 / 3
    expect(a.effectRes).toBeCloseTo(0.3, 12); // 0.2 + 0.1
    expect([a.wave, a.slot, a.level]).toEqual([1, 1, 10]);
    // Enemy 12: elite 2 (HP × 2), stage elite 9, level 3/10.
    expect(b.hp).toBeCloseTo(1_950_000, 6); // 500 × 2 × 6.5 × 300
    expect(b.def).toBeCloseTo(330, 9); // 150 × 1.1 × 2
    expect(b.spd).toBeCloseTo(105.6, 9); // 80 × 1.32
    expect(b.toughness).toBeCloseTo(30, 9); // 60 × 1.5 / 3
    expect(b.effectRes).toBeCloseTo(0.1, 12); // 0 + 0.1
  });

  it('a stage without an elite group uses only the enemy’s own and the level ratios', () => {
    const [[a]] = resolve(T, '101') as [[StageEnemy]];
    expect(a.hp).toBeCloseTo(450_000, 6); // 1000 × 1.5 × 300
    expect(a.toughness).toBeCloseTo(100, 9); // 300 / 3
  });

  it('reports unknown stages and missing rows', () => {
    expect(stageEnemies(T, '999')).toEqual({ ok: false, reason: 'stage 999 is not in the table' });
    expect(stageEnemies({ ...T, levels: [] }, '100')).toMatchObject({ ok: false });
    expect(stageEnemies({ ...T, eliteGroups: T.eliteGroups.slice(0, 2) }, '100')).toMatchObject({ ok: false });
    expect(stageEnemies({ ...T, enemies: T.enemies.slice(0, 1) }, '100')).toMatchObject({ ok: false });
  });
});

describe('stageEnemyConfig', () => {
  const [[a], [b]] = resolve(T, '100') as [[StageEnemy], [StageEnemy]];

  it('copies RES, Toughness, Effect RES and Debuff RES, and omits baseDef when it matches 200 + 10 × level', () => {
    expect(stageEnemyConfig(a, 'e1')).toEqual({
      id: 'e1',
      name: '測試敵人',
      level: 10,
      res: { ice: 0.2 },
      maxToughness: a.toughness,
      effectRes: a.effectRes,
      debuffRes: {},
      spd: a.spd,
    });
  });

  it('sets baseDef when the stage DEF differs', () => {
    const c = stageEnemyConfig(b, 'e2');
    expect(c.baseDef).toBeCloseTo(330, 9);
    expect(c.debuffRes).toEqual({ burn: 0.5 });
  });

  it('does not share objects with the table', () => {
    const c = stageEnemyConfig(a, 'e1');
    expect(c.res).not.toBe(a.enemy.res);
  });
});

describe('validateEnemyTables', () => {
  it('accepts the fixture', () => {
    expect(validateEnemyTables(T)).toEqual([]);
  });

  it('rejects broken references and values', () => {
    const bad: EnemyTables = {
      ...T,
      enemies: [enemy({ id: '11', res: { ice: 20 }, eliteGroup: 5, hp: { base: 1, ratio: 0, add: 0 } })],
      stages: [{ ...T.stages[0]!, waves: [['11', '99']], eliteGroup: 42 }],
    };
    const paths = validateEnemyTables(bad).map((i) => i.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'enemies[0].res.ice',
        'enemies[0].eliteGroup',
        'enemies[0].hp.ratio',
        'stages[0].eliteGroup',
        'stages[0].waves[0][1]',
      ]),
    );
  });
});

describe('generated endgame tables', () => {
  it('pass validation', () => {
    expect(validateEnemyTables(ENEMY_TABLES)).toEqual([]);
  });

  it('every stage resolves, and every enemy DEF matches the engine’s 200 + 10 × level within 0.01%', () => {
    // Cross-check of the stage scaling against formulas.enemyBaseDef (FORMULAS.md § DEF).
    for (const s of ENEMY_TABLES.stages) {
      for (const e of resolve(ENEMY_TABLES, s.id).flat()) {
        const expected = formulas.enemyBaseDef(e.level);
        expect(Math.abs(e.def - expected) / expected, `${s.id} ${e.enemy.id}`).toBeLessThan(1e-4);
      }
    }
  });

  it('covers all three modes, newest rotation first', () => {
    for (const mode of ['memory', 'story', 'boss'] as const) {
      const list = endgameStages(ENEMY_TABLES, mode);
      expect(list.length, mode).toBeGreaterThan(0);
      const dates = list.map((s) => s.startDate);
      expect(dates).toEqual([...dates].sort().reverse());
    }
  });

  it('MoC 物競天擇 floor 12 node 1, wave 2 matches the source rows by hand', () => {
    // Source A @74a7b96: StageConfig 30126121 (HardLevelGroup 3, Level 95, EliteGroup 164),
    // MonsterConfig 2034010 (ratios 1, EliteGroup 1), template HPBase 2557.5, SpeedBase 200,
    // StanceBase 720, StatusResistanceBase 0.2; HardLevelGroup 3/95: HP 375.4385, SPD 1.32,
    // StatusResistance 0.1; EliteGroup 164: HP 6.5.
    const boss = resolve(ENEMY_TABLES, '30126121')[1]?.[0];
    expect(boss?.enemy.name).toBe('步離戰首•呼雷');
    expect(boss?.level).toBe(95);
    expect(boss?.hp).toBeCloseTo(6_241_195.764375, 4); // 2557.5 × 375.4385 × 6.5
    expect(boss?.spd).toBeCloseTo(264, 9); // 200 × 1.32
    expect(boss?.toughness).toBeCloseTo(240, 9); // 720 / 3
    expect(boss?.effectRes).toBeCloseTo(0.3, 12); // 0.2 + 0.1
    expect(boss?.enemy.weaknesses).toEqual(['physical', 'fire', 'wind']);
  });

  it('regression: a rounded level ratio does not produce a baseDef override', () => {
    // 210 × 5.47619 = 1149.9999, within 0.01% of 200 + 10 × 95 = 1150.
    const boss = resolve(ENEMY_TABLES, '30126121')[1]![0]!;
    expect(boss.def).not.toBe(1150);
    expect(stageEnemyConfig(boss, 'x').baseDef).toBeUndefined();
  });
});
