import { describe, expect, it } from 'vitest';
import { runRotation } from '../rotation';
import type { RotationInput } from '../types';
import { validateRotationInput } from '../validate';
import { enemy, fireDps } from './fixtures';

// EnemyConfig.spd (D6): metadata for the turn order helper's caller only.
describe('EnemyConfig.spd', () => {
  const input = (spd: number | undefined): RotationInput => ({
    team: [fireDps()],
    enemies: [enemy(spd === undefined ? {} : { spd })],
    events: [{ id: 't1', kind: 'turn', actorId: 'dps', steps: [{ op: 'hit', hit: { targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['skill'] } }] }],
  });

  it('accepts a positive SPD or none', () => {
    expect(validateRotationInput(input(undefined))).toEqual([]);
    expect(validateRotationInput(input(132))).toEqual([]);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('rejects SPD %s', (spd) => {
    expect(validateRotationInput(input(spd))).toContain('enemies[0].spd: must be a positive number');
  });

  it('does not change damage', () => {
    expect(runRotation(input(250)).totalDamage).toBe(runRotation(input(undefined)).totalDamage);
  });
});
