// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ENEMY_TABLES, endgameStages } from '../../data';
import App from '../App';
import { t } from '../i18n';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const waveTitle = (n: number) => t('endgame.wave').replace('{number}', String(n));

it('lists the newest rotation per mode and switches modes', () => {
  render(<App />);
  const shared = within(screen.getByRole('region', { name: t('enemy.shared') }));
  const stage = shared.getByLabelText(t('endgame.stage')) as HTMLSelectElement;
  expect(stage.value).toBe(endgameStages(ENEMY_TABLES, 'memory')[0]!.id);
  fireEvent.change(shared.getByLabelText(t('endgame.mode')), { target: { value: 'boss' } });
  expect(stage.value).toBe(endgameStages(ENEMY_TABLES, 'boss')[0]!.id);
  expect(shared.getByRole('region', { name: waveTitle(1) })).toBeTruthy();
});

it('applies a wave into the shared enemies with its SPD, and adds single enemies', () => {
  render(<App />);
  const shared = within(screen.getByRole('region', { name: t('enemy.shared') }));
  fireEvent.change(shared.getByLabelText(t('endgame.stage')), { target: { value: '30126121' } });
  const wave2 = within(shared.getByRole('region', { name: waveTitle(2) }));
  expect(wave2.getByRole('rowheader', { name: '步離戰首•呼雷' })).toBeTruthy();
  fireEvent.click(wave2.getByRole('button', { name: t('endgame.applyWave').replace('{number}', '2') }));

  const editor = within(shared.getByRole('group', { name: '步離戰首•呼雷' }));
  expect((editor.getByLabelText(t('enemy.id')) as HTMLInputElement).value).toBe('enemy-1');
  expect((editor.getByLabelText(t('character.level')) as HTMLInputElement).value).toBe('95');
  expect((editor.getByLabelText(t('enemy.spd')) as HTMLInputElement).value).toBe('264');
  expect((editor.getByLabelText(t('enemy.maxToughness')) as HTMLInputElement).value).toBe('240');
  expect((editor.getByLabelText(t('enemy.baseDef')) as HTMLInputElement).value).toBe('');

  fireEvent.click(wave2.getByRole('button', { name: t('endgame.addNamed').replace('{name}', '步離戰首•呼雷') }));
  const ids = shared.getAllByLabelText(t('enemy.id')).map((input) => (input as HTMLInputElement).value);
  expect(ids).toEqual(['enemy-1', 'enemy-2']);
});
