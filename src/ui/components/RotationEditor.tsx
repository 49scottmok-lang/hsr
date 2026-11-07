import type { ActionStep, EnemyConfig, RotationEvent } from '../../engine/index';
import { formatNumber, t } from '../i18n';
import type { ScenarioAction } from '../state/reducer';
import type { TeamDraft, TeamIndex } from '../state/scenario';
import { NumberField } from './NumberField';
import { StepEditor } from './StepEditor';
import { UnitSelect } from './UnitSelect';

interface RotationEditorProps {
  draft: TeamDraft;
  enemies: readonly EnemyConfig[];
  teamIndex: TeamIndex;
  dispatch: (action: ScenarioAction) => void;
}

interface OrderButtonsProps {
  index: number;
  length: number;
  onMove: (toIndex: number) => void;
  onRemove: () => void;
}

function OrderButtons({ index, length, onMove, onRemove }: OrderButtonsProps) {
  return (
    <>
      <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)}>{t('rotation.moveUp')}</button>
      <button type="button" disabled={index === length - 1} onClick={() => onMove(index + 1)}>{t('rotation.moveDown')}</button>
      <button type="button" onClick={onRemove}>{t('rotation.remove')}</button>
    </>
  );
}

const stepOps = ['hit', 'apply', 'remove', 'setBroken'] as const;

export function RotationEditor({ draft, enemies, teamIndex, dispatch }: RotationEditorProps) {
  const { team, events, cycles, effectLibrary = [] } = draft;
  const units = [...team, ...enemies];
  const editEvent = (edit: Extract<ScenarioAction, { type: 'editEvents' }>['edit']) =>
    dispatch({ type: 'editEvents', teamIndex, edit });
  const editStep = (eventIndex: number, edit: Extract<ScenarioAction, { type: 'editSteps' }>['edit']) =>
    dispatch({ type: 'editSteps', teamIndex, eventIndex, edit });

  function addEvent(event: Omit<RotationEvent, 'id'>) {
    const ids = new Set(events.map(({ id }) => id));
    let number = 1;
    while (ids.has(`event-${number}`)) number++;
    editEvent({ type: 'add', value: { ...event, id: `event-${number}` } });
  }

  function addStep(eventIndex: number, op: ActionStep['op']) {
    const enemyId = enemies[0]?.id ?? '';
    const allyId = team[0]?.id ?? '';
    let value: ActionStep;
    switch (op) {
      case 'hit':
        value = { op, hit: { targetId: enemyId, scaling: 'atk', multiplier: 0, tags: ['basic'] } };
        break;
      case 'apply': {
        const effect = effectLibrary[0];
        if (!effect) return;
        value = { op, effect, to: effect.kind === 'buff' ? allyId : enemyId };
        break;
      }
      case 'remove':
        value = { op, effectId: effectLibrary[0]?.id ?? '', from: allyId };
        break;
      case 'setBroken':
        value = { op, enemyId, broken: true };
        break;
    }
    editStep(eventIndex, { type: 'add', value });
  }

  return (
    <fieldset>
      <legend>{t('rotation.title')}</legend>
      <NumberField
        label={t('rotation.cycles')}
        value={cycles}
        min={0}
        onChange={(value) => dispatch({ type: 'setCycles', teamIndex, cycles: value })}
      />
      <ol>
        {events.map((event, index) => (
          <li key={event.id}>
            <fieldset>
              <legend>{t('rotation.eventNumber').replace('{number}', formatNumber(index + 1))}</legend>
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
              <ol>
                {event.steps.map((step, stepIndex) => (
                  <li key={stepIndex}>
                    <fieldset>
                      <legend>{t(`rotation.step.${step.op}`)}</legend>
                      <StepEditor step={step} units={units} enemies={enemies} effects={effectLibrary}
                        onChange={(value) => editStep(index, { type: 'update', index: stepIndex, value })} />
                      <OrderButtons index={stepIndex} length={event.steps.length}
                        onMove={(toIndex) => editStep(index, { type: 'reorder', index: stepIndex, toIndex })}
                        onRemove={() => editStep(index, { type: 'remove', index: stepIndex })} />
                    </fieldset>
                  </li>
                ))}
              </ol>
              {stepOps.map((op) => (
                <button type="button" key={op} disabled={op === 'apply' && effectLibrary.length === 0}
                  onClick={() => addStep(index, op)}>{t(`rotation.add.${op}`)}</button>
              ))}
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
