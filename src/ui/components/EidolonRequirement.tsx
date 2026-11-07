import type { Requirement } from '../../engine/index';
import { formatNumber, t } from '../i18n';

const ranks = [0, 1, 2, 3, 4, 5, 6];

interface EidolonRequirementProps {
  value: Requirement | undefined;
  onChange: (value: Requirement | undefined) => void;
}

export function EidolonRequirement({ value, onChange }: EidolonRequirementProps) {
  return (
    <label>
      {t('effect.minEidolon')}
      <select
        value={value?.minEidolon ?? ''}
        onChange={({ currentTarget }) => onChange(currentTarget.value === ''
          ? undefined : { minEidolon: Number(currentTarget.value) })}
      >
        <option value="">{t('effect.noRequirement')}</option>
        {ranks.map((rank) => (
          <option key={rank} value={rank}>{t('character.eidolonRank').replace('{rank}', formatNumber(rank))}</option>
        ))}
      </select>
    </label>
  );
}
