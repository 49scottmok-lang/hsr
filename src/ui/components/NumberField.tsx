import { useState } from 'react';
import { formatNumber } from '../i18n';

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  integer?: boolean;
  percent?: boolean;
}

export function NumberField({ label, value, onChange, min, integer, percent }: NumberFieldProps) {
  // Keep partially entered numbers and trailing decimal places while typing.
  const [draft, setDraft] = useState<string>();
  const display = value === undefined ? '' : percent
    ? formatNumber(value * 100, { useGrouping: false, maximumSignificantDigits: 15 })
    : value;
  return (
    <label>
      {label}
      <input
        type="number"
        step={integer ? 1 : 'any'}
        min={min}
        value={draft ?? display}
        onChange={({ currentTarget }) => {
          setDraft(currentTarget.value);
          if (currentTarget.validity.badInput) return;
          if (currentTarget.value === '') onChange(undefined);
          else if (currentTarget.validity.valid) {
            onChange(percent ? currentTarget.valueAsNumber / 100 : currentTarget.valueAsNumber);
          }
        }}
        onBlur={() => setDraft(undefined)}
      />
    </label>
  );
}
