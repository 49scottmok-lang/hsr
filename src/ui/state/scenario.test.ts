// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ActionStep, CharacterBuild, EnemyConfig, RotationEvent } from '../../engine/index';
import { scenarioReducer } from './reducer';
import { exportScenario, importScenario } from './scenario-json';
import { toRotationInput, type Scenario } from './scenario';

// TEST FIXTURE — NOT GAME DATA
const character: CharacterBuild = {
  id: 'a', name: 'A', level: 2, element: 'fire', eidolon: 2,
  base: { hp: 11, atk: 12, def: 13, spd: 14 },
  lightCone: { name: 'Test cone', superimposition: 3, base: { hp: 2, atk: 3, def: 4 }, effects: [] },
};
const enemy: EnemyConfig = { id: 'e', name: 'Enemy', level: 3, res: { fire: 0.12 } };
const hit: ActionStep = { op: 'hit', hit: { targetId: enemy.id, scaling: 'atk', multiplier: 1.25, tags: ['skill'] } };
const event: RotationEvent = {
  id: 'ev', kind: 'turn', actorId: character.id, steps: [{
    op: 'apply', to: character.id,
    effect: {
      id: 'effect', name: 'Test effect', kind: 'buff', requires: { minEidolon: 2 },
      duration: { turns: 1, tickUnit: { unitId: character.id }, tickPhase: 'turnEnd' },
      modifiers: [{ stat: 'dmgBoost', value: 0.15, condition: { damageTags: ['skill'] } }],
    },
  }, hit],
};
const scenario: Scenario = {
  enemies: [enemy], critMode: 'expected', teams: [
    { label: 'First', team: [character], events: [event], cycles: 1.5 },
    { label: 'Second', team: [{ ...character, id: 'b' }], events: [] },
  ],
};

describe('scenarioReducer', () => {
  it('adds, updates, reorders and removes characters in the selected team', () => {
    const added = { ...character, id: 'c' };
    const updated = { ...added, name: 'C' };
    let state = scenarioReducer(scenario, { type: 'editCharacters', teamIndex: 1, edit: { type: 'add', value: added } });
    expect(state.teams[1].team).toEqual([scenario.teams[1].team[0], added]);
    state = scenarioReducer(state, { type: 'editCharacters', teamIndex: 1, edit: { type: 'update', index: 1, value: updated } });
    expect(state.teams[1].team[1]).toBe(updated);
    state = scenarioReducer(state, { type: 'editCharacters', teamIndex: 1, edit: { type: 'reorder', index: 1, toIndex: 0 } });
    expect(state.teams[1].team).toEqual([updated, scenario.teams[1].team[0]]);
    state = scenarioReducer(state, { type: 'editCharacters', teamIndex: 1, edit: { type: 'remove', index: 1 } });
    expect(state.teams[1].team).toEqual([updated]);
    expect(state.teams[0]).toBe(scenario.teams[0]);
    expect(scenario.teams[1].team.map((unit) => unit.id)).toEqual(['b']);
  });

  it('adds, updates, reorders and removes shared enemies', () => {
    const added = { ...enemy, id: 'other' };
    const updated = { ...enemy, broken: true };
    let state = scenarioReducer(scenario, { type: 'editEnemies', edit: { type: 'add', value: added } });
    expect(state.enemies).toEqual([enemy, added]);
    state = scenarioReducer(state, { type: 'editEnemies', edit: { type: 'update', index: 0, value: updated } });
    expect(state.enemies[0]).toBe(updated);
    state = scenarioReducer(state, { type: 'editEnemies', edit: { type: 'reorder', index: 0, toIndex: 1 } });
    expect(state.enemies).toEqual([added, updated]);
    state = scenarioReducer(state, { type: 'editEnemies', edit: { type: 'remove', index: 0 } });
    expect(state.enemies).toEqual([updated]);
    expect(state.teams).toBe(scenario.teams);
    expect(scenario.enemies).toEqual([enemy]);
  });

  it('adds, updates, reorders and removes events', () => {
    const added: RotationEvent = { ...event, id: 'extra', kind: 'extra' };
    const updated = { ...added, label: 'Updated' };
    let state = scenarioReducer(scenario, { type: 'editEvents', teamIndex: 0, edit: { type: 'add', value: added } });
    expect(state.teams[0].events).toEqual([event, added]);
    state = scenarioReducer(state, { type: 'editEvents', teamIndex: 0, edit: { type: 'update', index: 1, value: updated } });
    expect(state.teams[0].events[1]).toBe(updated);
    state = scenarioReducer(state, { type: 'editEvents', teamIndex: 0, edit: { type: 'reorder', index: 1, toIndex: 0 } });
    expect(state.teams[0].events).toEqual([updated, event]);
    state = scenarioReducer(state, { type: 'editEvents', teamIndex: 0, edit: { type: 'remove', index: 1 } });
    expect(state.teams[0].events).toEqual([updated]);
    expect(scenario.teams[0].events).toEqual([event]);
  });

  it('adds, updates, reorders and removes steps within one event', () => {
    const added: ActionStep = { op: 'setBroken', enemyId: enemy.id, broken: true };
    const updated: ActionStep = { ...added, broken: false };
    let state = scenarioReducer(scenario, { type: 'editSteps', teamIndex: 0, eventIndex: 0, edit: { type: 'add', value: added } });
    expect(state.teams[0].events[0]?.steps).toEqual([...event.steps, added]);
    state = scenarioReducer(state, { type: 'editSteps', teamIndex: 0, eventIndex: 0, edit: { type: 'update', index: 2, value: updated } });
    expect(state.teams[0].events[0]?.steps[2]).toBe(updated);
    state = scenarioReducer(state, { type: 'editSteps', teamIndex: 0, eventIndex: 0, edit: { type: 'reorder', index: 2, toIndex: 0 } });
    expect(state.teams[0].events[0]?.steps).toEqual([updated, ...event.steps]);
    state = scenarioReducer(state, { type: 'editSteps', teamIndex: 0, eventIndex: 0, edit: { type: 'remove', index: 1 } });
    expect(state.teams[0].events[0]?.steps).toEqual([updated, hit]);
    expect(event.steps).toHaveLength(2);
  });

  it('sets the shared crit mode and sets or clears cycles on one team', () => {
    const state = scenarioReducer(scenario, { type: 'setCritMode', critMode: 'crit' });
    const withCycles = scenarioReducer(state, { type: 'setCycles', teamIndex: 1, cycles: 2 });
    const withoutCycles = scenarioReducer(withCycles, { type: 'setCycles', teamIndex: 1, cycles: undefined });
    expect(withCycles.teams[1].cycles).toBe(2);
    expect(withoutCycles.teams[1]).toStrictEqual(scenario.teams[1]);
    expect(withoutCycles.teams[0].cycles).toBe(1.5);
    expect(withoutCycles.critMode).toBe('crit');
  });

  it('ignores stale list indexes', () => {
    expect(scenarioReducer(scenario, { type: 'editEnemies', edit: { type: 'reorder', index: 0, toIndex: -1 } })).toBe(scenario);
    expect(scenarioReducer(scenario, { type: 'editSteps', teamIndex: 0, eventIndex: 5, edit: { type: 'remove', index: 0 } })).toBe(scenario);
  });
});

it.each([0, 1] as const)('converts team %i using shared enemies and crit mode', (index) => {
  const { team, events, cycles } = scenario.teams[index];
  const input = toRotationInput(scenario, index);
  expect(input).toStrictEqual({ team, events, cycles, enemies: scenario.enemies, critMode: scenario.critMode });
  expect(input.enemies).toBe(scenario.enemies);
});

describe('scenario JSON', () => {
  it('round-trips both teams and their nested build and rotation data', () => {
    expect(importScenario(exportScenario(scenario))).toStrictEqual({ ok: true, scenario, issues: [] });
  });

  it('returns engine issues from both teams with their editor paths', () => {
    const invalid: Scenario = { ...scenario, teams: [
      { ...scenario.teams[0], cycles: -1 },
      { ...scenario.teams[1], events: [{ ...event, steps: [] }] },
    ] };
    expect(importScenario(exportScenario(invalid))).toEqual({ ok: false, issues: [
      'teams[0].cycles: must be a positive number',
      'teams[1].events[0]: actor "a" is not a unit',
    ] });
  });

  it('returns an issue for invalid JSON', () => {
    expect(importScenario('{')).toEqual({ ok: false, issues: ['Scenario: invalid JSON'] });
  });

  it.each([
    null,
    { ...scenario, teams: [scenario.teams[0]] },
    { ...scenario, enemies: [null] },
    { ...scenario, teams: [{ ...scenario.teams[0], events: [{ ...event, steps: [{ op: 'hit' }] }] }, scenario.teams[1]] },
    { ...scenario, teams: [{ ...scenario.teams[0], events: [{ ...event, steps: [{ op: 'unknown' }] }] }, scenario.teams[1]] },
  ])('returns an issue for malformed scenario data %#', (value) => {
    expect(importScenario(JSON.stringify(value))).toEqual({ ok: false, issues: ['Scenario: invalid structure'] });
  });
});
