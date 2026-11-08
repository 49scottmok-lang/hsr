import { useMemo, useRef, useState } from 'react';
import {
  createInitialState, EngineValidationError, resolveUnitStats, suggestTurnOrder, timelineToEvents,
  type CharacterBuild, type EnemyConfig, type RotationEvent, type TimelineAdjustment, type TimelineResult,
} from '../../engine/index';
import { formatNumber, t, translateIssue } from '../i18n';
import { NumberField } from './NumberField';
import { UnitSelect } from './UnitSelect';

interface TurnOrderPanelProps {
  team: readonly CharacterBuild[];
  enemies: readonly EnemyConfig[];
  onAppend: (events: readonly RotationEvent[]) => void;
}

interface AdjustmentDraft extends Omit<TimelineAdjustment, 'at'> {
  key: number;
  afterTurn: boolean;
  unitId: string;
  turn?: number;
}

interface Settings {
  enemySpeeds: ReadonlyMap<string, number | undefined>;
  avLimit?: number;
  firstCycle?: number;
  laterCycle?: number;
  adjustments: readonly AdjustmentDraft[];
}

export function TurnOrderPanel({ team, enemies, onAppend }: TurnOrderPanelProps) {
  const [settings, setSettings] = useState<Settings>({ enemySpeeds: new Map(), adjustments: [] });
  const [preview, setPreview] = useState<{
    team: typeof team;
    enemies: typeof enemies;
    result?: TimelineResult;
    issues?: readonly string[];
    appended?: number;
  }>();
  const nextAdjustmentKey = useRef(0);
  const allies = useMemo(() => {
    const state = createInitialState(team, enemies);
    return team.map(({ id, name }) => ({ id, name, side: 'ally' as const, spd: resolveUnitStats(state, id).spd }));
  }, [team, enemies]);
  const units = [...allies, ...enemies];
  const names = new Map(units.map(({ id, name }) => [id, name || id]));
  const current = preview?.team === team && preview.enemies === enemies ? preview : undefined;
  const { adjustments, avLimit, firstCycle, laterCycle, enemySpeeds } = settings;
  const showCycle = firstCycle !== undefined || laterCycle !== undefined;

  function edit(patch: Partial<Settings>) {
    setSettings({ ...settings, ...patch });
    setPreview(undefined);
  }

  function previewOrder() {
    try {
      const result = suggestTurnOrder({
        units: [...allies, ...enemies.map(({ id }) => ({ id, side: 'enemy' as const, spd: enemySpeeds.get(id) ?? NaN }))],
        avLimit: avLimit ?? NaN,
        cycleAv: showCycle ? { first: firstCycle ?? NaN, later: laterCycle ?? NaN } : undefined,
        adjustments: adjustments.map(({ afterTurn, unitId, turn, targetId, advance, spd }) => ({
          at: afterTurn ? { unitId, turn: turn ?? NaN } : 'start', targetId, advance, spd,
        })),
      });
      setPreview({ team, enemies, result });
    } catch (error) {
      if (!(error instanceof EngineValidationError)) throw error;
      const issues = error.issues.map((issue) => {
        const separator = issue.indexOf(': ');
        const path = issue.slice(0, separator);
        const unitIndex = /^units\[(\d+)\]$/.exec(path)?.[1];
        const unit = units[Number(unitIndex)];
        const adjustment = /^adjustments\[(\d+)\]$/.exec(path);
        const label = unit ? (unit.name || unit.id || t('rotation.actor'))
          : adjustment ? adjustmentLabel(Number(adjustment[1]))
          : path === 'avLimit' ? t('timeline.limit')
          : path === 'cycleAv.first' ? t('timeline.firstCycle')
          : path === 'cycleAv.later' ? t('timeline.laterCycle')
          : t('timeline.title');
        return `${label}：${translateIssue(issue.slice(separator + 2))}`;
      });
      setPreview({ team, enemies, issues });
    }
  }

  const adjustmentLabel = (index: number) => t('timeline.adjustment').replace('{number}', formatNumber(index + 1));
  const result = current?.result;

  return (
    <details className="turn-order">
      <summary>{t('timeline.title')}</summary>
      <p>{t('timeline.hint')}</p>
      <fieldset>
        <legend>{t('timeline.startingSpeeds')}</legend>
        {allies.length > 0 && <ul>{allies.map(({ id, spd }, index) => (
          <li key={index}>{t('timeline.allySpeed').replace('{name}', () => names.get(id) || id)
            .replace('{spd}', formatNumber(spd))}</li>
        ))}</ul>}
        <div className="turn-order-fields">
          {enemies.map(({ id, name }, index) => (
            <NumberField key={index} label={t('timeline.enemySpeed').replace('{name}', () => name || id)}
              value={enemySpeeds.get(id)}
              onChange={(value) => edit({ enemySpeeds: new Map(enemySpeeds).set(id, value) })} />
          ))}
        </div>
      </fieldset>
      <div className="turn-order-fields">
        <NumberField label={t('timeline.limit')} value={avLimit} onChange={(value) => edit({ avLimit: value })} />
        <NumberField label={t('timeline.firstCycle')} value={firstCycle} onChange={(value) => edit({ firstCycle: value })} />
        <NumberField label={t('timeline.laterCycle')} value={laterCycle} onChange={(value) => edit({ laterCycle: value })} />
      </div>
      {adjustments.map((adjustment, index) => {
        const update = (patch: Partial<AdjustmentDraft>) =>
          edit({ adjustments: adjustments.with(index, { ...adjustment, ...patch }) });
        return (
          <fieldset key={adjustment.key}>
            <legend>{adjustmentLabel(index)}</legend>
            <div className="turn-order-fields">
              <label>
                {t('timeline.trigger')}
                <select value={adjustment.afterTurn ? 'after' : 'start'}
                  onChange={({ currentTarget }) => update({ afterTurn: currentTarget.value === 'after' })}>
                  <option value="start">{t('timeline.atStart')}</option>
                  <option value="after">{t('timeline.afterTurn')}</option>
                </select>
              </label>
              {adjustment.afterTurn && <>
                <UnitSelect label={t('timeline.triggerUnit')} value={adjustment.unitId} units={units}
                  onChange={(unitId) => update({ unitId })} />
                <NumberField label={t('timeline.turnNumber')} value={adjustment.turn} onChange={(turn) => update({ turn })} />
              </>}
              <UnitSelect label={t('rotation.target')} value={adjustment.targetId} units={units}
                onChange={(targetId) => update({ targetId })} />
              <NumberField label={t('timeline.advance')} value={adjustment.advance} percent
                onChange={(advance) => update({ advance })} />
              <NumberField label={t('timeline.newSpeed')} value={adjustment.spd} onChange={(spd) => update({ spd })} />
            </div>
            <button type="button" onClick={() => edit({ adjustments: adjustments.toSpliced(index, 1) })}>
              {t('rotation.remove')}
            </button>
          </fieldset>
        );
      })}
      <button type="button" disabled={units.length === 0} onClick={() => {
        const id = units[0]?.id ?? '';
        edit({ adjustments: [...adjustments, { key: nextAdjustmentKey.current++, afterTurn: false, unitId: id, turn: 1, targetId: id }] });
      }}>{t('timeline.addAdjustment')}</button>
      <button type="button" onClick={previewOrder}>{t('timeline.preview')}</button>
      {current?.issues && <div role="alert"><ul>{current.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div>}
      {current?.appended !== undefined && (
        <p role="status">{t('timeline.appended').replace('{number}', formatNumber(current.appended))}</p>
      )}
      {result && <>
        {result.truncated && <p role="status">{t('timeline.truncated')}</p>}
        {result.unusedAdjustments.length > 0 && <p role="status">{t('timeline.unused').replace('{numbers}',
          () => new Intl.ListFormat('zh-HK').format(result.unusedAdjustments.map((index) => adjustmentLabel(index))))}</p>}
        {result.turns.length === 0 ? <p role="status">{t('timeline.noTurns')}</p> : <>
          <div className="turn-order-preview" tabIndex={0} role="region" aria-label={t('timeline.preview')}>
            <table>
              <caption>{t('timeline.preview')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('rotation.actor')}</th>
                  <th scope="col">{t('timeline.turnNumber')}</th>
                  <th scope="col">{t('timeline.elapsedAv')}</th>
                  {showCycle && <th scope="col">{t('timeline.cycle')}</th>}
                </tr>
              </thead>
              <tbody>{result.turns.map(({ unitId, turn, av, cycle }, index) => (
                <tr key={index}>
                  <th scope="row">{names.get(unitId) || unitId}</th>
                  <td>{formatNumber(turn)}</td>
                  <td>{formatNumber(av, { maximumFractionDigits: 2 })}</td>
                  {cycle !== undefined && <td>{formatNumber(cycle)}</td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <button type="button" onClick={() => {
            onAppend(timelineToEvents(result));
            setPreview({ team, enemies, appended: result.turns.length });
          }}>{t('timeline.append').replace('{number}', formatNumber(result.turns.length))}</button>
        </>}
      </>}
    </details>
  );
}
