import { characterEnergyCost, DATA_TABLES } from '../../data';
import type { ActionStep, AutoBattleInput, AutoKit, CharacterBuild } from '../../engine/index';
import { t } from '../i18n';
import { buildCharacterId } from './characters';
import type { Scenario, TeamIndex } from './scenario';

/**
 * Auto battle settings as the user typed them. Empty number fields stay
 * `undefined` here and reach the engine as NaN, so its validation names them.
 */
export interface KitActionDraft {
  readonly steps: readonly ActionStep[];
  readonly energy?: number;
  readonly skillPoints?: number;
}

export interface UltimateDraft {
  readonly steps: readonly ActionStep[];
  readonly energy?: number;
  readonly energyCost?: number;
}

export interface AutoKitDraft {
  readonly unitId: string;
  /** Empty means 0. */
  readonly startEnergy?: number;
  readonly basic: KitActionDraft;
  readonly skill: KitActionDraft;
  readonly ultimate: UltimateDraft;
  readonly useSkill: boolean;
  readonly skillPointReserve?: number;
  readonly useUltimate: boolean;
}

export interface AutoBattleDraft {
  readonly kits: readonly AutoKitDraft[];
  readonly avLimit?: number;
  readonly skillPointStart?: number;
  readonly skillPointMax?: number;
  readonly firstCycle?: number;
  readonly laterCycle?: number;
}

export const AUTO_KIT_ACTIONS = ['basic', 'skill', 'ultimate'] as const;
export type AutoKitActionName = (typeof AUTO_KIT_ACTIONS)[number];

/**
 * A new kit for a team member. Only the Ultimate's Energy cost comes from the
 * sourced tables (`SPNeed`); a cost of 0 means the Ultimate does not use
 * Energy, which the auto battle cannot play, so it is left for the user.
 */
export function newKit(build: CharacterBuild): AutoKitDraft {
  const characterId = buildCharacterId(build);
  const cost = characterId === undefined ? undefined : characterEnergyCost(DATA_TABLES, characterId);
  return {
    unitId: build.id,
    basic: { steps: [] },
    skill: { steps: [] },
    ultimate: { steps: [], ...(cost !== undefined && cost > 0 ? { energyCost: cost } : {}) },
    useSkill: true,
    useUltimate: true,
  };
}

const value = (number: number | undefined) => number ?? NaN;

/** The engine input for one team. Kits of removed members are skipped. */
export function toAutoBattleInput(scenario: Scenario, teamIndex: TeamIndex): AutoBattleInput {
  const { team, autoBattle } = scenario.teams[teamIndex];
  const members = new Set(team.map(({ id }) => id));
  const settings = autoBattle ?? { kits: [] };
  const { firstCycle, laterCycle } = settings;
  const label = (name: AutoKitActionName) => t(`auto.action.${name}`);
  return {
    team,
    enemies: scenario.enemies,
    avLimit: value(settings.avLimit),
    skillPoints: { start: value(settings.skillPointStart), max: value(settings.skillPointMax) },
    ...(firstCycle !== undefined || laterCycle !== undefined
      ? { cycleAv: { first: value(firstCycle), later: value(laterCycle) } }
      : {}),
    kits: settings.kits.filter(({ unitId }) => members.has(unitId)).map((kit): AutoKit => ({
      unitId: kit.unitId,
      startEnergy: kit.startEnergy ?? 0,
      basic: { steps: kit.basic.steps, energy: value(kit.basic.energy), skillPoints: value(kit.basic.skillPoints), label: label('basic') },
      skill: { steps: kit.skill.steps, energy: value(kit.skill.energy), skillPoints: value(kit.skill.skillPoints), label: label('skill') },
      ultimate: {
        steps: kit.ultimate.steps, energy: value(kit.ultimate.energy), energyCost: value(kit.ultimate.energyCost), label: label('ultimate'),
      },
      useSkill: kit.useSkill,
      useUltimate: kit.useUltimate,
      ...(kit.skillPointReserve !== undefined ? { skillPointReserve: kit.skillPointReserve } : {}),
    })),
  };
}
