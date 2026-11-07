import type {
  CharacterBuild,
  CritMode,
  EffectDef,
  EnemyConfig,
  RotationEvent,
  RotationInput,
} from '../../engine/index';

export type TeamIndex = 0 | 1;

export interface TeamDraft {
  label: string;
  team: readonly CharacterBuild[];
  events: readonly RotationEvent[];
  effectLibrary?: readonly EffectDef[];
  cycles?: number;
}

export interface Scenario {
  enemies: readonly EnemyConfig[];
  critMode: CritMode;
  teams: readonly [TeamDraft, TeamDraft];
}

export function toRotationInput(scenario: Scenario, teamIndex: TeamIndex): RotationInput {
  const { team, events, cycles } = scenario.teams[teamIndex];
  return { team, events, cycles, enemies: scenario.enemies, critMode: scenario.critMode };
}
