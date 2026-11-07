import type { ActionStep, CharacterBuild, CritMode, EnemyConfig, RotationEvent } from '../../engine/index';
import type { Scenario, TeamDraft, TeamIndex } from './scenario';

type ListEdit<T> =
  | { type: 'add'; value: T }
  | { type: 'update'; index: number; value: T }
  | { type: 'remove'; index: number }
  | { type: 'reorder'; index: number; toIndex: number };

export type ScenarioAction =
  | { type: 'editEnemies'; edit: ListEdit<EnemyConfig> }
  | { type: 'setCritMode'; critMode: CritMode }
  | ({ teamIndex: TeamIndex } & (
    | { type: 'editCharacters'; edit: ListEdit<CharacterBuild> }
    | { type: 'editEvents'; edit: ListEdit<RotationEvent> }
    | { type: 'editSteps'; eventIndex: number; edit: ListEdit<ActionStep> }
    | { type: 'setCycles'; cycles: number | undefined }
  ));

function hasIndex(items: readonly unknown[], index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < items.length;
}

function editList<T>(items: readonly T[], edit: ListEdit<T>): readonly T[] {
  if (edit.type === 'add') return [...items, edit.value];
  if (!hasIndex(items, edit.index)) return items;
  switch (edit.type) {
    case 'update': return items.with(edit.index, edit.value);
    case 'remove': return items.toSpliced(edit.index, 1);
    case 'reorder': {
      if (edit.index === edit.toIndex || !hasIndex(items, edit.toIndex)) return items;
      return items.toSpliced(edit.index, 1).toSpliced(edit.toIndex, 0, items[edit.index]!);
    }
  }
}

export function scenarioReducer(scenario: Scenario, action: ScenarioAction): Scenario {
  if (action.type === 'setCritMode') return { ...scenario, critMode: action.critMode };
  if (action.type === 'editEnemies') {
    const enemies = editList(scenario.enemies, action.edit);
    return enemies === scenario.enemies ? scenario : { ...scenario, enemies };
  }

  const draft = scenario.teams[action.teamIndex];
  let updated: TeamDraft;
  switch (action.type) {
    case 'editCharacters': {
      const team = editList(draft.team, action.edit);
      if (team === draft.team) return scenario;
      updated = { ...draft, team };
      break;
    }
    case 'editEvents': {
      const events = editList(draft.events, action.edit);
      if (events === draft.events) return scenario;
      updated = { ...draft, events };
      break;
    }
    case 'editSteps': {
      const event = draft.events[action.eventIndex];
      if (!event) return scenario;
      const steps = editList(event.steps, action.edit);
      if (steps === event.steps) return scenario;
      updated = { ...draft, events: draft.events.with(action.eventIndex, { ...event, steps }) };
      break;
    }
    case 'setCycles': {
      const { cycles, ...rest } = draft;
      if (cycles === action.cycles) return scenario;
      updated = action.cycles === undefined ? rest : { ...rest, cycles: action.cycles };
      break;
    }
  }

  const [a, b] = scenario.teams;
  return { ...scenario, teams: action.teamIndex === 0 ? [updated, b] : [a, updated] };
}
