// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createInitialState, resolveUnitStats, type CharacterBuild } from '../../engine/index';
import App from '../App';
import { formatNumber, t } from '../i18n';
import { CharacterEditor } from './CharacterEditor';

// TEST FIXTURE — NOT GAME DATA
const fixture: CharacterBuild = {
  id: 'test-character',
  name: 'Test character',
  level: 10,
  element: 'fire',
  base: { hp: 200, atk: 100, def: 50, spd: 10 },
  lightCone: { name: 'Test cone', base: { hp: 50, atk: 40, def: 10 }, effects: [] },
};

function renderEditor(initial: CharacterBuild = fixture) {
  const change = vi.fn<(build: CharacterBuild) => void>();
  function Editor() {
    const [build, setBuild] = useState(initial);
    return <CharacterEditor build={build} onRemove={() => {}} onChange={(value) => {
      change(value);
      setBuild(value);
    }} />;
  }
  render(<Editor />);
  return () => change.mock.lastCall![0];
}

function displayedAttack(): string | null | undefined {
  const preview = within(screen.getByRole('group', { name: t('character.finalStats') }));
  return preview.getByText(t('stat.atk'), { selector: 'dt' }).nextElementSibling?.textContent;
}

afterEach(cleanup);

it('stores 50% as 0.5 and shows the engine final ATK', () => {
  const updatedBuild = renderEditor();
  fireEvent.click(screen.getByRole('button', { name: t('modifier.add') }));
  fireEvent.change(screen.getByLabelText(t('modifier.percentValue')), { target: { value: '50' } });
  const build = updatedBuild();
  expect(build.relics?.stats).toEqual([{ stat: 'atkPct', value: 0.5 }]);

  const { atk } = resolveUnitStats(createInitialState([build], []), build.id);
  expect(atk).toBe((100 + 40) * 1.5);
  expect(displayedAttack()).toBe(formatNumber(atk));
});

it.each(['7', '56.5'])('displays %s exactly after a percentage field loses focus', (entered) => {
  const updatedBuild = renderEditor();
  fireEvent.click(screen.getByRole('button', { name: t('modifier.add') }));
  const input = screen.getByLabelText<HTMLInputElement>(t('modifier.percentValue'));
  fireEvent.change(input, { target: { value: entered } });
  fireEvent.blur(input);

  expect(input.value).toBe(entered);
  expect(updatedBuild().relics?.stats[0]?.value).toBe(Number(entered) / 100);
});

it('updates base stats and optional CRIT while storing superimposition as metadata', () => {
  const updatedBuild = renderEditor();
  fireEvent.change(screen.getByLabelText(t('term.eidolon')), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText(t('term.superimposition')), { target: { value: '5' } });
  expect(updatedBuild()).toMatchObject({ eidolon: 6, lightCone: { ...fixture.lightCone, superimposition: 5 } });
  expect(displayedAttack()).toBe('140');

  const base = within(screen.getByRole('group', { name: t('character.baseStats') }));
  fireEvent.change(base.getByLabelText(t('stat.atk')), { target: { value: '120' } });
  const crit = base.getByLabelText(t('character.baseCritRate'));
  fireEvent.change(crit, { target: { value: '12.5' } });
  expect(updatedBuild().baseCritRate).toBe(0.125);
  expect(displayedAttack()).toBe('160');
  fireEvent.change(crit, { target: { value: '' } });
  expect(updatedBuild().baseCritRate).toBeUndefined();

  const cone = within(screen.getByRole('group', { name: t('term.lightCone') }));
  fireEvent.change(cone.getByLabelText(t('stat.atk')), { target: { value: '60' } });
  expect(updatedBuild().lightCone?.base.atk).toBe(60);
  expect(displayedAttack()).toBe('180');
  fireEvent.click(cone.getByLabelText(t('character.equipCone')));
  expect(updatedBuild().lightCone).toBeUndefined();
  expect(displayedAttack()).toBe('120');
});

it('stores flat modifiers and excludes them from the preview when hit conditions are selected', () => {
  const updatedBuild = renderEditor();
  fireEvent.click(screen.getByRole('button', { name: t('modifier.add') }));
  fireEvent.change(screen.getByLabelText(t('modifier.stat')), { target: { value: 'atkFlat' } });
  fireEvent.change(screen.getByLabelText(t('modifier.value')), { target: { value: '20' } });
  expect(updatedBuild().relics?.stats).toEqual([{ stat: 'atkFlat', value: 20 }]);
  expect(displayedAttack()).toBe('160');

  fireEvent.click(screen.getByText(t('modifier.condition')));
  const elements = screen.getByLabelText<HTMLSelectElement>(t('modifier.elements'));
  for (const option of elements.options) option.selected = ['fire', 'ice'].includes(option.value);
  fireEvent.change(elements);
  const tags = screen.getByLabelText<HTMLSelectElement>(t('modifier.tags'));
  fireEvent.change(tags, { target: { value: 'skill' } });
  expect(updatedBuild().relics?.stats[0]?.condition).toEqual({ elements: ['fire', 'ice'], damageTags: ['skill'] });
  expect(displayedAttack()).toBe('140');

  for (const option of elements.options) option.selected = false;
  fireEvent.change(elements);
  expect(updatedBuild().relics?.stats[0]?.condition).toStrictEqual({ damageTags: ['skill'] });
  tags.selectedIndex = -1;
  fireEvent.change(tags);
  expect(updatedBuild().relics?.stats[0]).toStrictEqual({ stat: 'atkFlat', value: 20 });
  expect(displayedAttack()).toBe('160');
  fireEvent.click(screen.getByRole('button', { name: t('modifier.remove') }));
  expect(updatedBuild().relics?.stats).toEqual([]);
  expect(displayedAttack()).toBe('140');
});

it('adds, edits and removes characters independently in both teams', () => {
  render(<App />);
  const a = within(screen.getByRole('region', { name: t('team.a') }));
  const b = within(screen.getByRole('region', { name: t('team.b') }));
  fireEvent.click(a.getByRole('button', { name: t('character.add') }));
  fireEvent.click(b.getByRole('button', { name: t('character.add') }));
  fireEvent.change(a.getByLabelText(t('character.name')), { target: { value: 'Test A' } });
  expect(a.getByRole('group', { name: 'Test A' })).toBeTruthy();
  expect(b.getByRole('group', { name: t('character.title') })).toBeTruthy();
  fireEvent.click(a.getByRole('button', { name: t('character.remove') }));
  expect(a.queryByRole('group', { name: 'Test A' })).toBeNull();
  expect(b.getByRole('group', { name: t('character.title') })).toBeTruthy();
});
