import { describe, expect, it } from 'vitest';
import { applyEffect, removeEffect, resolveUnitRef, tickEffects } from '../effects';
import { createInitialState } from '../rotation';
import type { CombatState, EffectDef } from '../types';
import { enemy, fireDps, support } from './fixtures';

const base = (): CombatState => createInitialState([fireDps(), support()], [enemy(), enemy({ id: 'e2' })]);

const timed = (over: Partial<EffectDef> = {}): EffectDef => ({
  id: 'timed',
  name: 'Fixture timed',
  kind: 'buff',
  modifiers: [{ stat: 'atkPct', value: 0.1 }],
  duration: { turns: 2, tickUnit: 'holder', tickPhase: 'turnEnd' },
  ...over,
});

describe('effects', () => {
  it('resolves unit refs', () => {
    const s = base();
    expect(resolveUnitRef(s, 'allAllies')).toEqual(['dps', 'sup']);
    expect(resolveUnitRef(s, 'allEnemies')).toEqual(['e1', 'e2']);
    expect(() => resolveUnitRef(s, 'nope')).toThrow();
  });

  it('re-applying refreshes duration and adds stacks up to maxStacks', () => {
    const def = timed({ maxStacks: 2 });
    let s = applyEffect(base(), def, 'dps', 'sup');
    s = tickEffects(s, 'dps', 'turnEnd').state;
    expect(s.effects[0]!.remainingTurns).toBe(1);
    s = applyEffect(s, def, 'dps', 'sup');
    s = applyEffect(s, def, 'dps', 'sup');
    expect(s.effects).toHaveLength(1);
    expect(s.effects[0]!.stacks).toBe(2);
    expect(s.effects[0]!.remainingTurns).toBe(2);
  });

  it('expires after N ticks of the tick unit in the tick phase only', () => {
    let s = applyEffect(base(), timed(), 'dps', 'sup');
    s = tickEffects(s, 'dps', 'turnStart').state; // wrong phase
    s = tickEffects(s, 'sup', 'turnEnd').state; // wrong unit
    expect(s.effects[0]!.remainingTurns).toBe(2);
    s = tickEffects(s, 'dps', 'turnEnd').state;
    const r = tickEffects(s, 'dps', 'turnEnd');
    expect(r.state.effects).toHaveLength(0);
    expect(r.expired).toEqual(['dps:timed']);
  });

  it('skips the first turnEnd tick when applied during the tick unit\'s own turn', () => {
    let s: CombatState = { ...base(), activeTurnUnitId: 'dps' };
    s = applyEffect(s, timed({ duration: { turns: 1, tickUnit: 'holder', tickPhase: 'turnEnd' } }), 'dps', 'dps');
    expect(s.effects[0]!.skipNextTick).toBe(true);
    s = tickEffects(s, 'dps', 'turnEnd').state;
    expect(s.effects).toHaveLength(1);
    s = tickEffects(s, 'dps', 'turnEnd').state;
    expect(s.effects).toHaveLength(0);
  });

  it('tickOnApplyTurn: true ticks in the same turn', () => {
    let s: CombatState = { ...base(), activeTurnUnitId: 'dps' };
    s = applyEffect(
      s,
      timed({ duration: { turns: 1, tickUnit: 'holder', tickPhase: 'turnEnd', tickOnApplyTurn: true } }),
      'dps',
      'dps',
    );
    s = tickEffects(s, 'dps', 'turnEnd').state;
    expect(s.effects).toHaveLength(0);
  });

  it('tickUnit "source" ticks on the source unit\'s turns', () => {
    let s = applyEffect(base(), timed({ duration: { turns: 1, tickUnit: 'source', tickPhase: 'turnStart' } }), 'dps', 'sup');
    expect(s.effects[0]!.tickUnitId).toBe('sup');
    s = tickEffects(s, 'dps', 'turnStart').state;
    expect(s.effects).toHaveLength(1);
    s = tickEffects(s, 'sup', 'turnStart').state;
    expect(s.effects).toHaveLength(0);
  });

  it('permanent effects never tick; removeEffect removes by holder + id', () => {
    const perm: EffectDef = { id: 'perm', name: 'Fixture perm', kind: 'buff', modifiers: [] };
    let s = applyEffect(base(), perm, 'dps', 'dps');
    s = applyEffect(s, perm, 'sup', 'sup');
    s = tickEffects(s, 'dps', 'turnEnd').state;
    expect(s.effects).toHaveLength(2);
    s = removeEffect(s, 'perm', 'dps');
    expect(s.effects.map((e) => e.holderId)).toEqual(['sup']);
  });

  it('does not mutate the input state', () => {
    const s = base();
    const snapshot = JSON.stringify(s);
    applyEffect(s, timed(), 'dps', 'sup');
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
