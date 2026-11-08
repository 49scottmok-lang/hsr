// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useReducer } from 'react';
import { afterEach, expect, it } from 'vitest';
import { runRotation, type EffectDef } from '../../engine/index';
import { t, type TranslationKey } from '../i18n';
import { scenarioReducer } from '../state/reducer';
import { toRotationInput, type Scenario } from '../state/scenario';
import { RotationEditor } from './RotationEditor';

// TEST FIXTURE — NOT GAME DATA. Inputs mirror the worked rotation tests.
const support = { id: 'sup', name: 'Test support', level: 80, element: 'ice', base: { hp: 2000, atk: 400, def: 500, spd: 120 } } as const;
const skillBuff: EffectDef = {
  id: 'skill-dmg', name: 'Test skill buff', kind: 'buff',
  modifiers: [{ stat: 'dmgBoost', value: 0.2, condition: { damageTags: ['skill'] } }],
};
const vulnerability: EffectDef = {
  id: 'vuln', name: 'Test vulnerability', kind: 'debuff',
  modifiers: [{ stat: 'vulnerability', value: 0.5 }],
  duration: { turns: 1, tickUnit: 'holder', tickPhase: 'turnStart' },
};

function renderRotation() {
  let state: Scenario = {
    critMode: 'expected',
    enemies: [{ id: 'e1', name: 'Test enemy', level: 90, res: { fire: 0.2 }, debuffRes: { burn: 0.2 } }],
    teams: [{
      label: 'Team A',
      team: [{
        ...support, id: 'dps', name: 'Test attacker', element: 'fire',
        base: { hp: 1000, atk: 600, def: 400, spd: 100 },
        baseCritRate: 0.7, baseCritDmg: 1.5,
        lightCone: { name: 'Test cone', base: { hp: 0, atk: 500, def: 0 }, effects: [] },
        relics: {
          stats: [
            { stat: 'atkPct', value: 0.5 }, { stat: 'atkFlat', value: 300 },
            { stat: 'dmgBoost', value: 0.4, condition: { elements: ['fire'] } },
            { stat: 'spdFlat', value: 25 },
          ],
          setEffects: [],
        },
      }, support],
      effectLibrary: [skillBuff, vulnerability],
      events: [],
    }, { label: 'Team B', team: [], events: [] }],
  };
  function Editor() {
    const [scenario, dispatch] = useReducer(scenarioReducer, state);
    state = scenario;
    return <RotationEditor draft={scenario.teams[0]} enemies={scenario.enemies} teamIndex={0} dispatch={dispatch} />;
  }
  render(<Editor />);
  return () => toRotationInput(state, 0);
}

function event(number: number) {
  return within(screen.getByRole('group', { name: t('rotation.eventNumber').replace('{number}', String(number)) }));
}

function click(key: TranslationKey, scope = screen) {
  fireEvent.click(scope.getByRole('button', { name: t(key) }));
}

function change(key: TranslationKey, value: string, scope = screen) {
  fireEvent.change(scope.getByLabelText(t(key)), { target: { value } });
}

function addSkillHit(number: number) {
  click('rotation.add.hit', event(number));
  const hit = within(event(number).getByRole('group', { name: t('rotation.step.hit') }));
  change('rotation.multiplier', '200', hit);
  change('modifier.tags', 'skill', hit);
}

afterEach(cleanup);

it('edits DoT chance and type and clears dependent settings when the chance or tag is removed', () => {
  const input = renderRotation();
  click('rotation.addTurn');
  addSkillHit(1);
  const row = within(event(1).getByRole('group', { name: t('rotation.step.hit') }));
  expect(row.queryByLabelText(t('rotation.baseChance'))).toBeNull();
  change('modifier.tags', 'dot', row);
  expect(row.queryByLabelText(t('rotation.dotType'))).toBeNull();
  change('rotation.baseChance', '125', row);
  expect(input().events[0]?.steps[0]).toMatchObject({ hit: { tags: ['dot'], baseChance: 1.25 } });
  change('rotation.baseChance', '0', row);
  change('rotation.dotType', 'burn', row);
  expect(runRotation(input()).hits[0]?.breakdown.dotChanceMultiplier).toBe(0);
  change('rotation.baseChance', '75', row);
  expect(input().events[0]?.steps[0]).toMatchObject({ hit: { dotType: 'burn', baseChance: 0.75 } });
  // 75% base chance × (1 − 20% Burn RES) = 60%.
  expect(runRotation(input()).hits[0]?.breakdown.dotChanceMultiplier).toBeCloseTo(0.6, 6);
  change('rotation.dotType', '', row);
  expect(runRotation(input()).hits[0]?.breakdown.dotChanceMultiplier).toBe(0.75);
  change('rotation.dotType', 'burn', row);
  change('rotation.baseChance', '', row);
  expect(row.queryByLabelText(t('rotation.dotType'))).toBeNull();
  expect(runRotation(input()).hits[0]?.breakdown.dotChanceMultiplier).toBe(1);
  change('rotation.baseChance', '75', row);
  expect(row.getByRole<HTMLSelectElement>('combobox', { name: t('rotation.dotType') }).value).toBe('');
  change('rotation.dotType', 'shock', row);
  change('modifier.tags', 'skill', row);
  expect(row.queryByLabelText(t('rotation.baseChance'))).toBeNull();
  const step = input().events[0]?.steps[0];
  expect(step?.op === 'hit' && step.hit).toStrictEqual({ targetId: 'e1', scaling: 'atk', multiplier: 2, tags: ['skill'] });
});

it('adds a Break step and edits all Super Break inputs including a fractional efficiency', () => {
  const input = renderRotation();
  click('rotation.addTurn');
  click('rotation.add.break', event(1));
  const row = within(event(1).getByRole('group', { name: t('rotation.step.break') }));
  expect(input().events[0]?.steps).toEqual([{ op: 'break', hit: { kind: 'break', targetId: 'e1' } }]);
  change('rotation.breakKind', 'superBreak', row);
  change('results.attacker', 'sup', row);
  change('rotation.elementOverride', 'lightning', row);
  change('rotation.hitLabel', 'Test hit', row);
  change('rotation.multiplier', '125', row);
  change('rotation.toughnessReduction', '20', row);
  change('rotation.breakEfficiency', '50', row);
  change('rotation.fixedToughnessReduction', '5', row);
  expect(input().events[0]?.steps).toEqual([{ op: 'break', hit: {
    kind: 'superBreak', targetId: 'e1', attackerId: 'sup', element: 'lightning', label: 'Test hit',
    multiplier: 1.25, toughnessReduction: 20, breakEfficiency: 0.5, fixedToughnessReduction: 5,
  } }]);
  change('rotation.breakKind', 'break', row);
  expect(input().events[0]?.steps).toEqual([{ op: 'break', hit: {
    kind: 'break', targetId: 'e1', attackerId: 'sup', element: 'lightning', label: 'Test hit', multiplier: 1.25,
  } }]);
});

it('builds the earlier-buff rotation and matches the engine worked example', () => {
  const input = renderRotation();
  click('rotation.addTurn');
  change('rotation.actor', 'sup', event(1));
  click('rotation.add.apply', event(1));
  change('rotation.target', 'dps', event(1));
  click('rotation.addTurn');
  addSkillHit(2);
  const result = runRotation(input());
  expect(result.hits).toHaveLength(1);
  // (600 + 500) × 1.5 + 300 = 1950 ATK; 1.6 includes relic and skill DMG.
  expect(result.totalDamage).toBeCloseTo(3900 * 2.05 * 1.6 * (1000 / 2100) * 0.8 * 0.9, 6);
});

it('builds an enemy turn that expires an all-enemy debuff and duplicates the hit event', () => {
  const input = renderRotation();
  click('rotation.addTurn');
  change('rotation.actor', 'sup', event(1));
  click('rotation.add.apply', event(1));
  change('rotation.applyEffect', 'vuln', event(1));
  change('rotation.target', 'allEnemies', event(1));
  click('rotation.addTurn');
  addSkillHit(2);
  click('rotation.addTurn');
  change('rotation.actor', 'e1', event(3));
  click('rotation.duplicate', event(2));

  const rotation = input();
  expect(new Set(rotation.events.map(({ id }) => id)).size).toBe(4);
  const result = runRotation(rotation);
  const unbuffed = 3900 * 2.05 * 1.4 * (1000 / 2100) * 0.8 * 0.9;
  expect(result.hits[0]?.damage).toBeCloseTo(unbuffed * 1.5, 6);
  expect(result.hits[1]?.damage).toBeCloseTo(unbuffed, 6);
  expect(result.totalDamage).toBeCloseTo(unbuffed * 2.5, 6);
  expect(result.log[2]?.expired).toEqual(['e1:vuln']);
});

it('reorders events and steps and supports removal, broken state and eidolon requirements', () => {
  const input = renderRotation();
  click('rotation.addTurn');
  click('rotation.addExtra');
  click('rotation.moveUp', event(2));
  change('rotation.eventLabel', 'Test extra', event(1));
  click('rotation.add.remove', event(1));
  click('rotation.add.setBroken', event(1));
  const broken = within(event(1).getByRole('group', { name: t('rotation.step.setBroken') }));
  change('effect.minEidolon', '2', broken);
  click('rotation.moveUp', broken);
  expect(input().events.map(({ kind }) => kind)).toEqual(['extra', 'turn']);
  expect(input().events[0]).toMatchObject({
    label: 'Test extra',
    steps: [
      { op: 'setBroken', enemyId: 'e1', broken: true, requires: { minEidolon: 2 } },
      { op: 'remove', effectId: 'skill-dmg', from: 'dps' },
    ],
  });
  expect(runRotation(input()).log[0]?.skippedSteps).toEqual([0]);
  click('rotation.remove', within(event(1).getByRole('group', { name: t('rotation.step.remove') })));
  expect(input().events[0]?.steps).toHaveLength(1);
});

it('previews turn order from final ally speed and manual changes, then appends empty turns in that order', () => {
  const input = renderRotation();
  click('rotation.addExtra');
  addSkillHit(1);
  const original = input().events[0];
  fireEvent.click(screen.getByText(t('timeline.title')));
  expect(screen.getByText(t('timeline.allySpeed').replace('{name}', 'Test attacker').replace('{spd}', '125'))).toBeTruthy();
  fireEvent.change(screen.getByLabelText(t('timeline.enemySpeed').replace('{name}', 'Test enemy')), { target: { value: '100' } });
  change('timeline.limit', '150');
  change('timeline.firstCycle', '100');
  change('timeline.laterCycle', '50');

  function addAdjustment(number: number) {
    click('timeline.addAdjustment');
    return within(screen.getByRole('group', { name: t('timeline.adjustment').replace('{number}', String(number)) }));
  }

  const delay = addAdjustment(1);
  change('rotation.target', 'e1', delay);
  change('timeline.advance', '-25', delay);
  const speed = addAdjustment(2);
  change('timeline.trigger', 'after', speed);
  change('rotation.target', 'sup', speed);
  change('timeline.advance', '25', speed);
  change('timeline.newSpeed', '200', speed);
  const unused = addAdjustment(3);
  change('timeline.trigger', 'after', unused);
  change('timeline.triggerUnit', 'sup', unused);
  change('timeline.turnNumber', '3', unused);
  change('timeline.advance', '10', unused);

  click('timeline.preview');
  const table = within(screen.getByRole('table', { name: t('timeline.preview') }));
  const rows = table.getAllByRole('row').slice(1).map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => cell.textContent));
  // Attacker: 10000 / 125 = 80. Support at AV 80: 10000 - 80 × 120 = 400;
  // advancing by 2500 puts it at AV 80 too, then 10000 / 200 later. Enemy: 12500 / 100 = 125.
  expect(rows).toEqual([
    ['Test attacker', '1', '80', '1'], ['Test support', '1', '80', '1'],
    ['Test enemy', '1', '125', '2'], ['Test support', '2', '130', '2'],
  ]);
  expect(screen.getByRole('status').textContent).toBe(t('timeline.unused').replace('{numbers}',
    t('timeline.adjustment').replace('{number}', '3')));
  expect(input().events).toEqual([original]);

  fireEvent.click(screen.getByRole('button', { name: t('timeline.append').replace('{number}', '4') }));
  expect(input().events[0]).toEqual(original);
  expect(input().events.slice(1)).toEqual(['dps', 'sup', 'e1', 'sup'].map((actorId, index) => ({
    kind: 'turn', id: `event-${index + 2}`, actorId, steps: [],
  })));
  expect(input().cycles).toBeUndefined();
  expect(runRotation(input()).hits).toHaveLength(1);
});

it('localizes missing timeline inputs and clears an obsolete preview when a setting changes', () => {
  const input = renderRotation();
  fireEvent.click(screen.getByText(t('timeline.title')));
  change('timeline.firstCycle', '100');
  change('timeline.laterCycle', '');
  click('timeline.preview');
  const errors = screen.getByRole('alert').textContent;
  expect(errors).toContain(`Test enemy：${t('issue.timelineSpeed')}`);
  expect(errors).toContain(`${t('timeline.limit')}：${t('issue.positiveNumber')}`);
  expect(errors).toContain(`${t('timeline.laterCycle')}：${t('issue.positiveNumber')}`);
  change('timeline.firstCycle', '');
  fireEvent.change(screen.getByLabelText(t('timeline.enemySpeed').replace('{name}', 'Test enemy')), { target: { value: '100' } });
  change('timeline.limit', '90');
  click('timeline.preview');
  expect(screen.queryByRole('columnheader', { name: t('timeline.cycle') })).toBeNull();
  expect(screen.getByRole('button', { name: t('timeline.append').replace('{number}', '2') })).toBeTruthy();
  change('timeline.limit', '20');
  expect(screen.queryByRole('table', { name: t('timeline.preview') })).toBeNull();
  click('timeline.preview');
  expect(screen.getByRole('status').textContent).toBe(t('timeline.noTurns'));
  expect(input().events).toEqual([]);
});

it('moves a delayed enemy immediately after the trigger turn and labels turns with the default cycle lengths', () => {
  renderRotation();
  fireEvent.click(screen.getByText(t('timeline.title')));
  expect((screen.getByLabelText(t('timeline.firstCycle')) as HTMLInputElement).value).toBe('150');
  expect((screen.getByLabelText(t('timeline.laterCycle')) as HTMLInputElement).value).toBe('100');
  fireEvent.change(screen.getByLabelText(t('timeline.enemySpeed').replace('{name}', 'Test enemy')), { target: { value: '100' } });
  change('timeline.limit', '300');

  click('timeline.addAdjustment');
  const delay = within(screen.getByRole('group', { name: t('timeline.adjustment').replace('{number}', '1') }));
  change('rotation.target', 'e1', delay);
  change('timeline.advance', '-100', delay);

  click('timeline.addAdjustment');
  const immediate = within(screen.getByRole('group', { name: t('timeline.adjustment').replace('{number}', '2') }));
  change('timeline.trigger', 'after', immediate);
  change('rotation.target', 'e1', immediate);
  click('timeline.preview');
  expect(screen.getByRole('alert').textContent).toContain(t('issue.timelineAdjustment'));
  fireEvent.click(immediate.getByRole('checkbox', { name: t('timeline.actNow') }));
  click('timeline.preview');

  const rows = within(screen.getByRole('table', { name: t('timeline.preview') })).getAllByRole('row');
  const enemyRows = rows.filter((row) => within(row).queryByRole('rowheader', { name: 'Test enemy' }));
  expect(within(rows[1]!).getByRole('rowheader').textContent).toBe('Test attacker');
  expect(rows[2]).toBe(enemyRows[0]);
  // At AV 80 the delayed enemy would have 12000 gauge left. Act now sets it to 0.
  // At SPD 100 it acts again after 100 AV, crossing the 150 and 250 AV cycle boundaries.
  expect(enemyRows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)))
    .toEqual([['1', '80', '1'], ['2', '180', '2'], ['3', '280', '3']]);

  change('timeline.firstCycle', '75');
  fireEvent.blur(screen.getByLabelText(t('timeline.firstCycle')));
  fireEvent.click(screen.getByRole('button', { name: t('timeline.cyclePreset').replace('{first}', '150').replace('{later}', '100') }));
  expect((screen.getByLabelText(t('timeline.firstCycle')) as HTMLInputElement).value).toBe('150');
});
