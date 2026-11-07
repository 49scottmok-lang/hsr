import { DAMAGE_TAGS, ELEMENTS, type ModifierCondition } from '../../engine/index';
import { t } from '../i18n';
import type { UnitOption } from './UnitSelect';

interface ModifierConditionEditorProps {
  condition?: ModifierCondition;
  onChange: (condition: ModifierCondition | undefined) => void;
  units?: readonly UnitOption[];
}

function selectedValues<T extends string>(select: HTMLSelectElement, options: readonly T[]): T[] {
  const selected = new Set(Array.from(select.options, (option) => option.selected ? option.value : undefined));
  return options.filter((value) => selected.has(value));
}

export function ModifierConditionEditor({ condition, onChange, units }: ModifierConditionEditorProps) {
  function update<K extends keyof ModifierCondition>(key: K, values: NonNullable<ModifierCondition[K]>) {
    const next = { ...condition };
    if (values.length) next[key] = values;
    else delete next[key];
    onChange(next.elements || next.damageTags || next.counterpartIds ? next : undefined);
  }

  const counterparts = new Map(units?.map(({ id, name }) => [id, name || id]));
  for (const id of condition?.counterpartIds ?? []) {
    if (!counterparts.has(id)) counterparts.set(id, id);
  }

  return (
    <details>
      <summary>{t('modifier.condition')}</summary>
      <p>{t('modifier.conditionHint')}</p>
      <label>
        {t('modifier.elements')}
        <select multiple value={condition?.elements ?? []}
          onChange={({ currentTarget }) => update('elements', selectedValues(currentTarget, ELEMENTS))}>
          {ELEMENTS.map((element) => <option key={element} value={element}>{t(`element.${element}`)}</option>)}
        </select>
      </label>
      <label>
        {t('modifier.tags')}
        <select multiple value={condition?.damageTags ?? []}
          onChange={({ currentTarget }) => update('damageTags', selectedValues(currentTarget, DAMAGE_TAGS))}>
          {DAMAGE_TAGS.map((tag) => <option key={tag} value={tag}>{t(`tag.${tag}`)}</option>)}
        </select>
      </label>
      {units && (
        <label>
          {t('conversion.counterparts')}
          <select multiple value={condition?.counterpartIds ?? []}
            onChange={({ currentTarget }) => update('counterpartIds', selectedValues(currentTarget, [...counterparts.keys()]))}>
            {[...counterparts].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      )}
    </details>
  );
}
