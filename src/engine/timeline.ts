import type {
  RotationEvent,
  TimelineAdjustment,
  TimelineInput,
  TimelineResult,
  TimelineTurn,
  TimelineUnit,
} from './types';
import { actionValue } from './formulas';
import { EngineValidationError, RESERVED_UNIT_IDS } from './validate';

/** §Action Value: every unit's action gauge is this long, at battle start and after each turn. */
export const ACTION_GAUGE = 10000;

/**
 * §Action Value, cycles (S3 Speed): in challenges such as Forgotten Hall, the
 * first cycle of each wave lasts 150 AV and every later one 100 AV. Pass it as
 * `TimelineInput.cycleAv` for a single wave; it is not applied by default.
 */
export const CHALLENGE_CYCLE_AV: { readonly first: number; readonly later: number } = { first: 150, later: 100 };

/** Hard stop, so a huge `avLimit` cannot freeze the UI. `TimelineResult.truncated` reports it. */
export const MAX_TIMELINE_TURNS = 10000;

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPosNum = (v: unknown): v is number => isFiniteNum(v) && v > 0;

/**
 * Float sums such as 3 × (10000 / 3) must still tie with 10000. This only
 * decides comparisons; no AV value is rounded.
 */
function sameAv(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** All issues in a timeline input, as English strings (same style as `validateRotationInput`). */
export function validateTimelineInput(input: TimelineInput): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  if (input.units.length === 0) out.push('units: at least one unit is required');
  for (const [i, u] of input.units.entries()) {
    const path = `units[${i}]`;
    if (typeof u.id !== 'string' || u.id === '') out.push(`${path}: id must be a non-empty string`);
    else if (RESERVED_UNIT_IDS.includes(u.id)) out.push(`${path}: id "${u.id}" is reserved`);
    else if (ids.has(u.id)) out.push(`${path}: duplicate id "${u.id}"`);
    ids.add(u.id);
    if (u.side !== 'ally' && u.side !== 'enemy') out.push(`${path}: side must be "ally" or "enemy"`);
    if (!isPosNum(u.spd)) out.push(`${path}: spd must be a finite number > 0`);
  }
  if (!isPosNum(input.avLimit)) out.push('avLimit: must be a finite number > 0');
  if (input.cycleAv !== undefined) {
    if (!isPosNum(input.cycleAv.first)) out.push('cycleAv.first: must be a finite number > 0');
    if (!isPosNum(input.cycleAv.later)) out.push('cycleAv.later: must be a finite number > 0');
  }
  for (const [i, a] of (input.adjustments ?? []).entries()) {
    const path = `adjustments[${i}]`;
    if (a.at !== 'start') {
      if (!ids.has(a.at.unitId)) out.push(`${path}: unknown unit "${a.at.unitId}" in at`);
      if (!Number.isInteger(a.at.turn) || a.at.turn < 1) out.push(`${path}: at.turn must be an integer >= 1`);
    }
    if (!ids.has(a.targetId)) out.push(`${path}: unknown target "${a.targetId}"`);
    if (a.advance === undefined && a.spd === undefined && a.actNow === undefined) {
      out.push(`${path}: needs advance, spd or actNow`);
    }
    if (a.actNow !== undefined && a.actNow !== true) out.push(`${path}: actNow must be true when set`);
    if (a.advance !== undefined && !isFiniteNum(a.advance)) out.push(`${path}: advance must be a finite number`);
    if (a.spd !== undefined && !isPosNum(a.spd)) out.push(`${path}: spd must be a finite number > 0`);
  }
  return out;
}

interface Clock {
  readonly unit: TimelineUnit;
  readonly slot: number;
  spd: number;
  /** Elapsed AV at which the gauge reaches 0. Never below `now`: gauges are floored at 0. */
  nextAt: number;
  turns: number;
}

/**
 * Keeps the gauge across a SPD change, then subtracts the advance, floored at 0
 * (S3 Speed: `max(0, AV − Base AV × (Advance% − Delay%))`). `actNow` sets the
 * gauge to 0 whatever it was, even above 10000 after a delay (FORMULAS § Action Value).
 * Returns whether the gauge changed: only then does the unit move in the tie order.
 */
function adjust(clock: Clock, now: number, a: TimelineAdjustment): boolean {
  const before = (clock.nextAt - now) * clock.spd;
  let gauge = before;
  if (a.spd !== undefined) clock.spd = a.spd;
  if (a.advance !== undefined) gauge = Math.max(0, gauge - a.advance * ACTION_GAUGE);
  if (a.actNow) gauge = 0;
  clock.nextAt = now + gauge / clock.spd;
  return gauge !== before;
}

/** Strictly earlier gauge-zero. Ties are decided by position in the tie queue. */
function actsBefore(a: Clock, b: Clock): boolean {
  return !sameAv(a.nextAt, b.nextAt) && a.nextAt < b.nextAt;
}

function moveTo(queue: Clock[], clock: Clock, end: 'front' | 'back'): void {
  queue.splice(queue.indexOf(clock), 1);
  if (end === 'front') queue.unshift(clock);
  else queue.push(clock);
}

/** §Action Value, cycles: the first cycle covers (0, first], each later one the next `later` AV. */
function cycleOf(av: number, cycleAv: { first: number; later: number }): number {
  if (av < cycleAv.first || sameAv(av, cycleAv.first)) return 1;
  const k = (av - cycleAv.first) / cycleAv.later;
  const nearest = Math.round(k);
  return 1 + (sameAv(k, nearest) ? nearest : Math.ceil(k));
}

/**
 * Suggest the order of turns from SPD, Action Advance/Delay and SPD changes.
 * Pure: the input is not mutated. Throws EngineValidationError on invalid input.
 * Ultimates and follow-ups are not turns and do not appear (FORMULAS § Action Value).
 */
export function suggestTurnOrder(input: TimelineInput): TimelineResult {
  const issues = validateTimelineInput(input);
  if (issues.length > 0) throw new EngineValidationError(issues);

  const clocks = input.units.map((unit, slot): Clock => ({
    unit, slot, spd: unit.spd, nextAt: actionValue(unit.spd), turns: 0,
  }));
  const byId = new Map(clocks.map((c) => [c.unit.id, c]));
  // Tie queue (FORMULAS § Action Value, ties). Battle start: allies before
  // enemies, then slot (S4). Afterwards, as in R3 (srsim's stable turn queue),
  // the unit that just acted goes behind the units it ties with, and a unit
  // whose gauge an adjustment changed goes in front of them.
  const queue = [...clocks].sort((a, b) =>
    a.unit.side === b.unit.side ? a.slot - b.slot : a.unit.side === 'ally' ? -1 : 1);
  const adjustments = input.adjustments ?? [];
  const used = new Set<number>();
  const applyWhere = (now: number, matches: (a: TimelineAdjustment) => boolean) => {
    for (const [i, a] of adjustments.entries()) {
      if (!matches(a)) continue;
      const target = byId.get(a.targetId)!;
      if (adjust(target, now, a)) moveTo(queue, target, 'front');
      used.add(i);
    }
  };

  let now = 0;
  applyWhere(now, (a) => a.at === 'start');
  const turns: TimelineTurn[] = [];
  let truncated = false;
  for (;;) {
    const next = queue.reduce((best, c) => (actsBefore(c, best) ? c : best));
    // Gauges never go below 0, so this only guards against float drift.
    const at = Math.max(now, next.nextAt);
    if (at > input.avLimit && !sameAv(at, input.avLimit)) break;
    if (turns.length >= MAX_TIMELINE_TURNS) {
      truncated = true;
      break;
    }
    now = at;
    next.turns += 1;
    turns.push({
      unitId: next.unit.id,
      turn: next.turns,
      av: now,
      ...(input.cycleAv ? { cycle: cycleOf(now, input.cycleAv) } : {}),
    });
    next.nextAt = now + actionValue(next.spd);
    moveTo(queue, next, 'back');
    applyWhere(now, (a) => a.at !== 'start' && a.at.unitId === next.unit.id && a.at.turn === next.turns);
  }

  const unusedAdjustments = adjustments.flatMap((_, i) => (used.has(i) ? [] : [i]));
  return { turns, truncated, unusedAdjustments };
}

/**
 * Turn a suggestion into empty `turn` events for the manual rotation. The user
 * fills in the steps; ultimates and follow-ups are added as `extra` events.
 */
export function timelineToEvents(result: TimelineResult): RotationEvent[] {
  return result.turns.map((t, i) => ({ kind: 'turn', id: `turn-${i + 1}-${t.unitId}`, actorId: t.unitId, steps: [] }));
}
