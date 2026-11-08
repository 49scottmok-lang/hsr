import { describe, expect, it } from 'vitest';
import { energyGain, simulateBattle, validateAutoBattleInput } from '../autoBattle';
import { runRotation } from '../rotation';
import type { AutoBattleInput, AutoKit, HitSpec } from '../types';
import { EngineValidationError } from '../validate';
import { enemy, fireDps, support } from './fixtures';

// TEST FIXTURE — NOT GAME DATA: every kit number below is synthetic.
const hit = (tags: HitSpec['tags'], multiplier: number) => [{ op: 'hit' as const, hit: { targetId: 'e1', scaling: 'atk' as const, multiplier, tags } }];

const dpsKit = (over: Partial<AutoKit> = {}): AutoKit => ({
  unitId: 'dps',
  startEnergy: 0,
  basic: { steps: hit(['basic'], 1), energy: 20, skillPoints: 1, label: 'Basic' },
  skill: { steps: hit(['skill'], 2), energy: 30, skillPoints: 1, label: 'Skill' },
  ultimate: { steps: hit(['ultimate'], 4), energy: 5, energyCost: 60, label: 'Ult' },
  useSkill: true,
  useUltimate: true,
  ...over,
});
const supKit: AutoKit = {
  unitId: 'sup',
  startEnergy: 0,
  basic: { steps: [], energy: 20, skillPoints: 1 },
  useSkill: false,
  useUltimate: false,
};

// DPS SPD 100 (AV 100), support SPD 200 (AV 50), enemy SPD 50 (AV 200).
const input = (over: Partial<AutoBattleInput> = {}): AutoBattleInput => ({
  team: [fireDps(), support({ base: { hp: 2000, atk: 400, def: 500, spd: 200 } })],
  enemies: [enemy({ spd: 50 })],
  kits: [dpsKit(), supKit],
  avLimit: 200,
  skillPoints: { start: 1, max: 5 },
  ...over,
});

const summary = (r: ReturnType<typeof simulateBattle>) => r.actions.map((a) => [a.unitId, a.action, a.av, a.skillPoints, a.energy]);

describe('simulateBattle', () => {
  it('plays Skill while affordable and casts the Ultimate when Energy is full', () => {
    // Turn order (AV): sup 50, dps 100, sup 100, sup 150, e1 200, dps 200, sup 200 (ties: timeline.test.ts).
    // SP 1 → sup +1 = 2 → dps Skill −1 = 1 (Energy 30) → sup 2 → sup 3 → enemy → dps Skill 2 (Energy 60)
    // → Ultimate: Energy 0 + 5 = 5 → sup 3.
    const r = simulateBattle(input());
    expect(summary(r)).toEqual([
      ['sup', 'basic', 50, 2, 20],
      ['dps', 'skill', 100, 1, 30],
      ['sup', 'basic', 100, 2, 40],
      ['sup', 'basic', 150, 3, 60],
      ['e1', 'enemyTurn', 200, 3, undefined],
      ['dps', 'skill', 200, 2, 60],
      ['dps', 'ultimate', 200, 2, 5],
      ['sup', 'basic', 200, 3, 80],
    ]);
    expect(r.events.map((e) => [e.kind, e.actorId, e.label])).toEqual([
      ['turn', 'sup', undefined], ['turn', 'dps', 'Skill'], ['turn', 'sup', undefined], ['turn', 'sup', undefined],
      ['turn', 'e1', undefined], ['turn', 'dps', 'Skill'], ['extra', 'dps', 'Ult'], ['turn', 'sup', undefined],
    ]);
    expect(r.events[1]?.steps).toEqual(hit(['skill'], 2));
    expect(r.truncated).toBe(false);
    expect(r.cycles).toBeUndefined();
  });

  it('scores like the same rotation written by hand', () => {
    const r = simulateBattle(input());
    const auto = runRotation({ team: input().team, enemies: input().enemies, events: r.events });
    const byHand = runRotation({
      team: input().team,
      enemies: input().enemies,
      events: [
        { kind: 'turn', id: 'h1', actorId: 'dps', steps: hit(['skill'], 2) },
        { kind: 'turn', id: 'h2', actorId: 'dps', steps: hit(['skill'], 2) },
        { kind: 'extra', id: 'h3', actorId: 'dps', steps: hit(['ultimate'], 4) },
      ],
    });
    expect(auto.totalDamage).toBeCloseTo(byHand.totalDamage, 6);
    expect(auto.hits.map((h) => h.tags)).toEqual([['skill'], ['skill'], ['ultimate']]);
  });

  it('keeps the skill point reserve', () => {
    // Reserve 2: dps at 100 has SP 2, 2 − 1 < 2 → Basic (SP 3, Energy 20). SP then 4, 5;
    // dps at 200 has SP 5, 5 − 1 ≥ 2 → Skill (SP 4, Energy 50). sup at 200 → 5 (cap 5).
    const r = simulateBattle(input({ kits: [dpsKit({ skillPointReserve: 2 }), supKit] }));
    expect(summary(r).filter(([u]) => u === 'dps')).toEqual([
      ['dps', 'basic', 100, 3, 20],
      ['dps', 'skill', 200, 4, 50],
    ]);
    expect(r.actions.at(-1)?.skillPoints).toBe(5);
  });

  it('applies Energy Regeneration Rate and caps Energy at the Ultimate cost', () => {
    expect(energyGain(20, 0.2)).toBeCloseTo(24, 12); // 20 × 1.2
    // ERR 20%, start 40: Basic 40 + 24 = 64 → capped 60 → Ultimate → 5 × 1.2 = 6.
    const dps = fireDps({ relics: { stats: [{ stat: 'energyRegenRate', value: 0.2 }], setEffects: [] } });
    const r = simulateBattle(input({
      team: [dps, support({ base: { hp: 2000, atk: 400, def: 500, spd: 200 } })],
      kits: [dpsKit({ startEnergy: 40, useSkill: false }), supKit],
      avLimit: 100,
    }));
    const dpsActions = r.actions.filter((a) => a.unitId === 'dps');
    expect(dpsActions.map((a) => [a.action, a.energy])).toEqual([['basic', 60], ['ultimate', expect.closeTo(6, 12)]]);
  });

  it('casts a ready Ultimate at battle start, at most once per window', () => {
    // Refund 100 ≥ cost 60 would loop forever; the window allows one cast.
    const kit = dpsKit({ startEnergy: 60, ultimate: { steps: [], energy: 100, energyCost: 60 } });
    const r = simulateBattle(input({ kits: [kit, supKit], avLimit: 40 }));
    expect(summary(r)).toEqual([['dps', 'ultimate', 0, 1, 60]]);
  });

  it('gives members without a kit empty turns and reports cycles', () => {
    const r = simulateBattle(input({ kits: [dpsKit()], avLimit: 200, cycleAv: { first: 150, later: 100 } }));
    const idle = r.actions.find((a) => a.unitId === 'sup');
    expect(idle?.action).toBe('idle');
    expect(idle).not.toHaveProperty('energy');
    expect(r.events.find((e) => e.actorId === 'sup')?.steps).toEqual([]);
    expect(r.actions[0]?.cycle).toBe(1);
    expect(r.actions.at(-1)?.cycle).toBe(2); // AV 200 is in cycle 2 (150, 250]
    expect(r.cycles).toBe(2);
  });

  it('does not mutate its input', () => {
    const i = input();
    const copy = structuredClone(i);
    simulateBattle(i);
    expect(i).toEqual(copy);
  });
});

describe('validateAutoBattleInput', () => {
  it('accepts the fixture', () => {
    expect(validateAutoBattleInput(input())).toEqual([]);
  });

  it('reports bad kits, skill points and enemy SPD with paths', () => {
    const issues = validateAutoBattleInput(input({
      enemies: [enemy()],
      skillPoints: { start: 6, max: 5 },
      kits: [
        dpsKit({ startEnergy: -1, basic: { steps: [{ op: 'hit', hit: { targetId: 'nobody', scaling: 'atk', multiplier: 1, tags: ['basic'] } }], energy: Number.NaN, skillPoints: 1.5 } }),
        { ...supKit, unitId: 'ghost' },
        dpsKit({ ultimate: { steps: [], energy: 5, energyCost: 0 } }),
      ],
    }));
    expect(issues).toEqual(expect.arrayContaining([
      'skillPoints.start: must be an integer from 0 to skillPoints.max',
      'enemies[0].spd: is required for the auto battle',
      'kits[0].startEnergy: must be a finite number >= 0',
      'kits[0].basic.skillPoints: must be an integer >= 0',
      'kits[0].basic.energy: must be a finite number >= 0',
      'kits[1]: unit "ghost" is not a team member',
      'kits[2]: duplicate kit for "dps"',
      'kits[2].ultimate.energyCost: must be a finite number > 0',
    ]));
    expect(issues.some((i) => i.startsWith('kits[0].basic.steps[0]'))).toBe(true);
  });

  it('requires at least one kit (regression: no kit wrote a rotation of empty turns)', () => {
    expect(validateAutoBattleInput(input({ kits: [] }))).toEqual(['kits: at least one kit is required']);
  });

  it('simulateBattle throws EngineValidationError on invalid input', () => {
    expect(() => simulateBattle(input({ avLimit: 0 }))).toThrow(EngineValidationError);
  });
});
