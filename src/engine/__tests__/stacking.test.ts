/**
 * E5: per-effect stacking policies. TEST FIXTURE — NOT GAME DATA.
 * fireDps(): base ATK 600 + 500 (LC), +50% ATK and +300 flat from relics, so
 * ATK = 1100 × (1.5 + buff) + 300.
 */
import { describe, expect, it } from 'vitest';
import { applyEffect, createInitialState, resolveUnitStats, runRotation, tickEffects, validateRotationInput } from '..';
import type { CombatState, EffectDef, RotationInput } from '..';
import { enemy, fireDps, support } from './fixtures';

const base = (): CombatState => createInitialState([fireDps(), support()], [enemy()]);

/** +10% ATK per stack, 2 turns, ticks at the end of the holder's turn. */
const buff = (over: Partial<EffectDef> = {}): EffectDef => ({
  id: 'b',
  name: 'Fixture ATK buff',
  kind: 'buff',
  modifiers: [{ stat: 'atkPct', value: 0.1 }],
  duration: { turns: 2, tickUnit: 'holder', tickPhase: 'turnEnd' },
  ...over,
});

const atk = (s: CombatState) => resolveUnitStats(s, 'dps').atk;
const view = (s: CombatState) => s.effects.map((e) => [e.sourceId, e.stacks, e.remainingTurns]);

describe('stacking: refresh (default, the former assumption A1)', () => {
  it('replaces the source, adds stacks up to maxStacks and restarts the duration', () => {
    let s = applyEffect(base(), buff({ maxStacks: 3 }), 'dps', 'sup');
    s = tickEffects(s, 'dps', 'turnEnd').state;
    s = applyEffect(s, buff({ maxStacks: 3 }), 'dps', 'dps', 2);
    expect(view(s)).toEqual([['dps', 3, 2]]);
    expect(atk(s)).toBeCloseTo(1100 * 1.8 + 300, 9); // 2280
  });
});

describe('stacking: noRefresh', () => {
  it('keeps the live instance; with one stack, re-applying changes nothing', () => {
    const def = buff({ stacking: 'noRefresh' });
    let s = applyEffect(base(), def, 'dps', 'sup');
    s = tickEffects(s, 'dps', 'turnEnd').state;
    const before = s;
    s = applyEffect(s, { ...def, modifiers: [{ stat: 'atkPct', value: 0.5 }] }, 'dps', 'dps');
    expect(s).toBe(before);
    expect(view(s)).toEqual([['sup', 1, 1]]);
    expect(atk(s)).toBeCloseTo(1100 * 1.6 + 300, 9); // 2060: the original 10%, not 50%
  });

  it('adds stacks without restarting the duration, and expires on the original schedule', () => {
    const def = buff({ stacking: 'noRefresh', maxStacks: 3 });
    let s = applyEffect(base(), def, 'dps', 'sup');
    s = tickEffects(s, 'dps', 'turnEnd').state;
    s = applyEffect(s, def, 'dps', 'sup', 5);
    expect(view(s)).toEqual([['sup', 3, 1]]);
    const t = tickEffects(s, 'dps', 'turnEnd');
    expect(t.expired).toEqual(['dps:b']);
    expect(t.state.effects).toEqual([]);
  });

  it('applies normally when there is no live instance', () => {
    const s = applyEffect(base(), buff({ stacking: 'noRefresh' }), 'dps', 'sup');
    expect(view(s)).toEqual([['sup', 1, 2]]);
  });
});

describe('stacking: independent', () => {
  it('keeps one instance per application, each with its own duration', () => {
    const def = buff({ stacking: 'independent', maxStacks: 3 });
    let s = applyEffect(base(), def, 'dps', 'sup');
    s = tickEffects(s, 'dps', 'turnEnd').state;
    s = applyEffect(s, def, 'dps', 'sup');
    expect(view(s)).toEqual([
      ['sup', 1, 1],
      ['sup', 1, 2],
    ]);
    expect(atk(s)).toBeCloseTo(1100 * 1.7 + 300, 9); // 2170: both stacks count
    const t = tickEffects(s, 'dps', 'turnEnd');
    expect(t.expired).toEqual(['dps:b']);
    expect(view(t.state)).toEqual([['sup', 1, 1]]);
  });

  it('caps the total at maxStacks by trimming the oldest instances first', () => {
    const def = buff({ stacking: 'independent', maxStacks: 3 });
    let s = applyEffect(base(), def, 'dps', 'a1', 2);
    s = applyEffect(s, def, 'dps', 'a2');
    // Total 3. Two more stacks: the oldest instance (2 stacks) is dropped.
    s = applyEffect(s, def, 'dps', 'a3', 2);
    expect(view(s)).toEqual([
      ['a2', 1, 2],
      ['a3', 2, 2],
    ]);
    // One more: a2 is dropped.
    s = applyEffect(s, def, 'dps', 'a4');
    expect(view(s)).toEqual([
      ['a3', 2, 2],
      ['a4', 1, 2],
    ]);
    // Applying more than maxStacks at once keeps only the new instance, capped.
    s = applyEffect(s, def, 'dps', 'a5', 9);
    expect(view(s)).toEqual([['a5', 3, 2]]);
  });

  it('only counts instances of the same effect on the same holder', () => {
    const def = buff({ stacking: 'independent', maxStacks: 1 });
    let s = applyEffect(base(), def, 'dps', 'sup');
    s = applyEffect(s, def, 'sup', 'sup');
    s = applyEffect(s, buff({ id: 'other' }), 'dps', 'sup');
    expect(s.effects.map((e) => `${e.holderId}:${e.def.id}`)).toEqual(['dps:b', 'sup:b', 'dps:other']);
  });
});

describe('stacking in a rotation', () => {
  it('a remove step removes every independent instance', () => {
    const def = buff({ stacking: 'independent', maxStacks: 5, duration: undefined });
    const input: RotationInput = {
      team: [fireDps(), support()],
      enemies: [enemy()],
      critMode: 'nonCrit',
      events: [
        {
          kind: 'extra',
          id: 'x',
          actorId: 'sup',
          steps: [
            { op: 'apply', effect: def, to: 'dps' },
            { op: 'apply', effect: def, to: 'dps' },
            { op: 'remove', effectId: 'b', from: 'dps' },
          ],
        },
      ],
    };
    expect(runRotation(input).finalState.effects).toEqual([]);
  });

  it('rejects an unknown policy', () => {
    const input: RotationInput = {
      team: [fireDps({ passiveEffects: [buff({ stacking: 'sometimes' as 'refresh' })] })],
      enemies: [enemy()],
      events: [],
    };
    expect(validateRotationInput(input)).toEqual(['team[0].passiveEffects[0]: unknown stacking policy "sometimes"']);
  });
});
