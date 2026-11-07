import { ELEMENTS, type EnemyConfig, type Element } from '../../engine/index';
import { t } from '../i18n';
import { NumberField } from './NumberField';

interface EnemyEditorProps {
  enemy: EnemyConfig;
  onChange: (enemy: EnemyConfig) => void;
  onRemove: () => void;
}

export function EnemyEditor({ enemy, onChange, onRemove }: EnemyEditorProps) {
  function updateResistance(element: Element, value: number | undefined) {
    const res = { ...enemy.res };
    if (value === undefined) delete res[element];
    else res[element] = value;
    onChange({ ...enemy, res });
  }

  return (
    <fieldset>
      <legend>{enemy.name || enemy.id || t('enemy.title')}</legend>
      <label>
        {t('enemy.id')}
        <input value={enemy.id} onChange={({ currentTarget }) => onChange({ ...enemy, id: currentTarget.value })} />
      </label>
      <label>
        {t('enemy.name')}
        <input value={enemy.name} onChange={({ currentTarget }) => onChange({ ...enemy, name: currentTarget.value })} />
      </label>
      <NumberField
        label={t('character.level')}
        value={enemy.level}
        min={1}
        integer
        onChange={(level) => onChange({ ...enemy, level: level ?? 1 })}
      />
      <NumberField
        label={t('enemy.baseDef')}
        value={enemy.baseDef}
        min={0}
        onChange={(baseDef) => onChange({ ...enemy, baseDef })}
      />
      {enemy.baseDef === undefined && <p>{t('enemy.baseDefHint')}</p>}
      <fieldset>
        <legend>{t('enemy.res')}</legend>
        <p>{t('enemy.resHint')}</p>
        {ELEMENTS.map((element) => (
          <NumberField
            key={element}
            label={t('enemy.resElement').replace('{element}', t(`element.${element}`))}
            value={enemy.res[element]}
            percent
            onChange={(value) => updateResistance(element, value)}
          />
        ))}
      </fieldset>
      <label>
        <input
          type="checkbox"
          checked={enemy.broken ?? false}
          onChange={({ currentTarget }) => onChange({ ...enemy, broken: currentTarget.checked })}
        />
        {t('enemy.initialBroken')}
      </label>
      <button type="button" onClick={onRemove}>{t('enemy.remove')}</button>
    </fieldset>
  );
}
