import type { ActionStep, CharacterBuild, EffectDef, EnemyConfig } from '../../engine/index';
import { t } from '../i18n';
import type { ListEdit } from '../state/reducer';
import { IssueList } from './IssueList';
import { OrderButtons } from './OrderButtons';
import { StepEditor } from './StepEditor';

interface StepListProps {
  steps: readonly ActionStep[];
  team: readonly CharacterBuild[];
  enemies: readonly EnemyConfig[];
  effects: readonly EffectDef[];
  issuesAt?: (stepIndex: number) => readonly string[] | undefined;
  onEdit: (edit: ListEdit<ActionStep>) => void;
}

const stepOps = ['hit', 'break', 'apply', 'remove', 'setBroken'] as const;

/** The steps of one action, shared by the manual rotation and the auto battle kits. */
export function StepList({ steps, team, enemies, effects, issuesAt, onEdit }: StepListProps) {
  const units = [...team, ...enemies];

  function addStep(op: ActionStep['op']) {
    const enemyId = enemies[0]?.id ?? '';
    const allyId = team[0]?.id ?? '';
    let value: ActionStep;
    switch (op) {
      case 'hit':
        value = { op, hit: { targetId: enemyId, scaling: 'atk', multiplier: 0, tags: ['basic'] } };
        break;
      case 'apply': {
        const effect = effects[0];
        if (!effect) return;
        value = { op, effect, to: effect.kind === 'buff' ? allyId : enemyId };
        break;
      }
      case 'remove':
        value = { op, effectId: effects[0]?.id ?? '', from: allyId };
        break;
      case 'setBroken':
        value = { op, enemyId, broken: true };
        break;
      case 'break':
        value = { op, hit: { kind: 'break', targetId: enemyId } };
        break;
    }
    onEdit({ type: 'add', value });
  }

  return (
    <>
      <ol>
        {steps.map((step, index) => (
          <li key={index}>
            <fieldset>
              <legend>{t(`rotation.step.${step.op}`)}</legend>
              <IssueList issues={issuesAt?.(index)} />
              <StepEditor step={step} units={units} allies={team} enemies={enemies} effects={effects}
                onChange={(value) => onEdit({ type: 'update', index, value })} />
              <OrderButtons index={index} length={steps.length}
                onMove={(toIndex) => onEdit({ type: 'reorder', index, toIndex })}
                onRemove={() => onEdit({ type: 'remove', index })} />
            </fieldset>
          </li>
        ))}
      </ol>
      {stepOps.map((op) => (
        <button type="button" key={op} disabled={op === 'apply' && effects.length === 0}
          onClick={() => addStep(op)}>{t(`rotation.add.${op}`)}</button>
      ))}
    </>
  );
}
