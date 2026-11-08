import type { EnemyConfig, RotationEvent } from '../../engine/index';
import { formatNumber, t } from '../i18n';
import type { ScenarioAction } from '../state/reducer';
import type { TeamDraft, TeamIndex } from '../state/scenario';
import { AutoBattlePanel } from './AutoBattlePanel';
import { IssueList } from './IssueList';
import { NumberField } from './NumberField';
import { OrderButtons } from './OrderButtons';
import { StepList } from './StepList';
import { TurnOrderPanel } from './TurnOrderPanel';
import { UnitSelect } from './UnitSelect';

interface RotationEditorProps {
  draft: TeamDraft;
  enemies: readonly EnemyConfig[];
  teamIndex: TeamIndex;
  issues?: ReadonlyMap<string, readonly string[]>;
  dispatch: (action: ScenarioAction) => void;
}

export function RotationEditor({ draft, enemies, teamIndex, issues, dispatch }: RotationEditorProps) {
  const { team, events, cycles, effectLibrary = [] } = draft;
  const units = [...team, ...enemies];
  const editEvent = (edit: Extract<ScenarioAction, { type: 'editEvents' }>['edit']) =>
    dispatch({ type: 'editEvents', teamIndex, edit });
  const editStep = (eventIndex: number, edit: Extract<ScenarioAction, { type: 'editSteps' }>['edit']) =>
    dispatch({ type: 'editSteps', teamIndex, eventIndex, edit });

  function addEvent(event: Omit<RotationEvent, 'id'>) {
    dispatch({ type: 'appendEvents', teamIndex, events: [event] });
  }

  return (
    <fieldset>
      <legend>{t('rotation.title')}</legend>
      <AutoBattlePanel draft={draft} enemies={enemies} teamIndex={teamIndex} dispatch={dispatch} />
      <TurnOrderPanel team={team} enemies={enemies}
        onAppend={(events) => dispatch({ type: 'appendEvents', teamIndex, events })} />
      <IssueList issues={issues?.get(`teams[${teamIndex}].cycles`)} />
      <NumberField
        label={t('rotation.cycles')}
        value={cycles}
        min={0}
        onChange={(value) => dispatch({ type: 'setCycles', teamIndex, cycles: value })}
      />
      <ol>
        {events.map((event, index) => (
          <li key={index}>
            <fieldset>
              <legend>{t('rotation.eventNumber').replace('{number}', formatNumber(index + 1))}</legend>
              <IssueList issues={issues?.get(`teams[${teamIndex}].events[${index}]`)} />
              <label>
                {t('rotation.eventKind')}
                <select value={event.kind} onChange={({ currentTarget }) => editEvent({
                  type: 'update', index, value: { ...event, kind: currentTarget.value as RotationEvent['kind'] },
                })}>
                  <option value="turn">{t('rotation.turn')}</option>
                  <option value="extra">{t('rotation.extra')}</option>
                </select>
              </label>
              <UnitSelect label={t('rotation.actor')} value={event.actorId} units={units}
                onChange={(actorId) => editEvent({ type: 'update', index, value: { ...event, actorId } })} />
              <label>
                {t('rotation.eventLabel')}
                <input value={event.label ?? ''} onChange={({ currentTarget }) => editEvent({
                  type: 'update', index, value: { ...event, label: currentTarget.value || undefined },
                })} />
              </label>
              <OrderButtons index={index} length={events.length}
                onMove={(toIndex) => editEvent({ type: 'reorder', index, toIndex })}
                onRemove={() => editEvent({ type: 'remove', index })} />
              <button type="button" onClick={() => addEvent(event)}>{t('rotation.duplicate')}</button>
              <StepList steps={event.steps} team={team} enemies={enemies} effects={effectLibrary}
                issuesAt={(stepIndex) => issues?.get(`teams[${teamIndex}].events[${index}].steps[${stepIndex}]`)}
                onEdit={(edit) => editStep(index, edit)} />
            </fieldset>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => addEvent({ kind: 'turn', actorId: units[0]?.id ?? '', steps: [] })}>
        {t('rotation.addTurn')}
      </button>
      <button type="button" onClick={() => addEvent({ kind: 'extra', actorId: units[0]?.id ?? '', steps: [] })}>
        {t('rotation.addExtra')}
      </button>
    </fieldset>
  );
}
