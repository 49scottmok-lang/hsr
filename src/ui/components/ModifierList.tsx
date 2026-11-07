import { STAT_KEYS, type StatKey, type StatModifier } from '../../engine/index';
import { t, type TranslationKey } from '../i18n';
import { ModifierConditionEditor } from './ModifierConditionEditor';
import { NumberField } from './NumberField';

interface ModifierListProps {
  modifiers: readonly StatModifier[];
  onChange: (modifiers: readonly StatModifier[]) => void;
  addLabel?: TranslationKey;
}

function isPercent(stat: StatKey): boolean {
  return !stat.endsWith('Flat');
}

export function ModifierList({ modifiers, onChange, addLabel = 'modifier.add' }: ModifierListProps) {
  return (
    <>
      {modifiers.map((modifier, index) => {
        const update = (value: StatModifier) => onChange(modifiers.with(index, value));
        const { condition, ...unconditional } = modifier;
        const percent = isPercent(modifier.stat);
        return (
          <fieldset key={index}>
            <label>
              {t('modifier.stat')}
              <select
                value={modifier.stat}
                onChange={({ currentTarget }) => {
                  const stat = currentTarget.value as StatKey;
                  const value = percent === isPercent(stat) ? modifier.value
                    : percent ? modifier.value * 100 : modifier.value / 100;
                  update({ ...modifier, stat, value });
                }}
              >
                {STAT_KEYS.map((stat) => <option key={stat} value={stat}>{t(`stat.${stat}`)}</option>)}
              </select>
            </label>
            <NumberField
              key={modifier.stat}
              label={t(percent ? 'modifier.percentValue' : 'modifier.value')}
              value={modifier.value}
              percent={percent}
              onChange={(value) => update({ ...modifier, value: value ?? 0 })}
            />
            <ModifierConditionEditor condition={condition}
              onChange={(next) => update(next ? { ...unconditional, condition: next } : unconditional)} />
            <button type="button" onClick={() => onChange(modifiers.toSpliced(index, 1))}>
              {t('modifier.remove')}
            </button>
          </fieldset>
        );
      })}
      <button type="button" onClick={() => onChange([...modifiers, { stat: 'atkPct', value: 0 }])}>
        {t(addLabel)}
      </button>
    </>
  );
}
