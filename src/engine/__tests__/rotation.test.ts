import { describe, expect, it } from 'vitest';
import { compareTeams } from '../compare';
import { runRotation } from '../rotation';
import type { EffectDef, HitSpec, RotationInput } from '../types';
import { EngineValidationError } from '../validate';
import { EXPECTED_SKILL_HIT, enemy, fireDps, skillDmgBuff, support } from './fixtures';

const skill: HitSpec = { targetId: 'e1', scaling: 'atk', multiplier: 2.0, tags: ['skill'] };
const NO_BUFF_SKILL = (3900 * 2.05 * 1.4 * (1000 / 2100) * 0.8 * 0.9);

function input(over: Partial<RotationInput> = {}): RotationInput {
  return { team: [fireDps(), support()], enemies: [enemy()], events: [], ...over };
}

describe('runRotation', () => {
  it('a buff applied earlier affects later hits', () => {
    const r = runRotation(
      input({
        events: [
          { kind: 'turn', id: 't1', actorId: 'sup', steps: [{ op: 'apply', effect: skillDmgBuff, to: 'dps' }] },
          { kind: 'turn', id: 't2', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
        ],
      }),
    );
    expect(r.hits).toHaveLength(1);
    expect(r.totalDamage).toBeCloseTo(EXPECTED_SKILL_HIT, 6);
    expect(r.log.map((l) => l.damage)).toEqual([0, r.totalDamage]);
  });

  it('a 1-turn self buff applied in own turn lasts through the next own turn, then expires', () => {
    const selfBuff: EffectDef = {
      ...skillDmgBuff,
      duration: { turns: 1, tickUnit: 'holder', tickPhase: 'turnEnd' },
    };
    const r = runRotation(
      input({
        events: [
          { kind: 'turn', id: 't1', actorId: 'dps', steps: [{ op: 'apply', effect: selfBuff, to: 'dps' }] },
          { kind: 'turn', id: 't2', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
          { kind: 'turn', id: 't3', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
        ],
      }),
    );
    expect(r.hits[0]!.damage).toBeCloseTo(EXPECTED_SKILL_HIT, 6);
    expect(r.hits[1]!.damage).toBeCloseTo(NO_BUFF_SKILL, 6);
    expect(r.log[1]!.expired).toEqual(['dps:skill-dmg']);
  });

  it('extra events (e.g. ultimates) do not tick durations', () => {
    const buff: EffectDef = { ...skillDmgBuff, duration: { turns: 1, tickUnit: 'holder', tickPhase: 'turnStart' } };
    const r = runRotation(
      input({
        events: [
          { kind: 'extra', id: 'u1', actorId: 'sup', steps: [{ op: 'apply', effect: buff, to: 'dps' }] },
          { kind: 'extra', id: 'u2', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
          { kind: 'turn', id: 't1', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
        ],
      }),
    );
    expect(r.hits[0]!.damage).toBeCloseTo(EXPECTED_SKILL_HIT, 6);
    expect(r.hits[1]!.damage).toBeCloseTo(NO_BUFF_SKILL, 6); // expired at dps turnStart
  });

  it('enemy debuff ticking on the enemy turn start', () => {
    const vuln: EffectDef = {
      id: 'vuln',
      name: 'Fixture vuln',
      kind: 'debuff',
      modifiers: [{ stat: 'vulnerability', value: 0.5 }],
      duration: { turns: 1, tickUnit: 'holder', tickPhase: 'turnStart' },
    };
    const r = runRotation(
      input({
        events: [
          { kind: 'turn', id: 't1', actorId: 'sup', steps: [{ op: 'apply', effect: vuln, to: 'allEnemies' }] },
          { kind: 'turn', id: 't2', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
          { kind: 'turn', id: 'enemy', actorId: 'e1', steps: [] },
          { kind: 'turn', id: 't3', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
        ],
      }),
    );
    expect(r.hits[0]!.damage / r.hits[1]!.damage).toBeCloseTo(1.5, 12);
    expect(r.log[2]!.expired).toEqual(['e1:vuln']);
  });

  it('setBroken switches the toughness multiplier', () => {
    const r = runRotation(
      input({
        events: [
          { kind: 'turn', id: 't1', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
          { kind: 'extra', id: 'b', actorId: 'dps', steps: [{ op: 'setBroken', enemyId: 'e1', broken: true }] },
          { kind: 'turn', id: 't2', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
        ],
      }),
    );
    expect(r.hits[1]!.damage / r.hits[0]!.damage).toBeCloseTo(1 / 0.9, 12);
  });

  it('applies always-on light cone / relic set / passive effects', () => {
    const r = runRotation(
      input({
        team: [fireDps({ passiveEffects: [skillDmgBuff] }), support()],
        events: [{ kind: 'turn', id: 't1', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] }],
      }),
    );
    expect(r.totalDamage).toBeCloseTo(EXPECTED_SKILL_HIT, 6);
  });

  it('aggregates totals by attacker, tag and cycle', () => {
    const r = runRotation(
      input({
        cycles: 2,
        events: [
          {
            kind: 'turn',
            id: 't1',
            actorId: 'dps',
            steps: [
              { op: 'hit', hit: skill },
              { op: 'hit', hit: { ...skill, tags: ['followUp', 'skill'] } },
              { op: 'hit', hit: { ...skill, attackerId: 'sup', tags: ['basic'] } },
            ],
          },
        ],
      }),
    );
    const [h0, h1, h2] = r.hits.map((h) => h.damage) as [number, number, number];
    expect(r.hits.map((h) => h.hitIndex)).toEqual([0, 1, 2]);
    expect(r.damageByAttacker.dps).toBeCloseTo(h0 + h1, 9);
    expect(r.damageByAttacker.sup).toBeCloseTo(h2, 9);
    expect(r.damageByTag.skill).toBeCloseTo(h0 + h1, 9);
    expect(r.damageByTag.followUp).toBeCloseTo(h1, 9);
    expect(r.damagePerCycle).toBeCloseTo(r.totalDamage / 2, 9);
  });

  it('does not mutate its input', () => {
    const inp = input({
      events: [
        { kind: 'turn', id: 't1', actorId: 'sup', steps: [{ op: 'apply', effect: skillDmgBuff, to: 'dps' }] },
        { kind: 'turn', id: 't2', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
      ],
    });
    const snapshot = JSON.stringify(inp);
    runRotation(inp);
    expect(JSON.stringify(inp)).toBe(snapshot);
  });

  describe('validation', () => {
    const issuesOf = (inp: RotationInput): readonly string[] => {
      try {
        runRotation(inp);
      } catch (e) {
        if (e instanceof EngineValidationError) return e.issues;
        throw e;
      }
      return [];
    };

    it('rejects unknown/ally targets, duplicate IDs, bad durations and empty tags', () => {
      const issues = issuesOf(
        input({
          enemies: [enemy(), enemy()],
          events: [
            {
              kind: 'turn',
              id: 'x',
              actorId: 'dps',
              steps: [
                { op: 'hit', hit: { ...skill, targetId: 'sup' } },
                { op: 'hit', hit: { ...skill, tags: [] } },
                {
                  op: 'apply',
                  to: 'dps',
                  effect: { ...skillDmgBuff, duration: { turns: 0, tickUnit: 'holder', tickPhase: 'turnEnd' } },
                },
              ],
            },
            { kind: 'turn', id: 'x', actorId: 'ghost', steps: [] },
          ],
        }),
      );
      expect(issues.some((i) => i.includes('IDs must be unique'))).toBe(true);
      expect(issues.some((i) => i.includes('"sup" must be an enemy'))).toBe(true);
      expect(issues.some((i) => i.includes('at least one damage tag'))).toBe(true);
      expect(issues.some((i) => i.includes('duration.turns'))).toBe(true);
      expect(issues.some((i) => i.includes('duplicate event id'))).toBe(true);
      expect(issues.some((i) => i.includes('"ghost" is not a unit'))).toBe(true);
    });

    it('rejects empty and oversized teams', () => {
      expect(issuesOf(input({ team: [] })).length).toBeGreaterThan(0);
      const five = ['a', 'b', 'c', 'd', 'e'].map((id) => support({ id }));
      expect(issuesOf(input({ team: five }))).toContain('team: must contain 1 to 4 characters');
    });

    it('rejects non-finite numbers', () => {
      const issues = issuesOf(
        input({ events: [{ kind: 'turn', id: 't', actorId: 'dps', steps: [{ op: 'hit', hit: { ...skill, multiplier: NaN } }] }] }),
      );
      expect(issues.some((i) => i.includes('multiplier'))).toBe(true);
    });
  });
});

describe('compareTeams', () => {
  it('reports difference and ratio of B vs A, including per-cycle', () => {
    const hitOnce = (cycles: number) =>
      runRotation(input({ cycles, events: [{ kind: 'turn', id: 't', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] }] }));
    const a = hitOnce(1);
    const b = runRotation(
      input({
        cycles: 1,
        team: [fireDps({ passiveEffects: [skillDmgBuff] }), support()],
        events: [{ kind: 'turn', id: 't', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] }],
      }),
    );
    const c = compareTeams(a, b, { a: 'Base', b: 'Buffed' });
    expect(c.a.label).toBe('Base');
    expect(c.totalRatio).toBeCloseTo(1.6 / 1.4, 12);
    expect(c.totalDifference).toBeCloseTo(EXPECTED_SKILL_HIT - NO_BUFF_SKILL, 6);
    expect(c.perCycleRatio).toBeCloseTo(1.6 / 1.4, 12);
  });

  it('omits ratios when A deals 0 and per-cycle metrics when cycles are missing', () => {
    const empty = runRotation(input());
    const c = compareTeams(empty, empty);
    expect(c.totalRatio).toBeUndefined();
    expect(c.perCycleDifference).toBeUndefined();
  });
});
