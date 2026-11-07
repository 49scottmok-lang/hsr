import { CONVERSION_SOURCES, STAT_KEYS, type StatConversion } from '../../engine/index';
import { t } from '../i18n';
import { ModifierConditionEditor } from './ModifierConditionEditor';
import { NumberField } from './NumberField';
import type { UnitOption } from './UnitSelect';

interface ConversionListProps {
  conversions: readonly StatConversion[];
  units: readonly UnitOption[];
  onChange: (conversions: readonly StatConversion[]) => void;
}

export function ConversionList({ conversions, units, onChange }: ConversionListProps) {
  return (
    <fieldset>
      <legend>{t('conversion.title')}</legend>
      {conversions.map((conversion, index) => {
        const update = (fields: Partial<StatConversion>) => onChange(conversions.with(index, { ...conversion, ...fields }));
        const thresholdPercent = !['hp', 'atk', 'def', 'spd'].includes(conversion.from);
        const capPercent = !conversion.to.endsWith('Flat');
        return (
          <fieldset key={index}>
            <label>
              {t('conversion.from')}
              <select value={conversion.from} onChange={({ currentTarget }) => update({
                from: currentTarget.value as StatConversion['from'],
              })}>
                {CONVERSION_SOURCES.map((stat) => <option key={stat} value={stat}>{t(`stat.${stat}`)}</option>)}
              </select>
            </label>
            <label>
              {t('conversion.fromUnit')}
              <select value={conversion.fromUnit ?? 'holder'} onChange={({ currentTarget }) => update({
                fromUnit: currentTarget.value as StatConversion['fromUnit'],
              })}>
                <option value="holder">{t('effect.holder')}</option>
                <option value="source">{t('effect.sourceUnit')}</option>
              </select>
            </label>
            <label>
              {t('conversion.to')}
              <select value={conversion.to} onChange={({ currentTarget }) => update({
                to: currentTarget.value as StatConversion['to'],
              })}>
                {STAT_KEYS.map((stat) => <option key={stat} value={stat}>{t(`stat.${stat}`)}</option>)}
              </select>
            </label>
            <NumberField label={t('conversion.ratio')} value={conversion.ratio} percent
              onChange={(ratio) => update({ ratio: ratio ?? 0 })} />
            <NumberField key={`threshold-${thresholdPercent}`}
              label={t(thresholdPercent ? 'conversion.thresholdPercent' : 'conversion.threshold')}
              value={conversion.threshold} percent={thresholdPercent} onChange={(threshold) => update({ threshold })} />
            <NumberField key={`cap-${capPercent}`}
              label={t(capPercent ? 'conversion.capPercent' : 'conversion.cap')}
              value={conversion.cap} percent={capPercent} onChange={(cap) => update({ cap })} />
            <ModifierConditionEditor condition={conversion.condition} units={units}
              onChange={(condition) => update({ condition })} />
            <button type="button" onClick={() => onChange(conversions.toSpliced(index, 1))}>{t('conversion.remove')}</button>
          </fieldset>
        );
      })}
      <button type="button" onClick={() => onChange([...conversions, { from: 'hp', to: 'atkFlat', ratio: 0 }])}>
        {t('conversion.add')}
      </button>
    </fieldset>
  );
}
