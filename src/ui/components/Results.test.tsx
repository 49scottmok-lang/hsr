// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { runRotation, type CharacterBuild, type HitSpec } from '../../engine/index';
import App from '../App';
import { formatMultiplier, t } from '../i18n';
import { toRotationInput, type Scenario } from '../state/scenario';
import { Results } from './Results';

// TEST FIXTURE — NOT GAME DATA. Worked example from docs/FORMULAS.md.
const attacker: CharacterBuild = {
  id: 'dps', name: 'Test attacker', level: 80, element: 'fire',
  base: { hp: 0, atk: 600, def: 0, spd: 0 },
  baseCritRate: 0.7, baseCritDmg: 1.5,
  lightCone: { name: 'Test cone', base: { hp: 0, atk: 500, def: 0 }, effects: [] },
  relics: {
    stats: [
      { stat: 'atkPct', value: 0.5 },
      { stat: 'atkFlat', value: 300 },
      { stat: 'dmgBoost', value: 0.4, condition: { elements: ['fire'] } },
    ],
    setEffects: [],
  },
  passiveEffects: [{
    id: 'skill-boost', name: 'Test skill boost', kind: 'buff',
    modifiers: [{ stat: 'dmgBoost', value: 0.2, condition: { damageTags: ['skill'] } }],
  }],
};
const hit: HitSpec = { targetId: 'enemy', scaling: 'atk', multiplier: 2, tags: ['skill', 'followUp'], label: 'Test hit' };
const scenario: Scenario = {
  critMode: 'expected',
  enemies: [{ id: 'enemy', name: 'Test enemy', level: 90, res: { fire: 0.2 } }],
  teams: [
    {
      label: t('team.a'), team: [attacker], cycles: 2,
      events: [
        {
          id: 'test-turn', kind: 'turn', actorId: 'dps', steps: [
            {
              op: 'apply', to: 'enemy',
              effect: {
                id: 'test-timer', name: 'Test timer', kind: 'debuff', modifiers: [],
                duration: { turns: 1, tickUnit: 'holder', tickPhase: 'turnStart' },
              },
            },
            { op: 'hit', hit },
            { op: 'hit', hit, requires: { minEidolon: 2 } },
          ],
        },
        { id: 'enemy-turn', kind: 'turn', actorId: 'enemy', steps: [] },
      ],
    },
    {
      label: t('team.b'), team: [attacker], cycles: 1,
      events: [{ id: 'test-extra', kind: 'extra', actorId: 'dps', steps: [
        { op: 'hit', hit: { ...hit, multiplier: 1.00015 } },
      ] }],
    },
  ],
};

function teamDetails(team: string) {
  return within(screen.getByRole('region', { name: t('results.teamDetails').replace('{team}', team) }));
}

afterEach(cleanup);

it('shows both kinds of break details from the engine without adding damage by tag', () => {
  const draft: Scenario = {
    ...scenario,
    enemies: scenario.enemies.map((enemy) => ({ ...enemy, maxToughness: 120 })),
    teams: [{
      ...scenario.teams[0],
      team: [{ ...attacker, breakLevelMultiplier: 4000 }],
      events: [{ id: 'break-event', kind: 'extra', actorId: 'dps', steps: [
        { op: 'break', hit: { kind: 'break', targetId: 'enemy', label: 'Test Break' } },
        { op: 'break', hit: {
          kind: 'superBreak', targetId: 'enemy', label: 'Test Super Break',
          toughnessReduction: 20, breakEfficiency: 0.5, multiplier: 1.5,
        } },
      ] }],
    }, scenario.teams[1]],
  };
  render(<Results scenario={draft} />);
  const team = teamDetails(t('team.a'));
  const byTag = within(team.getByRole('table', { name: t('results.byTag') }));
  expect(byTag.queryByRole('cell')).toBeNull();
  const rows = runRotation(toRotationInput(draft, 0)).hits;
  for (const hit of rows) {
    const row = within(team.getByText(hit.label!).closest('tr')!);
    const details = hit.break!;
    const summary = row.getByText(t(`rotation.breakKind.${details.kind}`));
    fireEvent.click(summary);
    expect(row.getAllByRole('cell').slice(7, 9).map(({ textContent }) => textContent)).toEqual(['1.0000', '1.0000']);
    expect(row.getByText(t('results.breakBaseNote'))).toBeTruthy();
    const key = details.kind === 'break' ? 'enemy.maxToughness' : 'results.effectiveToughness';
    expect(row.getByText(t(key)).nextElementSibling?.textContent).toBe(formatMultiplier(details.maxToughness ?? details.toughness!));
  }
});

it('routes missing Break inputs to the break step and both unit editors', () => {
  render(<App />);
  const team = within(screen.getByRole('region', { name: t('team.a') }));
  const enemies = within(screen.getByRole('region', { name: t('enemy.shared') }));
  fireEvent.click(enemies.getByRole('button', { name: t('enemy.add') }));
  fireEvent.click(team.getByRole('button', { name: t('character.add') }));
  fireEvent.change(team.getByLabelText(t('character.breakLevelMultiplier')), { target: { value: '' } });
  fireEvent.click(team.getByRole('button', { name: t('rotation.addTurn') }));
  fireEvent.click(team.getByRole('button', { name: t('rotation.add.break') }));
  fireEvent.click(screen.getByRole('button', { name: t('results.calculate') }));
  const step = within(team.getByRole('group', { name: t('rotation.step.break') }));
  const characterIssue = t('issue.breakLevelMultiplier').replace('{value}', 'character-1');
  const enemyIssue = t('issue.maxToughness').replace('{value}', 'enemy-1');
  expect(step.getByText(characterIssue)).toBeTruthy();
  expect(step.getByText(enemyIssue)).toBeTruthy();
  expect(within(team.getByRole('group', { name: t('character.title') })).getByText(characterIssue)).toBeTruthy();
  expect(within(enemies.getByRole('group', { name: 'enemy-1' })).getByText(enemyIssue)).toBeTruthy();
  fireEvent.change(enemies.getByLabelText(t('enemy.maxToughness')), { target: { value: '120' } });
  expect(step.queryByText(enemyIssue)).toBeNull();
});

it('renders the worked example and compares unrounded damage before display formatting', () => {
  const result = runRotation(toRotationInput(scenario, 0));
  // 3900 × 2.05 × 1.6 × (1000 / 2100) × 0.8 × 0.9
  expect(result.totalDamage).toBeCloseTo(4385.828571428571, 6);
  render(<Results scenario={scenario} />);
  const comparison = within(screen.getByRole('table', { name: t('results.comparison') }));
  const total = within(comparison.getByRole('rowheader', { name: t('results.total') }).closest('tr')!);
  expect(total.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['4386', '2193', '-2193', '0.5001']);
  const perCycle = within(comparison.getByRole('rowheader', { name: t('results.perCycle') }).closest('tr')!);
  expect(perCycle.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2193', '2193', '0', '1.0002']);
});

it('shows every hit factor, expandable stats, multi-tag totals and engine log entries', () => {
  render(<Results scenario={scenario} />);
  const team = teamDetails(t('team.a'));
  const hits = within(team.getByRole('table', { name: t('results.hits') }));
  expect(hits.getAllByRole('columnheader')).toHaveLength(19);
  expect(hits.getByRole('columnheader', { name: t('results.finalDmgMultiplier') })).toBeTruthy();
  expect(hits.getByRole('columnheader', { name: t('results.trueDmgMultiplier') })).toBeTruthy();
  expect(hits.getAllByRole('cell').slice(6, 18).map((cell) => cell.textContent)).toEqual([
    '3900', '2.0500', '1.6000', '1.0000', '0.4762', '0.8000', '1.0000', '1.0000', '0.9000', '1.0000', '1.0000', '4386',
  ]);
  const summary = hits.getByText(t('results.resolvedStats'));
  fireEvent.click(summary);
  const details = summary.closest('details')!;
  expect(details.open).toBe(true);
  expect(details.querySelectorAll('dt')).toHaveLength(19);
  expect(within(details).getByText('70%')).toBeTruthy();
  const byTag = within(team.getByRole('table', { name: t('results.byTag') }));
  expect(byTag.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['4386', '4386']);
  expect(team.getByText(t('results.multiTagNote'))).toBeTruthy();
  const byAttacker = within(team.getByRole('table', { name: t('results.byAttacker') }));
  expect(byAttacker.getByRole('rowheader', { name: 'Test attacker' })).toBeTruthy();
  expect(byAttacker.getByRole('cell', { name: '4386' })).toBeTruthy();
  const log = within(team.getByRole('table', { name: t('results.eventLog') }));
  expect(log.getByText('enemy:test-timer')).toBeTruthy();
  expect(log.getByText(t('results.skippedReason').replace('{number}', '3'))).toBeTruthy();
});

it('reports engine errors for one team while keeping the other team result visible', () => {
  const invalid = { ...scenario, teams: [scenario.teams[0], {
    ...scenario.teams[1], events: [{ kind: 'extra', id: 'test-extra', actorId: 'dps', steps: [
      { op: 'hit', hit: { ...hit, targetId: 'missing' } },
    ] }],
  }] } satisfies Scenario;
  render(<Results scenario={invalid} />);
  expect(teamDetails(t('team.b')).getByRole('alert').textContent).toContain(t('issue.enemyTarget').replace('{value}', 'missing'));
  expect(teamDetails(t('team.a')).getByRole('table', { name: t('results.hits') })).toBeTruthy();
  expect(screen.queryByRole('table', { name: t('results.comparison') })).toBeNull();
});

it.each(['allAllies', 'allEnemies', '__proto__'])('shows the engine issue for reserved unit ID %s', (id) => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: t('enemy.add') }));
  fireEvent.change(screen.getByLabelText(t('enemy.id')), { target: { value: id } });
  fireEvent.click(screen.getByRole('button', { name: t('results.calculate') }));
  expect(teamDetails(t('team.a')).getByRole('alert').textContent).toContain(
    `enemies[0]：${t('issue.reservedUnitId').replace('{value}', id)}`,
  );
});
