import { createInitialState, ELEMENTS, resolveUnitStats, type CharacterBuild, type LightCone } from '../../engine/index';
import { formatNumber, formatPercent, t } from '../i18n';
import { suggestedBreakLevelMultiplier } from '../state/break-level';
import { IssueList } from './IssueList';
import { ModifierList } from './ModifierList';
import { NumberField } from './NumberField';

interface CharacterEditorProps {
  build: CharacterBuild;
  issues?: readonly string[];
  onChange: (build: CharacterBuild) => void;
  onRemove: () => void;
}

const equipmentStats = ['hp', 'atk', 'def'] as const;
const baseStats = [...equipmentStats, 'spd'] as const;
const percentStats = ['critRate', 'critDmg', 'dmgBoost', 'breakEffect', 'effectHitRate', 'effectRes', 'energyRegenRate'] as const;
const eidolons = [0, 1, 2, 3, 4, 5, 6];
const superimpositions = [1, 2, 3, 4, 5];

export function CharacterEditor({ build, issues, onChange, onRemove }: CharacterEditorProps) {
  const { lightCone, relics } = build;
  const updateCone = (value: LightCone | undefined) => onChange({ ...build, lightCone: value });
  // The preview needs no scenario enemy or hit context.
  const previewEnemy = { id: `${build.id}:preview`, name: '', level: 1, res: {} };
  const stats = resolveUnitStats(createInitialState([build], [previewEnemy]), build.id);
  const tableMultiplier = suggestedBreakLevelMultiplier(build.level);

  return (
    <fieldset>
      <legend>{build.name || t('character.title')}</legend>
      <IssueList issues={issues} />
      <label>
        {t('character.name')}
        <input value={build.name} onChange={({ currentTarget }) => onChange({ ...build, name: currentTarget.value })} />
      </label>
      <NumberField
        label={t('character.level')}
        value={build.level}
        min={1}
        integer
        onChange={(value) => {
          const level = value ?? 1;
          const current = build.breakLevelMultiplier;
          onChange({
            ...build, level,
            breakLevelMultiplier: current === undefined || current === tableMultiplier
              ? suggestedBreakLevelMultiplier(level) : current,
          });
        }}
      />
      <NumberField label={t('character.breakLevelMultiplier')} value={build.breakLevelMultiplier} min={0}
        onChange={(breakLevelMultiplier) => onChange({ ...build, breakLevelMultiplier })} />
      {build.breakLevelMultiplier === undefined && tableMultiplier !== undefined && (
        <button type="button" onClick={() => onChange({ ...build, breakLevelMultiplier: tableMultiplier })}>
          {t('character.useBreakTable').replace('{value}', formatNumber(tableMultiplier, { maximumFractionDigits: 8 }))}
        </button>
      )}
      <label>
        {t('character.element')}
        <select
          value={build.element}
          onChange={({ currentTarget }) => onChange({ ...build, element: currentTarget.value as CharacterBuild['element'] })}
        >
          {ELEMENTS.map((element) => <option key={element} value={element}>{t(`element.${element}`)}</option>)}
        </select>
      </label>
      <label>
        {t('term.eidolon')}
        <select
          value={build.eidolon ?? 0}
          onChange={({ currentTarget }) => onChange({ ...build, eidolon: Number(currentTarget.value) })}
        >
          {eidolons.map((level) => (
            <option key={level} value={level}>{t('character.eidolonRank').replace('{rank}', formatNumber(level))}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>{t('character.baseStats')}</legend>
        {baseStats.map((stat) => (
          <NumberField
            key={stat}
            label={t(`stat.${stat}`)}
            value={build.base[stat]}
            min={0}
            onChange={(value) => onChange({ ...build, base: { ...build.base, [stat]: value ?? 0 } })}
          />
        ))}
        <NumberField
          label={t('character.baseCritRate')}
          value={build.baseCritRate}
          percent
          onChange={(baseCritRate) => onChange({ ...build, baseCritRate })}
        />
        <NumberField
          label={t('character.baseCritDmg')}
          value={build.baseCritDmg}
          percent
          onChange={(baseCritDmg) => onChange({ ...build, baseCritDmg })}
        />
        <p>{t('character.baseCritHint')}</p>
      </fieldset>
      <fieldset>
        <legend>{t('term.lightCone')}</legend>
        <label>
          <input
            type="checkbox"
            checked={lightCone !== undefined}
            onChange={({ currentTarget }) => updateCone(currentTarget.checked
              ? { name: '', base: { hp: 0, atk: 0, def: 0 }, effects: [] }
              : undefined)}
          />
          {t('character.equipCone')}
        </label>
        {lightCone && (
          <>
            <label>
              {t('character.coneName')}
              <input
                value={lightCone.name}
                onChange={({ currentTarget }) => updateCone({ ...lightCone, name: currentTarget.value })}
              />
            </label>
            <label>
              {t('term.superimposition')}
              <select
                value={lightCone.superimposition ?? 1}
                onChange={({ currentTarget }) => updateCone({ ...lightCone, superimposition: Number(currentTarget.value) })}
              >
                {superimpositions.map((rank) => (
                  <option key={rank} value={rank}>{t('character.superimpositionRank').replace('{rank}', formatNumber(rank))}</option>
                ))}
              </select>
            </label>
            <p>{t('character.superimpositionHint')}</p>
            {equipmentStats.map((stat) => (
              <NumberField
                key={stat}
                label={t(`stat.${stat}`)}
                value={lightCone.base[stat]}
                min={0}
                onChange={(value) => updateCone({ ...lightCone, base: { ...lightCone.base, [stat]: value ?? 0 } })}
              />
            ))}
          </>
        )}
      </fieldset>
      <fieldset>
        <legend>{t('term.relics')}</legend>
        <ModifierList
          modifiers={relics?.stats ?? []}
          onChange={(stats) => onChange({ ...build, relics: { setEffects: [], ...relics, stats } })}
        />
      </fieldset>
      <fieldset>
        <legend>{t('character.finalStats')}</legend>
        <p>{t('character.finalStatsHint')}</p>
        <dl>
          {baseStats.map((stat) => (
            <div key={stat}>
              <dt>{t(`stat.${stat}`)}</dt>
              <dd>{formatNumber(stats[stat])}</dd>
            </div>
          ))}
          {percentStats.map((stat) => (
            <div key={stat}>
              <dt>{t(`stat.${stat}`)}</dt>
              <dd>{formatPercent(stats[stat], { maximumFractionDigits: 2 })}</dd>
            </div>
          ))}
        </dl>
      </fieldset>
      <button type="button" onClick={onRemove}>{t('character.remove')}</button>
    </fieldset>
  );
}
