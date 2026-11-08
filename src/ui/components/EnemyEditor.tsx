import { DOT_TYPES, ELEMENTS, type DotType, type EnemyConfig, type Element } from '../../engine/index';
import { t } from '../i18n';
import { IssueList } from './IssueList';
import { NumberField } from './NumberField';

interface EnemyEditorProps {
  enemy: EnemyConfig;
  issues?: readonly string[];
  onChange: (enemy: EnemyConfig) => void;
  onRemove: () => void;
}

export function EnemyEditor({ enemy, issues, onChange, onRemove }: EnemyEditorProps) {
  function updateResistance(element: Element, value: number | undefined) {
    const res = { ...enemy.res };
    if (value === undefined) delete res[element];
    else res[element] = value;
    onChange({ ...enemy, res });
  }

  function updateDebuffRes(type: DotType, value: number | undefined) {
    const debuffRes = { ...enemy.debuffRes };
    if (value === undefined) delete debuffRes[type];
    else debuffRes[type] = value;
    onChange({ ...enemy, debuffRes });
  }

  return (
    <fieldset>
      <legend>{enemy.name || enemy.id || t('enemy.title')}</legend>
      <IssueList issues={issues} />
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
      <NumberField label={t('enemy.maxToughness')} value={enemy.maxToughness} min={0}
        onChange={(maxToughness) => onChange({ ...enemy, maxToughness })} />
      <p>{t('enemy.toughnessHint')}</p>
      <NumberField label={t('enemy.spd')} value={enemy.spd} min={0}
        onChange={(spd) => onChange({ ...enemy, spd })} />
      <p>{t('enemy.spdHint')}</p>
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
      <NumberField label={t('enemy.effectRes')} value={enemy.effectRes} percent
        onChange={(effectRes) => onChange({ ...enemy, effectRes })} />
      <p>{t('enemy.effectResHint')}</p>
      <fieldset>
        <legend>{t('enemy.debuffRes')}</legend>
        <p>{t('enemy.debuffResHint')}</p>
        {DOT_TYPES.map((type) => (
          <NumberField key={type} label={t('enemy.debuffResType').replace('{type}', t(`dotType.${type}`))}
            value={enemy.debuffRes?.[type]} percent onChange={(value) => updateDebuffRes(type, value)} />
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
