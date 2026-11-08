// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useReducer } from 'react';
import { afterEach, expect, it } from 'vitest';
import { characterEnergyCost, DATA_TABLES } from '../../data';
import type { ActionStep } from '../../engine/index';
import { t } from '../i18n';
import type { AutoBattleDraft } from '../state/auto-battle';
import { scenarioReducer } from '../state/reducer';
import type { Scenario } from '../state/scenario';
import { AutoBattlePanel } from './AutoBattlePanel';

// TEST FIXTURE — NOT GAME DATA. Same numbers as engine/__tests__/auto-battle.test.ts.
const hit = (multiplier: number): ActionStep[] => [{ op: 'hit', hit: { targetId: 'e1', scaling: 'atk', multiplier, tags: ['skill'] } }];
const settings: AutoBattleDraft = {
  avLimit: 200,
  skillPointStart: 1,
  skillPointMax: 5,
  kits: [{
    unitId: 'dps',
    basic: { steps: hit(1), energy: 20, skillPoints: 1 },
    skill: { steps: hit(2), energy: 30, skillPoints: 1 },
    ultimate: { steps: hit(4), energy: 5, energyCost: 60 },
    useSkill: true,
    useUltimate: true,
  }],
};
const energyRecord = DATA_TABLES.characters.find(({ id }) => (characterEnergyCost(DATA_TABLES, id) ?? 0) > 0)!;

function renderPanel(autoBattle?: AutoBattleDraft) {
  let state: Scenario = {
    critMode: 'expected',
    enemies: [{ id: 'e1', name: 'Test enemy', level: 90, res: {}, spd: 50 }],
    teams: [{
      label: 'Team A',
      team: [
        { id: 'dps', name: 'Test attacker', level: 80, element: 'fire', base: { hp: 1000, atk: 600, def: 400, spd: 100 } },
        { id: 'sup', name: 'Test support', level: 80, element: 'ice', characterId: energyRecord.id, base: { hp: 2000, atk: 400, def: 500, spd: 200 } },
      ],
      events: [{ kind: 'turn', id: 'old', actorId: 'dps', steps: [] }],
      cycles: 9,
      ...(autoBattle ? { autoBattle } : {}),
    }, { label: 'Team B', team: [], events: [] }],
  };
  function Panel() {
    const [scenario, dispatch] = useReducer(scenarioReducer, state);
    state = scenario;
    return <AutoBattlePanel draft={scenario.teams[0]} enemies={scenario.enemies} teamIndex={0} dispatch={dispatch} />;
  }
  render(<Panel />);
  return () => state;
}

afterEach(cleanup);

it('simulates the kits, shows the log and replaces the rotation', () => {
  const state = renderPanel(settings);
  fireEvent.click(screen.getByRole('button', { name: t('auto.simulate') }));
  const log = within(screen.getByRole('table', { name: t('auto.log') }));
  // sup has no kit: 50 idle; dps 100 Skill (SP 0, Energy 30); sup 100, 150; e1 200; dps 200 Basic (SP 1, Energy 50); sup 200.
  const rows = log.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
    .concat(within(row).getByRole('rowheader').textContent ?? ''));
  expect(rows).toEqual([
    ['50', t('auto.log.idle'), '1', '', 'Test support'],
    ['100', t('auto.log.skill'), '0', '30', 'Test attacker'],
    ['100', t('auto.log.idle'), '0', '', 'Test support'],
    ['150', t('auto.log.idle'), '0', '', 'Test support'],
    ['200', t('auto.log.enemyTurn'), '0', '', 'Test enemy'],
    ['200', t('auto.log.basic'), '1', '50', 'Test attacker'],
    ['200', t('auto.log.idle'), '1', '', 'Test support'],
  ]);

  fireEvent.click(screen.getByRole('button', { name: t('auto.replace').replace('{number}', '7') }));
  expect(screen.getByRole('status').textContent).toBe(t('auto.replaced').replace('{number}', '7'));
  const team = state().teams[0];
  expect(team.events.map(({ actorId, label }) => [actorId, label])).toEqual([
    ['sup', undefined], ['dps', t('auto.action.skill')], ['sup', undefined], ['sup', undefined],
    ['e1', undefined], ['dps', t('auto.action.basic')], ['sup', undefined],
  ]);
  expect(team.events[1]?.steps).toEqual(hit(2));
  expect(team).not.toHaveProperty('cycles');
  expect(team.autoBattle).toBe(settings);
});

it('enables a kit with the sourced Ultimate cost and names missing numbers', () => {
  const state = renderPanel();
  const support = within(screen.getByRole('group', { name: t('auto.kitFor').replace('{name}', 'Test support') }));
  fireEvent.click(support.getByLabelText(t('auto.enabled')));
  const ultimate = within(support.getByRole('group', { name: t('auto.action.ultimate') }));
  expect(ultimate.getByLabelText<HTMLInputElement>(t('auto.energyCost')).value).toBe(String(characterEnergyCost(DATA_TABLES, energyRecord.id)));
  expect(state().teams[0].autoBattle?.kits.map(({ unitId }) => unitId)).toEqual(['sup']);

  fireEvent.click(screen.getByRole('button', { name: t('auto.simulate') }));
  const issues = within(screen.getByRole('alert')).getAllByRole('listitem').map((item) => item.textContent);
  expect(issues).toEqual(expect.arrayContaining([
    `${t('auto.skillPointStart')}：${t('issue.autoSkillPointStart')}`,
    `${t('auto.skillPointMax')}：${t('issue.positiveInteger')}`,
    `${t('auto.avLimit')}：${t('issue.positiveNumber')}`,
    `Test support・${t('auto.action.basic')}・${t('auto.energyGain')}：${t('issue.nonNegativeNumber')}`,
    `Test support・${t('auto.action.basic')}・${t('auto.skillPointGain')}：${t('issue.nonNegativeInteger')}`,
  ]));
  expect(issues.every((issue) => !/must|required/.test(issue ?? ''))).toBe(true);

  fireEvent.click(support.getByLabelText(t('auto.enabled')));
  expect(state().teams[0].autoBattle?.kits).toEqual([]);
});

it('fills an imported character from the skill table and re-fills at new levels', () => {
  // TEST FIXTURE — synthetic stats; the game ID (1003) and skill levels are what an import sets.
  const next = renderPanelWith({
    label: 'Team A',
    team: [{
      id: 'dps', name: 'Test attacker', level: 80, element: 'fire', base: { hp: 1000, atk: 600, def: 400, spd: 100 },
      characterId: '1003', skillLevels: { basic: 6, skill: 10, ultimate: 10 },
    }],
    events: [],
  });
  const attacker = within(screen.getByRole('group', { name: t('auto.kitFor').replace('{name}', 'Test attacker') }));
  fireEvent.click(attacker.getByLabelText(t('auto.enabled')));

  const kit = () => next().teams[0].autoBattle!.kits[0]!;
  const multiplier = (steps: readonly ActionStep[]) => steps.map((s) => s.op === 'hit' && s.hit.multiplier);
  // Himeko at 6 / 10 / 10 (one enemy, so the Blast has no neighbours): 100%, 200%, 230%.
  expect(multiplier(kit().basic.steps)).toEqual([1]);
  expect(multiplier(kit().skill.steps)).toEqual([2]);
  expect(multiplier(kit().ultimate.steps)).toEqual([2.3]);
  expect(kit().basic).toMatchObject({ energy: 20, skillPoints: 1 });

  const prefill = within(attacker.getByRole('group', { name: t('auto.prefill.title') }));
  expect(prefill.getAllByRole('listitem')).toHaveLength(3);
  fireEvent.change(prefill.getByLabelText(t('auto.prefill.level.skill')), { target: { value: '12' } });
  fireEvent.click(prefill.getByRole('button', { name: t('auto.prefill.apply') }));
  expect(multiplier(kit().skill.steps)).toEqual([2.2]);
});

function renderPanelWith(team: Scenario['teams'][0]) {
  let state: Scenario = {
    critMode: 'expected',
    enemies: [{ id: 'e1', name: 'Test enemy', level: 90, res: {}, spd: 50 }],
    teams: [team, { label: 'Team B', team: [], events: [] }],
  };
  function Panel() {
    const [scenario, dispatch] = useReducer(scenarioReducer, state);
    state = scenario;
    return <AutoBattlePanel draft={scenario.teams[0]} enemies={scenario.enemies} teamIndex={0} dispatch={dispatch} />;
  }
  render(<Panel />);
  return () => state;
}

it('enables every member in one click and names an empty kit list in zh-HK', () => {
  const state = renderPanel({ ...settings, kits: [] });
  // Regression: with no kit enabled the simulation wrote empty turns that scored 0.
  fireEvent.click(screen.getByRole('button', { name: t('auto.simulate') }));
  expect(within(screen.getByRole('alert')).getAllByRole('listitem').map((item) => item.textContent))
    .toEqual([`${t('auto.title')}：${t('issue.kitRequired')}`]);

  const enableAll = screen.getByRole<HTMLButtonElement>('button', { name: t('auto.enableAll') });
  fireEvent.click(enableAll);
  expect(state().teams[0].autoBattle?.kits.map(({ unitId }) => unitId)).toEqual(['dps', 'sup']);
  expect(enableAll.disabled).toBe(true);
});
