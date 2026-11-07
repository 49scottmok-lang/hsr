// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { EffectDef } from '../../engine/index';
import App from '../App';
import { t } from '../i18n';
import { EffectEditor } from './EffectEditor';

afterEach(cleanup);

it('edits a sourced, timed, eidolon-gated effect using the modifier list', () => {
  const change = vi.fn<(effect: EffectDef) => void>();
  function Editor() {
    // TEST FIXTURE — NOT GAME DATA
    const [effect, setEffect] = useState<EffectDef>({ id: 'test', name: '', kind: 'buff', modifiers: [] });
    return <EffectEditor
      effect={effect}
      units={[{ id: 'enemy', name: 'Test enemy' }]}
      reservedIds={new Set()}
      onRemove={() => {}}
      onChange={(value) => { setEffect(value); change(value); }}
    />;
  }
  render(<Editor />);
  const stacking = screen.getByLabelText<HTMLSelectElement>(t('effect.stacking'));
  expect(stacking.value).toBe('refresh');
  fireEvent.change(stacking, { target: { value: 'noRefresh' } });
  expect(screen.getByText(t('effect.stackingHint.noRefresh'))).toBeTruthy();
  fireEvent.change(stacking, { target: { value: 'independent' } });
  expect(screen.getByText(t('effect.stackingHint.independent'))).toBeTruthy();
  fireEvent.change(screen.getByLabelText(t('effect.id')), { target: { value: 'test-vuln' } });
  fireEvent.change(screen.getByLabelText(t('effect.name')), { target: { value: 'Test vulnerability' } });
  fireEvent.change(screen.getByLabelText(t('effect.kind')), { target: { value: 'debuff' } });
  fireEvent.change(screen.getByLabelText(t('effect.source')), { target: { value: 'Synthetic fixture' } });
  fireEvent.change(screen.getByLabelText(t('effect.maxStacks')), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText(t('effect.minEidolon')), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: t('effect.addModifier') }));
  fireEvent.change(screen.getByLabelText(t('modifier.stat')), { target: { value: 'vulnerability' } });
  fireEvent.change(screen.getByLabelText(t('modifier.percentValue')), { target: { value: '50' } });
  fireEvent.click(screen.getByLabelText(t('effect.enableDuration')));
  fireEvent.change(screen.getByLabelText(t('effect.turns')), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText(t('effect.tickUnit')), { target: { value: 'unit:enemy' } });
  fireEvent.change(screen.getByLabelText(t('effect.tickPhase')), { target: { value: 'turnStart' } });
  fireEvent.click(screen.getByLabelText(t('effect.tickOnApplyTurn')));
  expect(screen.getByText(t('effect.tickHint'))).toBeTruthy();
  expect(screen.getByRole('link', { name: t('effect.limitationsLink') }).getAttribute('href')).toContain('#:~:text=A2');
  expect(change.mock.lastCall?.[0]).toEqual({
    id: 'test-vuln', name: 'Test vulnerability', kind: 'debuff', maxStacks: 3, stacking: 'independent', requires: { minEidolon: 2 },
    source: 'Synthetic fixture', modifiers: [{ stat: 'vulnerability', value: 0.5 }],
    duration: { turns: 2, tickUnit: { unitId: 'enemy' }, tickPhase: 'turnStart', tickOnApplyTurn: true },
  });
  fireEvent.click(screen.getByLabelText(t('effect.enableDuration')));
  expect(change.mock.lastCall?.[0].duration).toBeUndefined();

  fireEvent.click(screen.getByRole('button', { name: t('conversion.add') }));
  const conversion = within(screen.getByRole('group', { name: t('conversion.title') }));
  fireEvent.change(conversion.getByLabelText(t('conversion.from')), { target: { value: 'breakEffect' } });
  fireEvent.change(conversion.getByLabelText(t('conversion.fromUnit')), { target: { value: 'source' } });
  fireEvent.change(conversion.getByLabelText(t('conversion.to')), { target: { value: 'critDmg' } });
  fireEvent.change(conversion.getByLabelText(t('conversion.ratio')), { target: { value: '25' } });
  fireEvent.change(conversion.getByLabelText(t('conversion.thresholdPercent')), { target: { value: '150' } });
  fireEvent.change(conversion.getByLabelText(t('conversion.capPercent')), { target: { value: '30' } });
  fireEvent.change(conversion.getByLabelText(t('modifier.elements')), { target: { value: 'ice' } });
  fireEvent.change(conversion.getByLabelText(t('modifier.tags')), { target: { value: 'dot' } });
  fireEvent.change(conversion.getByLabelText(t('conversion.counterparts')), { target: { value: 'enemy' } });
  expect(change.mock.lastCall?.[0].conversions).toEqual([{
    from: 'breakEffect', fromUnit: 'source', to: 'critDmg', ratio: 0.25, threshold: 1.5, cap: 0.3,
    condition: { elements: ['ice'], damageTags: ['dot'], counterpartIds: ['enemy'] },
  }]);
  fireEvent.change(conversion.getByLabelText(t('conversion.capPercent')), { target: { value: '' } });
  expect(change.mock.lastCall?.[0].conversions?.[0]?.cap).toBeUndefined();
  fireEvent.click(conversion.getByRole('button', { name: t('conversion.remove') }));
  expect(change.mock.lastCall?.[0].conversions).toEqual([]);
});

it('edits and removes effects in independent team libraries', () => {
  render(<App />);
  const a = within(screen.getByRole('region', { name: t('team.a') }));
  const b = within(screen.getByRole('region', { name: t('team.b') }));
  for (const team of [a, b]) fireEvent.click(team.getByRole('button', { name: t('effect.add') }));
  fireEvent.change(a.getByLabelText(t('effect.name')), { target: { value: 'Team A buff' } });
  expect(b.getByLabelText<HTMLInputElement>(t('effect.name')).value).toBe('');
  fireEvent.click(a.getByRole('button', { name: t('effect.remove') }));
  expect(a.queryByLabelText(t('effect.name'))).toBeNull();
  expect(b.getByLabelText(t('effect.name'))).toBeTruthy();
});
