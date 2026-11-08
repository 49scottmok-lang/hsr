import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_CYCLE_AV,
  EngineValidationError,
  MAX_TIMELINE_TURNS,
  runRotation,
  suggestTurnOrder,
  timelineToEvents,
  type TimelineInput,
  type TimelineResult,
} from '../index';
import { enemy, fireDps } from './fixtures';

// TEST FIXTURE — NOT GAME DATA. SPD values and cycle lengths are synthetic.
// Every expected AV is hand-computed from FORMULAS.md § Action Value:
// first turn at 10000 / SPD, then +10000 / SPD after each turn.

const order = (r: TimelineResult) => r.turns.map((t) => `${t.unitId}${t.turn}@${t.av}`);

describe('suggestTurnOrder', () => {
  it('orders turns by action value', () => {
    // A: 10000/134 = 74.6268…, ×2 = 149.2537…, ×3 = 223.88… (> 200, excluded)
    // E: 10000/100 = 100, 200 (included: the limit is inclusive)
    const r = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 134 }, { id: 'e', side: 'enemy', spd: 100 }],
      avLimit: 200,
    });
    expect(r.turns.map((t) => [t.unitId, t.turn])).toEqual([['a', 1], ['e', 1], ['a', 2], ['e', 2]]);
    expect(r.turns[0]!.av).toBeCloseTo(74.6268656716, 9);
    expect(r.turns[2]!.av).toBeCloseTo(149.2537313433, 9);
    expect(r.turns[3]!.av).toBe(200);
    expect(r.truncated).toBe(false);
    expect(r.unusedAdjustments).toEqual([]);
  });

  it('breaks battle-start ties allies first, then by slot, and keeps that queue order', () => {
    // All at SPD 100: every unit reaches 0 at 100 and 200. Each actor goes to the
    // back of the queue, so the order at 200 is the same as at 100.
    const r = suggestTurnOrder({
      units: [
        { id: 'e', side: 'enemy', spd: 100 },
        { id: 'a2', side: 'ally', spd: 100 },
        { id: 'a1', side: 'ally', spd: 100 },
      ],
      avLimit: 200,
    });
    expect(order(r)).toEqual(['a21@100', 'a11@100', 'e1@100', 'a22@200', 'a12@200', 'e2@200']);
  });

  it('ties after float sums (3 × 10000/3 = 10000)', () => {
    // a: 3333.33… × 3 vs b: 10000 at 10000 AV. Without the tolerance a3 would
    // not tie with b1. They tie, and a acted last (at 6666.6…), so b goes first.
    const r = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 3 }, { id: 'b', side: 'ally', spd: 1 }],
      avLimit: 10000,
    });
    expect(r.turns.map((t) => `${t.unitId}${t.turn}`)).toEqual(['a1', 'a2', 'b1', 'a3']);
    expect(r.turns[3]!.av).toBeCloseTo(10000, 9);
  });

  it('applies Action Advance after the trigger turn', () => {
    // b (SPD 200) acts at 50; then a's gauge = 10000 − 50 × 100 = 5000,
    // advanced 25% → 5000 − 2500 = 2500 → a acts at 50 + 2500/100 = 75, then 175.
    // b: 50, 100, 150, 200.
    const r = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 100 }, { id: 'b', side: 'ally', spd: 200 }],
      avLimit: 200,
      adjustments: [{ at: { unitId: 'b', turn: 1 }, targetId: 'a', advance: 0.25 }],
    });
    expect(order(r)).toEqual(['b1@50', 'a1@75', 'b2@100', 'b3@150', 'a2@175', 'b4@200']);
  });

  it('applies Action Delay (negative advance) at battle start', () => {
    // e's gauge 10000 + 2500 = 12500 → 125, then 225 (excluded). a: 100, 200.
    const r = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 100 }, { id: 'e', side: 'enemy', spd: 100 }],
      avLimit: 200,
      adjustments: [{ at: 'start', targetId: 'e', advance: -0.25 }],
    });
    expect(order(r)).toEqual(['a1@100', 'e1@125', 'a2@200']);
  });

  it('keeps the gauge across a SPD change', () => {
    // At 50 (b's turn 1), a's gauge = 10000 − 50 × 100 = 5000; at SPD 125 that is
    // 5000/125 = 40 AV → a at 90, then 90 + 10000/125 = 170. b: 50, 100, 150, 200.
    const r = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 100 }, { id: 'b', side: 'ally', spd: 200 }],
      avLimit: 200,
      adjustments: [{ at: { unitId: 'b', turn: 1 }, targetId: 'a', spd: 125 }],
    });
    expect(order(r)).toEqual(['b1@50', 'a1@90', 'b2@100', 'b3@150', 'a2@170', 'b4@200']);
  });

  describe('mid-battle ties (E1, 2026-11-08: R3 srsim turn queue)', () => {
    it('puts the unit that just acted behind the units it ties with', () => {
      // a (SPD 200): 50, 100. b (SPD 100): 100. At 100, a acted last (at 50) → b first.
      // The old rule (allies, then slot) gave a2 before b1.
      const r = suggestTurnOrder({
        units: [{ id: 'a', side: 'ally', spd: 200 }, { id: 'b', side: 'ally', spd: 100 }],
        avLimit: 100,
      });
      expect(order(r)).toEqual(['a1@50', 'b1@100', 'a2@100']);
    });

    it('lets an enemy go before an ally that just acted', () => {
      // a (ally, SPD 200): 50, 100. e (enemy, SPD 100): 100.
      const r = suggestTurnOrder({
        units: [{ id: 'a', side: 'ally', spd: 200 }, { id: 'e', side: 'enemy', spd: 100 }],
        avLimit: 100,
      });
      expect(order(r)).toEqual(['a1@50', 'e1@100', 'a2@100']);
    });

    it('puts a unit whose gauge was changed in front of the units it ties with', () => {
      // c (SPD 50) advanced 50% at start: 10000 − 5000 = 5000 → 5000 / 50 = 100,
      // tying a and b (SPD 100) at 100. c's gauge changed, so c goes first.
      const r = suggestTurnOrder({
        units: [
          { id: 'a', side: 'ally', spd: 100 },
          { id: 'b', side: 'ally', spd: 100 },
          { id: 'c', side: 'ally', spd: 50 },
        ],
        avLimit: 100,
        adjustments: [{ at: 'start', targetId: 'c', advance: 0.5 }],
      });
      expect(order(r)).toEqual(['c1@100', 'a1@100', 'b1@100']);
    });

    it('does not move a unit whose SPD changed but whose gauge did not', () => {
      // b: SPD 50 → 100 at start keeps its gauge of 10000, so it reaches 0 at 100,
      // tying a. Only the gauge counts, so the queue order stays a, b.
      const r = suggestTurnOrder({
        units: [{ id: 'a', side: 'ally', spd: 100 }, { id: 'b', side: 'ally', spd: 50 }],
        avLimit: 100,
        adjustments: [{ at: 'start', targetId: 'b', spd: 100 }],
      });
      expect(order(r)).toEqual(['a1@100', 'b1@100']);
    });
  });

  it('floors the gauge at 0 (E1 regression, 2026-11-08: S3 Speed gives max(0, …))', () => {
    // a: max(0, 10000 − 15000) = 0; b: 10000 − 10000 = 0. Both act at AV 0 and tie.
    // b was advanced last, so it is in front (b, a): the extra 50% advance on a is lost.
    // Then both reset: 0 + 100 = 100, tie again; each actor went to the back → b, a.
    const r = suggestTurnOrder({
      units: [{ id: 'b', side: 'ally', spd: 100 }, { id: 'a', side: 'ally', spd: 100 }],
      avLimit: 100,
      adjustments: [
        { at: 'start', targetId: 'a', advance: 1.5 },
        { at: 'start', targetId: 'b', advance: 1 },
      ],
    });
    expect(order(r)).toEqual(['b1@0', 'a1@0', 'b2@100', 'a2@100']);
  });

  it('a 100% advance cannot undo a delay, but actNow can', () => {
    // e delayed 50%: gauge 15000. Then +100% → 5000 → e at 50; a (SPD 100) at 100, 200; e at 150.
    const delayThenAdvance = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 100 }, { id: 'e', side: 'enemy', spd: 100 }],
      avLimit: 200,
      adjustments: [
        { at: 'start', targetId: 'e', advance: -0.5 },
        { at: 'start', targetId: 'e', advance: 1 },
      ],
    });
    expect(order(delayThenAdvance)).toEqual(['e1@50', 'a1@100', 'e2@150', 'a2@200']);
    // Same delay, then "immediately take action": gauge 0 → e at 0, then 100 and 200,
    // tying with a, who goes first as an ally.
    const delayThenActNow = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 100 }, { id: 'e', side: 'enemy', spd: 100 }],
      avLimit: 200,
      adjustments: [
        { at: 'start', targetId: 'e', advance: -0.5 },
        { at: 'start', targetId: 'e', actNow: true },
      ],
    });
    expect(order(delayThenActNow)).toEqual(['e1@0', 'a1@100', 'e2@100', 'a2@200', 'e3@200']);
  });

  it('assigns user-supplied cycles with inclusive upper bounds', () => {
    // first = 150, later = 100: cycle 1 is (0, 150], cycle 2 (150, 250], cycle 3 (250, 350].
    // a (SPD 200): 50, 100, 150, 200, 250, 300.
    const r = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 200 }],
      avLimit: 300,
      cycleAv: { first: 150, later: 100 },
    });
    expect(r.turns.map((t) => [t.av, t.cycle])).toEqual([[50, 1], [100, 1], [150, 1], [200, 2], [250, 2], [300, 3]]);
  });

  it('exports the sourced challenge cycle lengths (S3 Speed)', () => {
    expect(CHALLENGE_CYCLE_AV).toEqual({ first: 150, later: 100 });
    // SPD 134: 74.63 and 149.25 fall in cycle 1, 223.88 in cycle 2.
    const r = suggestTurnOrder({ units: [{ id: 'a', side: 'ally', spd: 134 }], avLimit: 250, cycleAv: CHALLENGE_CYCLE_AV });
    expect(r.turns.map((t) => t.cycle)).toEqual([1, 1, 2]);
  });

  it('omits cycle when cycleAv is not set', () => {
    const r = suggestTurnOrder({ units: [{ id: 'a', side: 'ally', spd: 100 }], avLimit: 100 });
    expect(r.turns).toEqual([{ unitId: 'a', turn: 1, av: 100 }]);
  });

  it('reports adjustments whose trigger turn never happens', () => {
    const r = suggestTurnOrder({
      units: [{ id: 'a', side: 'ally', spd: 100 }],
      avLimit: 100,
      adjustments: [
        { at: { unitId: 'a', turn: 1 }, targetId: 'a', advance: 0.1 },
        { at: { unitId: 'a', turn: 2 }, targetId: 'a', advance: 0.1 },
      ],
    });
    expect(r.unusedAdjustments).toEqual([1]);
  });

  it('stops at MAX_TIMELINE_TURNS and says so', () => {
    // SPD 10000 → one turn per AV; 20000 AV would be 20000 turns.
    const r = suggestTurnOrder({ units: [{ id: 'a', side: 'ally', spd: 10000 }], avLimit: 20000 });
    expect(r.turns).toHaveLength(MAX_TIMELINE_TURNS);
    expect(r.truncated).toBe(true);
  });

  it('does not mutate its input', () => {
    const input: TimelineInput = {
      units: [{ id: 'a', side: 'ally', spd: 100 }, { id: 'b', side: 'ally', spd: 200 }],
      avLimit: 200,
      adjustments: [{ at: { unitId: 'b', turn: 1 }, targetId: 'a', spd: 125, advance: 0.1 }],
    };
    const before = structuredClone(input);
    suggestTurnOrder(input);
    expect(input).toEqual(before);
  });

  it('rejects invalid input with every issue', () => {
    const bad = {
      units: [
        { id: 'a', side: 'ally', spd: 0 },
        { id: 'a', side: 'enemy', spd: 100 },
        { id: 'allAllies', side: 'ally', spd: 100 },
        { id: 'x', side: 'boss', spd: 100 },
      ],
      avLimit: Number.POSITIVE_INFINITY,
      cycleAv: { first: 0, later: -1 },
      adjustments: [
        { at: { unitId: 'nope', turn: 0 }, targetId: 'ghost' },
        { at: 'start', targetId: 'a', advance: Number.NaN, spd: -5, actNow: false },
      ],
    } as unknown as TimelineInput;
    let issues: readonly string[] = [];
    try {
      suggestTurnOrder(bad);
    } catch (e) {
      expect(e).toBeInstanceOf(EngineValidationError);
      issues = (e as EngineValidationError).issues;
    }
    expect(issues).toEqual([
      'units[0]: spd must be a finite number > 0',
      'units[1]: duplicate id "a"',
      'units[2]: id "allAllies" is reserved',
      'units[3]: side must be "ally" or "enemy"',
      'avLimit: must be a finite number > 0',
      'cycleAv.first: must be a finite number > 0',
      'cycleAv.later: must be a finite number > 0',
      'adjustments[0]: unknown unit "nope" in at',
      'adjustments[0]: at.turn must be an integer >= 1',
      'adjustments[0]: unknown target "ghost"',
      'adjustments[0]: needs advance, spd or actNow',
      'adjustments[1]: actNow must be true when set',
      'adjustments[1]: advance must be a finite number',
      'adjustments[1]: spd must be a finite number > 0',
    ]);
  });
});

describe('timelineToEvents', () => {
  it('creates empty turn events that runRotation accepts', () => {
    const r = suggestTurnOrder({
      units: [{ id: 'dps', side: 'ally', spd: 134 }, { id: 'enemy', side: 'enemy', spd: 100 }],
      avLimit: 100,
    });
    const events = timelineToEvents(r);
    expect(events).toEqual([
      { kind: 'turn', id: 'turn-1-dps', actorId: 'dps', steps: [] },
      { kind: 'turn', id: 'turn-2-enemy', actorId: 'enemy', steps: [] },
    ]);
    const result = runRotation({ team: [fireDps()], enemies: [enemy({ id: 'enemy' })], events });
    expect(result.log.map((l) => l.eventId)).toEqual(['turn-1-dps', 'turn-2-enemy']);
  });
});
