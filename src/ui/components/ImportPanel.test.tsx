// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createInitialState, resolveUnitStats } from '../../engine/index';
import { archiveFixture, FAKE_UID } from '../../import/__tests__/fixtures';
import App from '../App';
import { formatNumber, t } from '../i18n';
import { importScenario } from '../state/scenario-json';
import { SCENARIO_STORAGE_KEY } from '../state/scenario-storage';

vi.mock('../../data', async (original) => {
  const data = await original<typeof import('../../data')>();
  const { IMPORT_TABLES } = await import('../../import/__tests__/tables');
  return {
    ...data,
    DATA_TABLES: {
      ...IMPORT_TABLES,
      characters: [...IMPORT_TABLES.characters, ...data.DATA_TABLES.characters],
    },
  };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function select(json: unknown) {
  const file = Object.assign(new File([], 'test.json'), { text: async () => JSON.stringify(json) });
  fireEvent.change(screen.getByLabelText(t('import.file')), { target: { files: [file] } });
}

it('imports the synthetic I3 character with the hand-computed stats and persists only the resulting build', async () => {
  render(<App />);
  select(archiveFixture());
  const entry = within(await screen.findByRole('group', { name: 'Test Character' }));
  expect(entry.getByText(t('import.report.breakLevelMultiplier').replace('{level}', '80'))).toBeTruthy();
  expect(entry.getByText(t('import.report.kit'))).toBeTruthy();
  expect(entry.getByText('Test Set × 2')).toBeTruthy();
  expect(localStorage.getItem(SCENARIO_STORAGE_KEY)).not.toContain('Test Character');
  const addName = t('import.add').replace('{team}', t('team.b'));
  fireEvent.click(entry.getByRole('button', { name: addName }));
  const team = within(screen.getByRole('region', { name: t('team.b') }));
  const stats = within(team.getByRole('group', { name: t('character.finalStats') }));
  // I3: (455 + 440) × (1 + 0.10 + 0.04) + 38.1 = 1058.4
  expect(stats.getByText(t('stat.atk')).nextElementSibling?.textContent).toBe(formatNumber(1058.4));
  const saved = localStorage.getItem(SCENARIO_STORAGE_KEY)!;
  expect(saved).not.toContain(String(FAKE_UID));
  expect(saved).not.toMatch(/Spare Cone|Spare Set|materials|relic_1/);
  const result = importScenario(saved);
  if (!result.ok) throw new Error('Expected saved scenario');
  const build = result.scenario.teams[1].team[0]!;
  const final = resolveUnitStats(createInitialState([build], []), build.id);
  expect(final.hp).toBeCloseTo(1945, 9);
  expect(final.atk).toBeCloseTo(1058.4, 9);
  expect(final.def).toBeCloseTo(865, 9);
  expect(final.spd).toBeCloseTo(106.6, 9);
  expect(final.critRate).toBeCloseTo(0.1148, 9);
  expect(final.critDmg).toBeCloseTo(0.89, 9);
});

it('disambiguates the March 7th variants and uses sourced names for Trailblazer, light cones and sets', async () => {
  // TEST FIXTURE — NOT GAME DATA. The IDs select the repository's sourced labels.
  const archive = archiveFixture();
  const character = (archive.characters as readonly object[])[0];
  const cone = (archive.light_cones as readonly object[])[0];
  const relic = (archive.relics as readonly object[])[0];
  render(<App />);
  select({
    ...archive,
    characters: ['1001', '1224', '8001'].map((id) => ({ ...character, id, level: 79 })),
    light_cones: [{ ...cone, id: '20003', location: '1001' }],
    relics: [{ ...relic, set_id: '102', location: '1001' }],
  });
  const march = within(await screen.findByRole('group', { name: '三月七（存護）' }));
  expect(march.getByText('琥珀（疊影 3）')).toBeTruthy();
  expect(march.getByText('野穗伴行的快槍手 × 1')).toBeTruthy();
  expect(march.getByText(t('import.report.tableMiss.breakLevelMultiplier'))).toBeTruthy();
  expect(screen.getByRole('group', { name: '三月七（巡獵）' })).toBeTruthy();
  expect(screen.getByRole('group', { name: '開拓者（毀滅）' })).toBeTruthy();
});

it('shows a zh-HK error for an unsupported archive version', async () => {
  render(<App />);
  select({ ...archiveFixture(), version: 999 });
  const error = await screen.findByRole('alert');
  expect(error.textContent).toContain(t('import.error.version').replace('{versions}', '4'));
  expect(screen.queryByRole('button', { name: t('import.add').replace('{team}', t('team.a')) })).toBeNull();
});

it('pairs each summary label with its value and collapses the long report lists', async () => {
  render(<App />);
  select(archiveFixture());
  const entry = within(await screen.findByRole('group', { name: 'Test Character' }));
  // Regression: unwrapped dt/dd items were laid out as separate grid cells, so labels drifted away from values.
  for (const label of ['character.level', 'term.eidolon', 'term.lightCone', 'term.relics'] as const) {
    const term = entry.getByText(t(label));
    expect(term.parentElement?.tagName).toBe('DIV');
    expect(term.nextElementSibling?.tagName).toBe('DD');
  }
  const toEnter = entry.getByText(t('import.report.kit')).closest('details');
  expect(toEnter?.open).toBe(false);
});
