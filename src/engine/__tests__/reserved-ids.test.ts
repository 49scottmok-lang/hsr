import { describe, expect, it } from 'vitest';
import { resolveUnitRef } from '../effects';
import { createInitialState, runRotation } from '../rotation';
import type { RotationInput } from '../types';
import { RESERVED_UNIT_IDS, validateRotationInput } from '../validate';
import { enemy, fireDps, support } from './fixtures';

// Regression: unit IDs that collide with UnitRef groups or Object.prototype
// (docs/TASKS.md § Engine change requests, "Unit ID validation").
describe('reserved unit IDs', () => {
  const input = (over: Partial<RotationInput> = {}): RotationInput => ({
    team: [fireDps(), support()],
    enemies: [enemy()],
    events: [],
    ...over,
  });

  it('lists exactly the group refs and __proto__', () => {
    expect(RESERVED_UNIT_IDS).toEqual(['allAllies', 'allEnemies', '__proto__']);
  });

  it.each(RESERVED_UNIT_IDS)('rejects character id %s with a per-unit issue', (id) => {
    const issues = validateRotationInput(input({ team: [fireDps(), support({ id })] }));
    expect(issues).toContain(`team[1]: id "${id}" is reserved`);
  });

  it.each(RESERVED_UNIT_IDS)('rejects enemy id %s with a per-unit issue', (id) => {
    const issues = validateRotationInput(input({ enemies: [enemy(), enemy({ id })] }));
    expect(issues).toContain(`enemies[1]: id "${id}" is reserved`);
  });

  it('runRotation throws for a reserved id', () => {
    expect(() => runRotation(input({ enemies: [enemy({ id: '__proto__' })] }))).toThrow(/id "__proto__" is reserved/);
  });

  it('accepts ordinary ids, including Object.prototype member names', () => {
    expect(validateRotationInput(input({ enemies: [enemy({ id: 'constructor' })] }))).toEqual([]);
  });

  it('createInitialState keeps a __proto__ unit as an own record entry in group targeting', () => {
    // Direct callers bypass validation; the null-prototype record must not
    // treat "__proto__" as the prototype setter.
    const s = createInitialState([fireDps()], [enemy(), enemy({ id: '__proto__' })]);
    expect(Object.keys(s.units)).toEqual(['dps', 'e1', '__proto__']);
    expect(resolveUnitRef(s, 'allEnemies')).toEqual(['e1', '__proto__']);
  });

  it('createInitialState does not expose inherited properties as units', () => {
    const s = createInitialState([fireDps()], [enemy()]);
    expect(s.units['toString']).toBeUndefined();
    expect(() => resolveUnitRef(s, 'toString')).toThrow(/Unknown unit/);
  });

  it('setBroken keeps the units record prototype-free', () => {
    const r = runRotation(
      input({ events: [{ kind: 'turn', id: 't', actorId: 'dps', steps: [{ op: 'setBroken', enemyId: 'e1', broken: true }] }] }),
    );
    expect(r.finalState.units['e1']?.broken).toBe(true);
    expect(Object.getPrototypeOf(r.finalState.units)).toBeNull();
  });
});
