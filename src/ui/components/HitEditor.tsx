import { ELEMENTS, HIT_DAMAGE_TAGS, type HitSpec } from '../../engine/index';
import { t } from '../i18n';
import { NumberField } from './NumberField';
import { UnitSelect, type UnitOption } from './UnitSelect';

interface HitEditorProps {
  hit: HitSpec;
  enemies: readonly UnitOption[];
  onChange: (hit: HitSpec) => void;
}

const scalingStats = ['atk', 'hp', 'def'] as const;

export function HitEditor({ hit, enemies, onChange }: HitEditorProps) {
  return (
    <>
      <UnitSelect
        label={t('rotation.target')}
        value={hit.targetId}
        units={enemies}
        onChange={(targetId) => onChange({ ...hit, targetId })}
      />
      <label>
        {t('rotation.scaling')}
        <select value={hit.scaling} onChange={({ currentTarget }) => onChange({
          ...hit, scaling: currentTarget.value as HitSpec['scaling'],
        })}>
          {scalingStats.map((stat) => <option key={stat} value={stat}>{t(`stat.${stat}`)}</option>)}
        </select>
      </label>
      <NumberField
        label={t('rotation.multiplier')}
        value={hit.multiplier}
        min={0}
        percent
        onChange={(multiplier) => onChange({ ...hit, multiplier: multiplier ?? 0 })}
      />
      <label>
        {t('rotation.elementOverride')}
        <select value={hit.element ?? ''} onChange={({ currentTarget }) => onChange({
          ...hit, element: (currentTarget.value || undefined) as HitSpec['element'],
        })}>
          <option value="">{t('rotation.attackerElement')}</option>
          {ELEMENTS.map((element) => <option key={element} value={element}>{t(`element.${element}`)}</option>)}
        </select>
      </label>
      <label>
        {t('modifier.tags')}
        <select multiple value={hit.tags} onChange={({ currentTarget }) => {
          const selected = new Set(Array.from(currentTarget.selectedOptions, ({ value }) => value));
          const { baseChance, ...unweighted } = hit;
          const tags = HIT_DAMAGE_TAGS.filter((tag) => selected.has(tag));
          onChange(tags.includes('dot') && baseChance !== undefined
            ? { ...unweighted, tags, baseChance }
            : { ...unweighted, tags });
        }}>
          {HIT_DAMAGE_TAGS.map((tag) => <option key={tag} value={tag}>{t(`tag.${tag}`)}</option>)}
        </select>
      </label>
      {hit.tags.includes('dot') && (
        <>
          <NumberField label={t('rotation.baseChance')} value={hit.baseChance} min={0} percent
            onChange={(baseChance) => onChange({ ...hit, baseChance })} />
          <p>{t('rotation.baseChanceHint')}</p>
        </>
      )}
      <label>
        {t('rotation.canCrit')}
        <select value={hit.canCrit === undefined ? '' : String(hit.canCrit)} onChange={({ currentTarget }) => onChange({
          ...hit, canCrit: currentTarget.value === '' ? undefined : currentTarget.value === 'true',
        })}>
          <option value="">{t('rotation.autoCrit')}</option>
          <option value="true">{t('rotation.allowCrit')}</option>
          <option value="false">{t('rotation.disallowCrit')}</option>
        </select>
      </label>
      <label>
        {t('rotation.hitLabel')}
        <input value={hit.label ?? ''} onChange={({ currentTarget }) => onChange({
          ...hit, label: currentTarget.value || undefined,
        })} />
      </label>
    </>
  );
}
