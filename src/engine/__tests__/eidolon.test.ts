import { describe, expect, it } from 'vitest';
import { meetsRequirement } from '../effects';
import { createInitialState, runRotation } from '../rotation';
import type { EffectDef, HitSpec, RotationInput } from '../types';
import { EngineValidationError } from '../validate';
import { EXPECTED_SKILL_HIT, enemy, fireDps, skillDmgBuff, support } from './fixtures';

const skill: HitSpec = { targetId: 'e1', scaling: 'atk', multiplier: 2.0, tags: ['skill'] };
const NO_BUFF_SKILL = 3900 * 2.05 * 1.4 * (1000 / 2100) * 0.8 * 0.9;

/** Fixture "E2" passive: identical to skillDmgBuff but gated on Eidolon 2. */
const e2Passive: EffectDef = { ...skillDmgBuff, id: 'e2', requires: { minEidolon: 2 } };

const oneSkill = (over: Partial<RotationInput>): RotationInput => ({
  team: [fireDps(), support()],
  enemies: [enemy()],
  events: [{ kind: 'turn', id: 't', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] }],
  ...over,
});

describe('eidolon gating', () => {
  it('meetsRequirement compares against the source eidolon; enemies count as E0', () => {
    const s = createInitialState([fireDps({ eidolon: 2 })], [enemy()]);
    expect(meetsRequirement(s, 'dps', { minEidolon: 2 })).toBe(true);
    expect(meetsRequirement(s, 'dps', { minEidolon: 3 })).toBe(false);
    expect(meetsRequirement(s, 'e1', { minEidolon: 1 })).toBe(false);
    expect(meetsRequirement(s, 'e1', undefined)).toBe(true);
  });

  it('always-on effects with requires.minEidolon apply only at that eidolon or higher', () => {
    const at = (eidolon: number) =>
      runRotation(oneSkill({ team: [fireDps({ eidolon, passiveEffects: [e2Passive] }), support()] })).totalDamage;
    expect(at(0)).toBeCloseTo(NO_BUFF_SKILL, 6);
    expect(at(1)).toBeCloseTo(NO_BUFF_SKILL, 6);
    expect(at(2)).toBeCloseTo(EXPECTED_SKILL_HIT, 6);
    expect(at(6)).toBeCloseTo(EXPECTED_SKILL_HIT, 6);
  });

  it('default eidolon is 0', () => {
    const r = runRotation(oneSkill({ team: [fireDps({ passiveEffects: [{ ...e2Passive, requires: { minEidolon: 1 } }] })] }));
    expect(r.totalDamage).toBeCloseTo(NO_BUFF_SKILL, 6);
  });

  it('step.requires skips a hit (checked against the attacker) and logs it', () => {
    const input = (eidolon: number): RotationInput =>
      oneSkill({
        team: [fireDps({ eidolon }), support()],
        events: [
          {
            kind: 'turn',
            id: 't',
            actorId: 'dps',
            steps: [
              { op: 'hit', hit: skill },
              { op: 'hit', hit: { ...skill, label: 'E6 extra hit' }, requires: { minEidolon: 6 } },
            ],
          },
        ],
      });
    const e0 = runRotation(input(0));
    expect(e0.hits).toHaveLength(1);
    expect(e0.log[0]!.skippedSteps).toEqual([1]);
    const e6 = runRotation(input(6));
    expect(e6.hits).toHaveLength(2);
    expect(e6.log[0]!.skippedSteps).toEqual([]);
  });

  it('an apply step is gated by the effect requirement against the source (sourceId), not the target', () => {
    const input = (supEidolon: number): RotationInput =>
      oneSkill({
        team: [fireDps({ eidolon: 6 }), support({ eidolon: supEidolon })],
        events: [
          { kind: 'turn', id: 'b', actorId: 'sup', steps: [{ op: 'apply', effect: e2Passive, to: 'dps' }] },
          { kind: 'turn', id: 't', actorId: 'dps', steps: [{ op: 'hit', hit: skill }] },
        ],
      });
    const low = runRotation(input(1));
    expect(low.totalDamage).toBeCloseTo(NO_BUFF_SKILL, 6);
    expect(low.log[0]!.skippedSteps).toEqual([0]);
    expect(runRotation(input(2)).totalDamage).toBeCloseTo(EXPECTED_SKILL_HIT, 6);
  });

  it('validates eidolon 0–6, superimposition 1–5 and minEidolon 0–6', () => {
    const issues = (inp: RotationInput): readonly string[] => {
      try {
        runRotation(inp);
        return [];
      } catch (e) {
        if (e instanceof EngineValidationError) return e.issues;
        throw e;
      }
    };
    const bad = issues(
      oneSkill({
        team: [
          fireDps({
            eidolon: 7,
            lightCone: { name: 'Fixture LC', superimposition: 6, base: { hp: 0, atk: 0, def: 0 }, effects: [] },
            passiveEffects: [{ ...e2Passive, requires: { minEidolon: 1.5 } }],
          }),
        ],
        events: [
          { kind: 'turn', id: 't', actorId: 'dps', steps: [{ op: 'hit', hit: skill, requires: { minEidolon: -1 } }] },
        ],
      }),
    );
    expect(bad.some((i) => i.includes('eidolon must be an integer 0–6'))).toBe(true);
    expect(bad.some((i) => i.includes('superimposition must be an integer 1–5'))).toBe(true);
    expect(bad.filter((i) => i.includes('requires.minEidolon')).length).toBe(2);
    expect(issues(oneSkill({ team: [fireDps({ eidolon: 6 })] }))).toEqual([]);
  });
});
