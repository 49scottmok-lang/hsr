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
    enemies: [{ id: 'e1', name: 'Test enemy', level: 90, res: { fire: 0.2 } }],
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
