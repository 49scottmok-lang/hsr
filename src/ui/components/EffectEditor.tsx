import limitationsUrl from '../../../docs/KNOWN_LIMITATIONS.md?url&no-inline';
import type { DurationSpec, EffectDef } from '../../engine/index';
import { t } from '../i18n';
import { EidolonRequirement } from './EidolonRequirement';
import { ModifierList } from './ModifierList';
import { NumberField } from './NumberField';

interface EffectEditorProps {
  effect: EffectDef;
  units: readonly { id: string; name: string }[];
  reservedIds: ReadonlySet<string>;
  onChange: (effect: EffectDef) => void;
  onRemove: () => void;
}

export function EffectEditor({ effect, units, reservedIds, onChange, onRemove }: EffectEditorProps) {
  const { duration } = effect;
  const tickId = typeof duration?.tickUnit === 'object' ? duration.tickUnit.unitId : undefined;
  const tickValue = typeof duration?.tickUnit === 'object' ? `unit:${duration.tickUnit.unitId}` : duration?.tickUnit;
  const updateDuration = (duration: DurationSpec | undefined) => onChange({ ...effect, duration });

  return (
    <fieldset>
      <legend>{effect.name || effect.id}</legend>
      <label>
        {t('effect.id')}
        <input
          value={effect.id}
          title={t('effect.idHint')}
          onChange={({ currentTarget }) => {
            const id = currentTarget.value;
            if (id.trim() && !reservedIds.has(id)) onChange({ ...effect, id });
          }}
        />
      </label>
      <label>
        {t('effect.name')}
        <input value={effect.name} onChange={({ currentTarget }) => onChange({ ...effect, name: currentTarget.value })} />
      </label>
      <label>
        {t('effect.kind')}
        <select
          value={effect.kind}
          onChange={({ currentTarget }) => onChange({ ...effect, kind: currentTarget.value as EffectDef['kind'] })}
        >
          <option value="buff">{t('effect.buff')}</option>
          <option value="debuff">{t('effect.debuff')}</option>
        </select>
      </label>
      <NumberField
        label={t('effect.maxStacks')}
        value={effect.maxStacks}
        min={1}
        integer
        onChange={(maxStacks) => onChange({ ...effect, maxStacks })}
      />
      <EidolonRequirement value={effect.requires} onChange={(requires) => onChange({ ...effect, requires })} />
      <label>
        {t('effect.source')}
        <input
          value={effect.source ?? ''}
          onChange={({ currentTarget }) => onChange({ ...effect, source: currentTarget.value || undefined })}
        />
      </label>
      <fieldset>
        <legend>{t('effect.modifiers')}</legend>
        <ModifierList
          modifiers={effect.modifiers}
          onChange={(modifiers) => onChange({ ...effect, modifiers })}
          addLabel="effect.addModifier"
        />
      </fieldset>
      <fieldset>
        <legend>{t('effect.duration')}</legend>
        <label>
          <input
            type="checkbox"
            checked={duration !== undefined}
            onChange={({ currentTarget }) => updateDuration(currentTarget.checked
              ? { turns: 1, tickUnit: 'holder', tickPhase: 'turnEnd' }
              : undefined)}
          />
          {t('effect.enableDuration')}
        </label>
        {duration && (
          <>
            <NumberField
              label={t('effect.turns')}
              value={duration.turns}
              min={1}
              integer
              onChange={(turns) => updateDuration({ ...duration, turns: turns ?? 1 })}
            />
            <label>
              {t('effect.tickUnit')}
              <select
                value={tickValue}
                onChange={({ currentTarget }) => {
                  const value = currentTarget.value;
                  updateDuration({ ...duration, tickUnit: value === 'holder' || value === 'source'
                    ? value : { unitId: value.slice('unit:'.length) } });
                }}
              >
                <option value="holder">{t('effect.holder')}</option>
                <option value="source">{t('effect.sourceUnit')}</option>
                {tickId !== undefined && !units.some(({ id }) => id === tickId) && (
                  <option value={tickValue}>{tickId}</option>
                )}
                {units.map(({ id, name }, index) => (
                  <option key={index} value={`unit:${id}`}>{name || id}</option>
                ))}
              </select>
            </label>
            <label>
              {t('effect.tickPhase')}
              <select
                value={duration.tickPhase}
                onChange={({ currentTarget }) => updateDuration({
                  ...duration, tickPhase: currentTarget.value as DurationSpec['tickPhase'],
                })}
              >
                <option value="turnStart">{t('effect.turnStart')}</option>
                <option value="turnEnd">{t('effect.turnEnd')}</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={duration.tickOnApplyTurn ?? false}
                onChange={({ currentTarget }) => updateDuration({ ...duration, tickOnApplyTurn: currentTarget.checked })}
              />
              {t('effect.tickOnApplyTurn')}
            </label>
            <p>{t('effect.tickHint')}</p>
            <a href={`${limitationsUrl}#:~:text=A2`}>{t('effect.limitationsLink')}</a>
          </>
        )}
      </fieldset>
      <button type="button" onClick={onRemove}>{t('effect.remove')}</button>
    </fieldset>
  );
}
