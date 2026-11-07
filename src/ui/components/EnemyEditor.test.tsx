// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { EnemyConfig } from '../../engine/index';
import App from '../App';
import { t } from '../i18n';
import { EnemyEditor } from './EnemyEditor';

afterEach(cleanup);

it('keeps DEF optional and stores signed elemental RES as a fraction', () => {
  const change = vi.fn<(enemy: EnemyConfig) => void>();
  function Editor() {
    // TEST FIXTURE — NOT GAME DATA
    const [enemy, setEnemy] = useState<EnemyConfig>({ id: 'test', name: '', level: 1, res: {} });
    return <EnemyEditor enemy={enemy} onRemove={() => {}} onChange={(value) => {
      setEnemy(value);
      change(value);
    }} />;
  }
  render(<Editor />);
  const baseDef = screen.getByLabelText(t('enemy.baseDef'));
  const fireRes = screen.getByLabelText(t('enemy.resElement').replace('{element}', t('element.fire')));
  expect(screen.getByText(t('enemy.baseDefHint'))).toBeTruthy();
  const toughness = screen.getByLabelText(t('enemy.maxToughness'));
  fireEvent.change(toughness, { target: { value: '40.5' } });
  expect(change.mock.lastCall?.[0].maxToughness).toBe(40.5);
  fireEvent.change(toughness, { target: { value: '' } });
  expect(change.mock.lastCall?.[0].maxToughness).toBeUndefined();
  fireEvent.change(baseDef, { target: { value: '0' } });
  expect(change.mock.lastCall?.[0].baseDef).toBe(0);
  expect(screen.queryByText(t('enemy.baseDefHint'))).toBeNull();
  fireEvent.change(fireRes, { target: { value: '-12.5' } });
  expect(change.mock.lastCall?.[0].res).toEqual({ fire: -0.125 });
  fireEvent.change(baseDef, { target: { value: '' } });
  fireEvent.change(fireRes, { target: { value: '' } });
  fireEvent.click(screen.getByLabelText(t('enemy.initialBroken')));
  expect(change.mock.lastCall?.[0]).toMatchObject({ baseDef: undefined, res: {}, broken: true });
  expect(screen.getByText(t('enemy.baseDefHint'))).toBeTruthy();
});

it('adds, edits and removes enemies in the shared section', () => {
  render(<App />);
  const shared = within(screen.getByRole('region', { name: t('enemy.shared') }));
  fireEvent.click(shared.getByRole('button', { name: t('enemy.add') }));
  fireEvent.change(shared.getByLabelText(t('enemy.id')), { target: { value: 'test-enemy' } });
  fireEvent.change(shared.getByLabelText(t('enemy.name')), { target: { value: 'Test enemy' } });
  expect(shared.getByRole('group', { name: 'Test enemy' })).toBeTruthy();
  fireEvent.click(shared.getByRole('button', { name: t('enemy.remove') }));
  expect(shared.queryByLabelText(t('enemy.id'))).toBeNull();
});
