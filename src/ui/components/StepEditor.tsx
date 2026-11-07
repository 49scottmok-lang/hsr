import type { ActionStep, EffectDef } from '../../engine/index';
import { t } from '../i18n';
import { BreakEditor } from './BreakEditor';
import { EidolonRequirement } from './EidolonRequirement';
import { HitEditor } from './HitEditor';
import { NumberField } from './NumberField';
import { UnitSelect, type UnitOption } from './UnitSelect';

interface StepEditorProps {
  step: ActionStep;
  units: readonly UnitOption[];
  allies: readonly UnitOption[];
  enemies: readonly UnitOption[];
  effects: readonly EffectDef[];
  onChange: (step: ActionStep) => void;
}

export function StepEditor({ step, units, allies, enemies, effects, onChange }: StepEditorProps) {
  return (
    <>
      {step.op === 'hit' && <HitEditor hit={step.hit} enemies={enemies} onChange={(hit) => onChange({ ...step, hit })} />}
      {step.op === 'break' && (
        <BreakEditor hit={step.hit} allies={allies} enemies={enemies} onChange={(hit) => onChange({ ...step, hit })} />
      )}
      {step.op === 'apply' && (
        <>
          <label>
            {t('rotation.applyEffect')}
            <select value={step.effect.id} onChange={({ currentTarget }) => {
              const effect = effects.find(({ id }) => id === currentTarget.value);
              if (effect) onChange({ ...step, effect });
            }}>
              {!effects.some(({ id }) => id === step.effect.id) && (
                <option value={step.effect.id}>{step.effect.name || step.effect.id}</option>
              )}
              {effects.map(({ id, name }) => <option key={id} value={id}>{name || id}</option>)}
            </select>
          </label>
          <UnitSelect label={t('rotation.target')} value={step.to} units={units} groups
            onChange={(to) => onChange({ ...step, to })} />
          <NumberField
            label={t('rotation.stacks')}
            value={step.stacks}
            min={1}
            integer
            onChange={(stacks) => onChange({ ...step, stacks })}
          />
        </>
      )}
      {step.op === 'remove' && (
        <>
          <label>
            {t('effect.id')}
            <input value={step.effectId} onChange={({ currentTarget }) => onChange({ ...step, effectId: currentTarget.value })} />
          </label>
          <UnitSelect label={t('rotation.target')} value={step.from} units={units} groups
            onChange={(from) => onChange({ ...step, from })} />
        </>
      )}
      {step.op === 'setBroken' && (
        <>
          <UnitSelect label={t('rotation.target')} value={step.enemyId} units={enemies}
            onChange={(enemyId) => onChange({ ...step, enemyId })} />
          <label>
            <input
              type="checkbox"
              checked={step.broken}
              onChange={({ currentTarget }) => onChange({ ...step, broken: currentTarget.checked })}
            />
            {t('rotation.broken')}
          </label>
        </>
      )}
      <EidolonRequirement value={step.requires} onChange={(requires) => onChange({ ...step, requires })} />
    </>
  );
}
