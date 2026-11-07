import { ELEMENTS, type BreakHitSpec } from '../../engine/index';
import { t } from '../i18n';
import { NumberField } from './NumberField';
import { UnitSelect, type UnitOption } from './UnitSelect';

interface BreakEditorProps {
  hit: BreakHitSpec;
  allies: readonly UnitOption[];
  enemies: readonly UnitOption[];
  onChange: (hit: BreakHitSpec) => void;
}

export function BreakEditor({ hit, allies, enemies, onChange }: BreakEditorProps) {
  function changeKind(kind: string) {
    const { targetId, attackerId, element, label, multiplier } = hit;
    const common = { targetId, attackerId, element, label };
    onChange(kind === 'superBreak'
      ? { ...common, kind, multiplier: multiplier ?? 1, toughnessReduction: 0 }
      : { ...common, kind: 'break', multiplier });
  }

  return (
    <>
      <label>
        {t('rotation.breakKind')}
        <select value={hit.kind} onChange={({ currentTarget }) => changeKind(currentTarget.value)}>
          <option value="break">{t('rotation.breakKind.break')}</option>
          <option value="superBreak">{t('rotation.breakKind.superBreak')}</option>
        </select>
      </label>
      <UnitSelect label={t('rotation.target')} value={hit.targetId} units={enemies}
        onChange={(targetId) => onChange({ ...hit, targetId })} />
      <UnitSelect label={t('results.attacker')} value={hit.attackerId ?? ''} units={allies}
        emptyLabel={t('rotation.useActor')} onChange={(id) => onChange({ ...hit, attackerId: id || undefined })} />
      <label>
        {t('rotation.elementOverride')}
        <select value={hit.element ?? ''} onChange={({ currentTarget }) => onChange({
          ...hit, element: (currentTarget.value || undefined) as BreakHitSpec['element'],
        })}>
          <option value="">{t('rotation.attackerElement')}</option>
          {ELEMENTS.map((element) => <option key={element} value={element}>{t(`element.${element}`)}</option>)}
        </select>
      </label>
      <label>
        {t('rotation.hitLabel')}
        <input value={hit.label ?? ''} onChange={({ currentTarget }) => onChange({
          ...hit, label: currentTarget.value || undefined,
        })} />
      </label>
      <NumberField label={t('rotation.multiplier')} value={hit.multiplier ?? 1} min={0} percent
        onChange={(value) => onChange(hit.kind === 'break'
          ? { ...hit, multiplier: value } : { ...hit, multiplier: value ?? 1 })} />
      {hit.kind === 'superBreak' && (
        <>
          <NumberField label={t('rotation.toughnessReduction')} value={hit.toughnessReduction} min={0}
            onChange={(value) => onChange({ ...hit, toughnessReduction: value ?? 0 })} />
          <NumberField label={t('rotation.breakEfficiency')} value={hit.breakEfficiency} min={0} percent
            onChange={(breakEfficiency) => onChange({ ...hit, breakEfficiency })} />
          <NumberField label={t('rotation.fixedToughnessReduction')} value={hit.fixedToughnessReduction} min={0}
            onChange={(fixedToughnessReduction) => onChange({ ...hit, fixedToughnessReduction })} />
        </>
      )}
    </>
  );
}
