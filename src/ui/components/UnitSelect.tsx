import { t } from '../i18n';

export interface UnitOption {
  id: string;
  name: string;
}

interface UnitSelectProps {
  label: string;
  value: string;
  units: readonly UnitOption[];
  onChange: (id: string) => void;
  groups?: boolean;
}

export function UnitSelect({ label, value, units, onChange, groups }: UnitSelectProps) {
  const isGroup = groups && (value === 'allAllies' || value === 'allEnemies');
  return (
    <label>
      {label}
      <select value={value} onChange={({ currentTarget }) => onChange(currentTarget.value)}>
        {!isGroup && !units.some(({ id }) => id === value) && (
          <option value={value}>{value || t('rotation.selectUnit')}</option>
        )}
        {groups && (
          <>
            <option value="allAllies">{t('rotation.allAllies')}</option>
            <option value="allEnemies">{t('rotation.allEnemies')}</option>
          </>
        )}
        {units.map(({ id, name }, index) => (
          <option key={index} value={id}>{name || id}</option>
        ))}
      </select>
    </label>
  );
}
