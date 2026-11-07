import { DAMAGE_TAGS, ELEMENTS, STAT_KEYS, type ModifierCondition, type StatKey, type StatModifier } from '../../engine/index';
import { t } from '../i18n';
import { NumberField } from './NumberField';

interface ModifierListProps {
  modifiers: readonly StatModifier[];
  onChange: (modifiers: readonly StatModifier[]) => void;
}

function isPercent(stat: StatKey): boolean {
  return !stat.endsWith('Flat');
}

function selectedValues<T extends string>(select: HTMLSelectElement, options: readonly T[]): T[] {
  const selected = new Set(Array.from(select.options, (option) => option.selected ? option.value : undefined));
  return options.filter((value) => selected.has(value));
}

export function ModifierList({ modifiers, onChange }: ModifierListProps) {
  return (
    <>
      {modifiers.map((modifier, index) => {
        const update = (value: StatModifier) => onChange(modifiers.with(index, value));
        const { condition, ...unconditional } = modifier;
        const updateCondition = <K extends 'elements' | 'damageTags',>(
          key: K,
          values: NonNullable<ModifierCondition[K]>,
        ) => {
          const next = { ...condition };
          if (values.length) next[key] = values;
          else delete next[key];
          update(next.elements || next.damageTags || next.counterpartIds
            ? { ...unconditional, condition: next }
            : unconditional);
        };
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
            <details>
              <summary>{t('modifier.condition')}</summary>
              <p>{t('modifier.conditionHint')}</p>
              <label>
                {t('modifier.elements')}
                <select
                  multiple
                  value={condition?.elements ?? []}
                  onChange={({ currentTarget }) => updateCondition('elements', selectedValues(currentTarget, ELEMENTS))}
                >
                  {ELEMENTS.map((element) => (
                    <option key={element} value={element}>{t(`element.${element}`)}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('modifier.tags')}
                <select
                  multiple
                  value={condition?.damageTags ?? []}
                  onChange={({ currentTarget }) => updateCondition('damageTags', selectedValues(currentTarget, DAMAGE_TAGS))}
                >
                  {DAMAGE_TAGS.map((tag) => <option key={tag} value={tag}>{t(`tag.${tag}`)}</option>)}
                </select>
              </label>
            </details>
            <button type="button" onClick={() => onChange(modifiers.toSpliced(index, 1))}>
              {t('modifier.remove')}
            </button>
          </fieldset>
        );
      })}
      <button type="button" onClick={() => onChange([...modifiers, { stat: 'atkPct', value: 0 }])}>
        {t('modifier.add')}
      </button>
    </>
  );
}
