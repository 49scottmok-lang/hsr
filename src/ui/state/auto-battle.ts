import { characterEnergyCost, DATA_TABLES, kitTemplate, SKILL_TABLES, type KitTemplate, type Lookup } from '../../data';
import type { ActionStep, AutoBattleInput, AutoKit, CharacterBuild, EnemyConfig } from '../../engine/index';
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

/** Skill levels and main target for filling a kit from the sourced skill table. */
export interface KitPrefill {
  readonly basic?: number;
  readonly skill?: number;
  readonly ultimate?: number;
  /** Empty means the first enemy. */
  readonly targetId?: string;
}

export interface AutoKitDraft {
  readonly unitId: string;
  readonly prefill?: KitPrefill;
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
 * A new kit for a team member. The Ultimate's Energy cost comes from the
 * sourced tables (`SPNeed`); a cost of 0 means the Ultimate does not use
 * Energy, which the auto battle cannot play, so it is left for the user.
 * When the build carries skill levels (account import), the actions the
 * skill table supports are filled in too (`kitTemplate`).
 */
export function newKit(build: CharacterBuild, enemies: readonly EnemyConfig[] = []): AutoKitDraft {
  const characterId = buildCharacterId(build);
  const cost = characterId === undefined ? undefined : characterEnergyCost(DATA_TABLES, characterId);
  const levels = build.skillLevels;
  const kit: AutoKitDraft = {
    unitId: build.id,
    ...(levels ? { prefill: { basic: levels.basic, skill: levels.skill, ultimate: levels.ultimate } } : {}),
    basic: { steps: [] },
    skill: { steps: [] },
    ultimate: { steps: [], ...(cost !== undefined && cost > 0 ? { energyCost: cost } : {}) },
    useSkill: true,
    // Without a sourced cost (unknown, or 0 = not Energy-based) the auto battle cannot cast it.
    useUltimate: cost !== undefined && cost > 0,
  };
  const template = levels ? kitTemplateFor(build, enemies, kit.prefill ?? {}) : undefined;
  return template?.ok ? applyKitTemplate(kit, template.value) : kit;
}

/**
 * The sourced template for a build, or `undefined` when the build has no
 * game character ID. Missing levels reach the lookup as NaN and come back as gaps.
 */
export function kitTemplateFor(
  build: CharacterBuild,
  enemies: readonly EnemyConfig[],
  prefill: KitPrefill,
): Lookup<KitTemplate> | undefined {
  const characterId = buildCharacterId(build);
  if (characterId === undefined) return undefined;
  // A removed target falls back to the first enemy, like an empty choice.
  const chosen = enemies.find(({ id }) => id === prefill.targetId);
  const targetId = (chosen ?? enemies[0])?.id;
  if (targetId === undefined) return { ok: false, reason: 'no enemies' };
  return kitTemplate(SKILL_TABLES, {
    characterId,
    tree: build.skillLevels?.tree ?? 'base',
    eidolon: build.eidolon ?? 0,
    levels: { basic: value(prefill.basic), skill: value(prefill.skill), ultimate: value(prefill.ultimate) },
    targetId,
    enemyIds: enemies.map(({ id }) => id),
  });
}

/** Replaces the steps, Energy and skill points of every action the template has; the rest stay. */
export function applyKitTemplate(kit: AutoKitDraft, template: KitTemplate): AutoKitDraft {
  const { basic, skill, ultimate } = template.actions;
  return {
    ...kit,
    ...(basic ? { basic: { steps: basic.steps, energy: basic.energy, skillPoints: basic.skillPoints } } : {}),
    ...(skill ? { skill: { steps: skill.steps, energy: skill.energy, skillPoints: skill.skillPoints } } : {}),
    ...(ultimate ? { ultimate: { ...kit.ultimate, steps: ultimate.steps, energy: ultimate.energy } } : {}),
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
      // An Ultimate that is never cast needs no cost or Energy.
      ...(kit.useUltimate ? {
        ultimate: {
          steps: kit.ultimate.steps, energy: value(kit.ultimate.energy), energyCost: value(kit.ultimate.energyCost), label: label('ultimate'),
        },
      } : {}),
      useSkill: kit.useSkill,
      useUltimate: kit.useUltimate,
      ...(kit.skillPointReserve !== undefined ? { skillPointReserve: kit.skillPointReserve } : {}),
    })),
  };
}
