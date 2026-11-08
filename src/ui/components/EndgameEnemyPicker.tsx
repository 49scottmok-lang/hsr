import { useState } from 'react';
import { ENDGAME_MODES, ENEMY_TABLES, endgameStages, stageEnemies, type EndgameMode, type StageEnemy } from '../../data';
import { ELEMENTS } from '../../engine/index';
import { formatNumber, formatPercent, t } from '../i18n';

interface EndgameEnemyPickerProps {
  /** Puts a wave's enemies into the shared list in order. */
  onApplyWave: (enemies: readonly StageEnemy[]) => void;
  onAdd: (enemy: StageEnemy) => void;
}

// `narrow` would run zh-HK items together ("物理火風"); `short` spaces them.
const list = new Intl.ListFormat('zh-HK', { style: 'short', type: 'unit' });

function resText(res: StageEnemy['enemy']['res']): string {
  return list.format(ELEMENTS.flatMap((element) => {
    const value = res[element];
    return value ? [`${t(`element.${element}`)} ${formatPercent(value)}`] : [];
  }));
}

/** Picks real endgame enemies from the sourced tables (TASKS D6/F15). */
export function EndgameEnemyPicker({ onApplyWave, onAdd }: EndgameEnemyPickerProps) {
  const [mode, setMode] = useState<EndgameMode>('memory');
  const stages = endgameStages(ENEMY_TABLES, mode);
  const [stageId, setStageId] = useState(stages[0]?.id ?? '');
  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  // A stage has a handful of enemies, so this is cheap enough to run every render.
  const result = stage ? stageEnemies(ENEMY_TABLES, stage.id) : undefined;
  const waves = result?.ok ? result.value : [];

  const stageLabel = (s: (typeof stages)[number]) => t('endgame.stageOption')
    .replace('{group}', () => s.groupName)
    .replace('{date}', s.startDate)
    .replace('{floor}', formatNumber(s.floor))
    .replace('{node}', formatNumber(s.node));

  return (
    <details className="endgame-picker">
      <summary>{t('endgame.title')}</summary>
      <p>{t('endgame.hint')}</p>
      <div className="turn-order-fields">
        <label>
          {t('endgame.mode')}
          <select value={mode} onChange={({ currentTarget }) => {
            const next = currentTarget.value as EndgameMode;
            setMode(next);
            setStageId(endgameStages(ENEMY_TABLES, next)[0]?.id ?? '');
          }}>
            {ENDGAME_MODES.map((m) => <option key={m} value={m}>{t(`endgame.mode.${m}`)}</option>)}
          </select>
        </label>
        <label>
          {t('endgame.stage')}
          <select value={stage?.id ?? ''} onChange={({ currentTarget }) => setStageId(currentTarget.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{stageLabel(s)}</option>)}
          </select>
        </label>
      </div>
      {waves.map((wave, w) => {
        const title = t('endgame.wave').replace('{number}', formatNumber(w + 1));
        return (
          <div key={`${stage?.id}-${w}`} className="turn-order-preview" role="region" aria-label={title} tabIndex={0}>
            <table>
              <caption>{title}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('enemy.name')}</th>
                  <th scope="col">{t('endgame.rank')}</th>
                  <th scope="col">{t('character.level')}</th>
                  <th scope="col">{t('endgame.hp')}</th>
                  <th scope="col">{t('endgame.spd')}</th>
                  <th scope="col">{t('endgame.toughness')}</th>
                  <th scope="col">{t('endgame.weaknesses')}</th>
                  <th scope="col">{t('enemy.res')}</th>
                  <th scope="col">{t('endgame.actions')}</th>
                </tr>
              </thead>
              <tbody>{wave.map((e) => (
                <tr key={e.slot}>
                  <th scope="row">{e.enemy.name}</th>
                  <td>{t(`endgame.rank.${e.enemy.rank}`)}</td>
                  <td>{formatNumber(e.level)}</td>
                  <td>{formatNumber(e.hp, { maximumFractionDigits: 0 })}</td>
                  <td>{formatNumber(e.spd, { maximumFractionDigits: 2 })}</td>
                  <td>{formatNumber(e.toughness, { maximumFractionDigits: 2 })}</td>
                  <td>{list.format(e.enemy.weaknesses.map((element) => t(`element.${element}`)))}</td>
                  <td>{resText(e.enemy.res)}</td>
                  <td>
                    <button type="button" onClick={() => onAdd(e)}
                      aria-label={t('endgame.addNamed').replace('{name}', () => e.enemy.name)}>
                      {t('endgame.add')}
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
            <button type="button" onClick={() => onApplyWave(wave)}>
              {t('endgame.applyWave').replace('{number}', formatNumber(w + 1))}
            </button>
          </div>
        );
      })}
    </details>
  );
}
