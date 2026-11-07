// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import App from './App';
import { t } from './i18n';
import type { Scenario } from './state/scenario';

// TEST FIXTURE — NOT GAME DATA
const draft: Scenario = {
  critMode: 'expected',
  enemies: [{ id: 'target', name: 'Test target', level: 0, res: {} }],
  teams: [{
    label: 'Test Team A',
    team: [{ id: 'attacker', name: 'Test attacker', level: 1, element: 'ice', base: { hp: 10, atk: 10, def: 10, spd: 10 } }],
    events: [{ id: 'event', actorId: 'attacker', kind: 'turn', steps: [
      { op: 'hit', hit: { targetId: 'target', multiplier: 1, scaling: 'atk', tags: ['basic'] } },
      { op: 'hit', hit: { targetId: 'missing', multiplier: 1, scaling: 'atk', tags: ['basic'] } },
    ] }],
  }, { label: 'Test Team B', team: [], events: [] }],
};

afterEach(cleanup);

it('loads a draft with issues and displays them on the matching step and shared enemy rows', async () => {
  render(<App />);
  const file = Object.assign(new File([], 'test.json'), { text: async () => JSON.stringify(draft) });
  fireEvent.change(screen.getByLabelText(t('scenario.import')), { target: { files: [file] } });
  const team = within(await screen.findByRole('region', { name: 'Test Team A' }));
  const [first, second] = team.getAllByRole('group', { name: t('rotation.step.hit') });
  const targetIssue = t('issue.enemyTarget').replace('{value}', 'missing');
  expect(within(first!).queryByText(targetIssue)).toBeNull();
  expect(within(second!).getByText(targetIssue)).toBeTruthy();
  const enemy = within(screen.getByRole('group', { name: 'Test target' }));
  expect(enemy.getByText(t('issue.level'))).toBeTruthy();
  expect(team.queryByText(t('issue.level'))).toBeNull();
  expect(within(screen.getByRole('region', { name: 'Test Team B' })).getByText(t('issue.teamSize'))).toBeTruthy();

  fireEvent.change(within(second!).getByLabelText(t('rotation.target')), { target: { value: 'target' } });
  expect(within(second!).queryByText(targetIssue)).toBeNull();
});
