/**
 * Skill kit templates for the auto battle (added 2026-11-08): turns the
 * sourced Basic ATK / Skill / Ultimate records into `AutoAction` parts for a
 * character's skill levels and the chosen target. Anything the table cannot
 * supply is returned as a gap, never filled in. Rules:
 * docs/FORMULAS.md § Skill kit templates.
 */
import type { ActionStep, HitSpec } from '../engine';
import type { Lookup } from './lookup';
import type { DataSource, KitSlot, SkillKitRecord, SkillRecord, SkillTables, TraceTree } from './schema';
import { KIT_SLOTS } from './schema';

/** Skill-tree levels as the account export gives them (eidolon bonuses not included). */
export interface KitLevels {
  readonly basic: number;
  readonly skill: number;
  readonly ultimate: number;
}

export interface KitTemplateRequest {
  readonly characterId: string;
  /** Default `base`. */
  readonly tree?: TraceTree;
  /** 0–6; adds the eidolon skill level bonuses. Default 0. */
  readonly eidolon?: number;
  readonly levels: KitLevels;
  /** Main target of single-target and Blast hits. Must be in `enemyIds`. */
  readonly targetId: string;
  /** Enemies in line order: Blast hits the neighbours of `targetId`; AoE hits all. */
  readonly enemyIds: readonly string[];
}

export interface KitTemplateAction {
  readonly skillId: string;
  readonly name: string;
  /** Level after eidolon bonuses. */
  readonly level: number;
  readonly steps: readonly ActionStep[];
  readonly energy: number;
  /** Basic ATK: skill points generated. Skill: skill points spent. Ultimate: 0. */
  readonly skillPoints: number;
  /** The description has effects that are not included (buffs, debuffs, conditional bonuses). */
  readonly otherEffects: boolean;
}

export interface KitGap {
  readonly slot: KitSlot;
  readonly reason: 'noData' | 'unsupported' | 'level' | 'skillPoints';
  readonly detail: string;
}

export interface KitTemplate {
  readonly actions: Partial<Record<KitSlot, KitTemplateAction>>;
  readonly gaps: readonly KitGap[];
  readonly source: DataSource;
  readonly gameVersion: string;
}

export function skillKit(tables: SkillTables, characterId: string, tree: TraceTree = 'base'): SkillKitRecord | undefined {
  return tables.kits.find((k) => k.characterId === characterId && k.tree === tree);
}

/** Level after the bonuses of every eidolon up to `eidolon`. */
export function effectiveSkillLevel(kit: SkillKitRecord, slot: KitSlot, level: number, eidolon: number): number {
  return kit.eidolonLevels.reduce((sum, e) => (e.slot === slot && e.eidolon <= eidolon ? sum + e.add : sum), level);
}

function skillPointsFor(skill: SkillRecord): number | string {
  const { slot, skillPointGain: gain, skillPointCost: cost } = skill;
  if (slot === 'basic') return cost === 0 ? gain : `Basic ATK spends ${cost} skill points`;
  if (slot === 'skill') return gain === 0 ? cost : `Skill generates ${gain} skill points`;
  return gain === 0 && cost === 0 ? 0 : 'Ultimate changes skill points';
}

export function kitTemplate(tables: SkillTables, request: KitTemplateRequest): Lookup<KitTemplate> {
  const { characterId, tree = 'base', eidolon = 0, levels, targetId, enemyIds } = request;
  const kit = skillKit(tables, characterId, tree);
  if (!kit) return { ok: false, reason: `character ${characterId} has no ${tree} skill kit in the table` };
  const targetIndex = enemyIds.indexOf(targetId);
  if (targetIndex < 0) return { ok: false, reason: `target ${targetId} is not an enemy` };
  const areaTargets = {
    target: [targetId],
    adjacent: [enemyIds[targetIndex - 1], enemyIds[targetIndex + 1]].filter((id): id is string => id !== undefined),
    all: [...enemyIds],
  } as const;

  const actions: Partial<Record<KitSlot, KitTemplateAction>> = {};
  const gaps: KitGap[] = [];
  for (const slot of KIT_SLOTS) {
    const skill = kit.skills.find((s) => s.slot === slot && s.variant === 0);
    if (!skill) {
      gaps.push({ slot, reason: 'noData', detail: `no ${slot} in the table` });
      continue;
    }
    if (skill.unsupported) {
      gaps.push({ slot, reason: 'unsupported', detail: skill.unsupported });
      continue;
    }
    const level = effectiveSkillLevel(kit, slot, levels[slot], eidolon);
    if (!Number.isInteger(levels[slot]) || levels[slot] < 1 || level > skill.maxLevel) {
      gaps.push({ slot, reason: 'level', detail: `level ${level} is not in the table (1–${skill.maxLevel})` });
      continue;
    }
    const skillPoints = skillPointsFor(skill);
    if (typeof skillPoints === 'string') {
      gaps.push({ slot, reason: 'skillPoints', detail: skillPoints });
      continue;
    }
    const steps: ActionStep[] = skill.damage.flatMap((d) =>
      areaTargets[d.area].map((id): ActionStep => {
        const hit: HitSpec = {
          targetId: id,
          scaling: d.scaling,
          // The level check above keeps the index in range.
          multiplier: d.multipliers[level - 1]!,
          element: skill.element,
          tags: [slot],
          label: skill.name,
        };
        return { op: 'hit', hit };
      }),
    );
    actions[slot] = { skillId: skill.skillId, name: skill.name, level, steps, energy: skill.energy, skillPoints, otherEffects: skill.otherEffects };
  }
  return { ok: true, value: { actions, gaps, source: kit.source, gameVersion: kit.gameVersion } };
}
