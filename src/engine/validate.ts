import {
  DAMAGE_TAGS,
  ELEMENTS,
  STAT_KEYS,
  type CharacterBuild,
  type EffectDef,
  type EnemyConfig,
  type HitSpec,
  type RotationInput,
  type StatModifier,
} from './types';

export class EngineValidationError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid rotation input:\n- ${issues.join('\n- ')}`);
    this.name = 'EngineValidationError';
    this.issues = issues;
  }
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPosInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;

function checkModifier(m: StatModifier, path: string, out: string[]): void {
  if (!(STAT_KEYS as readonly string[]).includes(m.stat)) out.push(`${path}: unknown stat "${m.stat}"`);
  if (!isFiniteNum(m.value)) out.push(`${path}: value must be a finite number`);
  for (const el of m.condition?.elements ?? []) {
    if (!(ELEMENTS as readonly string[]).includes(el)) out.push(`${path}: unknown element "${el}"`);
  }
  for (const t of m.condition?.damageTags ?? []) {
    if (!(DAMAGE_TAGS as readonly string[]).includes(t)) out.push(`${path}: unknown damage tag "${t}"`);
  }
}

function checkEffect(def: EffectDef, path: string, unitIds: Set<string>, out: string[]): void {
  if (!def.id) out.push(`${path}: effect id is required`);
  def.modifiers.forEach((m, i) => checkModifier(m, `${path}.modifiers[${i}]`, out));
  if (def.maxStacks !== undefined && !isPosInt(def.maxStacks)) {
    out.push(`${path}: maxStacks must be an integer >= 1`);
  }
  const d = def.duration;
  if (d) {
    if (!isPosInt(d.turns)) out.push(`${path}: duration.turns must be an integer >= 1`);
    if (typeof d.tickUnit === 'object' && !unitIds.has(d.tickUnit.unitId)) {
      out.push(`${path}: duration.tickUnit "${d.tickUnit.unitId}" is not a unit`);
    }
  }
}

function checkBuild(b: CharacterBuild, path: string, unitIds: Set<string>, out: string[]): void {
  if (!isPosInt(b.level)) out.push(`${path}: level must be an integer >= 1`);
  if (!(ELEMENTS as readonly string[]).includes(b.element)) out.push(`${path}: unknown element "${b.element}"`);
  for (const k of ['hp', 'atk', 'def', 'spd'] as const) {
    if (!isFiniteNum(b.base[k]) || b.base[k] < 0) out.push(`${path}.base.${k}: must be a finite number >= 0`);
  }
  if (b.lightCone) {
    for (const k of ['hp', 'atk', 'def'] as const) {
      const v = b.lightCone.base[k];
      if (!isFiniteNum(v) || v < 0) out.push(`${path}.lightCone.base.${k}: must be a finite number >= 0`);
    }
    b.lightCone.effects.forEach((e, i) => checkEffect(e, `${path}.lightCone.effects[${i}]`, unitIds, out));
  }
  b.relics?.stats.forEach((m, i) => checkModifier(m, `${path}.relics.stats[${i}]`, out));
  b.relics?.setEffects.forEach((e, i) => checkEffect(e, `${path}.relics.setEffects[${i}]`, unitIds, out));
  b.traces?.forEach((m, i) => checkModifier(m, `${path}.traces[${i}]`, out));
  b.passiveEffects?.forEach((e, i) => checkEffect(e, `${path}.passiveEffects[${i}]`, unitIds, out));
}

function checkEnemy(e: EnemyConfig, path: string, unitIds: Set<string>, out: string[]): void {
  if (!isPosInt(e.level)) out.push(`${path}: level must be an integer >= 1`);
  if (e.baseDef !== undefined && (!isFiniteNum(e.baseDef) || e.baseDef < 0)) {
    out.push(`${path}.baseDef: must be a finite number >= 0`);
  }
  for (const [el, v] of Object.entries(e.res)) {
    if (!(ELEMENTS as readonly string[]).includes(el)) out.push(`${path}.res: unknown element "${el}"`);
    if (!isFiniteNum(v)) out.push(`${path}.res.${el}: must be a finite number`);
  }
  e.passiveEffects?.forEach((x, i) => checkEffect(x, `${path}.passiveEffects[${i}]`, unitIds, out));
}

function checkHit(
  h: HitSpec,
  defaultAttacker: string,
  path: string,
  allies: Set<string>,
  enemies: Set<string>,
  out: string[],
): void {
  const attacker = h.attackerId ?? defaultAttacker;
  if (!allies.has(attacker)) out.push(`${path}: attacker "${attacker}" must be a team member`);
  if (!enemies.has(h.targetId)) out.push(`${path}: target "${h.targetId}" must be an enemy`);
  if (!isFiniteNum(h.multiplier) || h.multiplier < 0) out.push(`${path}: multiplier must be a finite number >= 0`);
  if (h.extraMultiplier !== undefined && !isFiniteNum(h.extraMultiplier)) {
    out.push(`${path}: extraMultiplier must be finite`);
  }
  if (h.flatDmg !== undefined && !isFiniteNum(h.flatDmg)) out.push(`${path}: flatDmg must be finite`);
  if (h.element !== undefined && !(ELEMENTS as readonly string[]).includes(h.element)) {
    out.push(`${path}: unknown element "${h.element}"`);
  }
  if (h.tags.length === 0) out.push(`${path}: at least one damage tag is required`);
  for (const t of h.tags) {
    if (!(DAMAGE_TAGS as readonly string[]).includes(t)) out.push(`${path}: unknown damage tag "${t}"`);
  }
}

/** Returns a list of human-readable issues; empty means valid. */
export function validateRotationInput(input: RotationInput): string[] {
  const out: string[] = [];
  if (input.team.length < 1 || input.team.length > 4) out.push('team: must contain 1 to 4 characters');
  if (input.enemies.length < 1) out.push('enemies: at least one enemy is required');

  const allies = new Set(input.team.map((c) => c.id));
  const enemies = new Set(input.enemies.map((e) => e.id));
  const all = [...input.team.map((c) => c.id), ...input.enemies.map((e) => e.id)];
  const unitIds = new Set(all);
  if (unitIds.size !== all.length) out.push('units: character and enemy IDs must be unique');

  input.team.forEach((b, i) => checkBuild(b, `team[${i}]`, unitIds, out));
  input.enemies.forEach((e, i) => checkEnemy(e, `enemies[${i}]`, unitIds, out));

  if (input.cycles !== undefined && (!isFiniteNum(input.cycles) || input.cycles <= 0)) {
    out.push('cycles: must be a positive number');
  }

  const eventIds = new Set<string>();
  input.events.forEach((ev, i) => {
    const p = `events[${i}]`;
    if (eventIds.has(ev.id)) out.push(`${p}: duplicate event id "${ev.id}"`);
    eventIds.add(ev.id);
    if (!unitIds.has(ev.actorId)) out.push(`${p}: actor "${ev.actorId}" is not a unit`);
    ev.steps.forEach((st, j) => {
      const sp = `${p}.steps[${j}]`;
      switch (st.op) {
        case 'hit':
          checkHit(st.hit, ev.actorId, sp, allies, enemies, out);
          break;
        case 'apply':
          checkEffect(st.effect, `${sp}.effect`, unitIds, out);
          if (st.to !== 'allAllies' && st.to !== 'allEnemies' && !unitIds.has(st.to)) {
            out.push(`${sp}: target "${st.to}" is not a unit`);
          }
          if (st.sourceId !== undefined && !unitIds.has(st.sourceId)) {
            out.push(`${sp}: source "${st.sourceId}" is not a unit`);
          }
          if (st.stacks !== undefined && !isPosInt(st.stacks)) out.push(`${sp}: stacks must be an integer >= 1`);
          break;
        case 'remove':
          if (st.from !== 'allAllies' && st.from !== 'allEnemies' && !unitIds.has(st.from)) {
            out.push(`${sp}: target "${st.from}" is not a unit`);
          }
          break;
        case 'setBroken':
          if (!enemies.has(st.enemyId)) out.push(`${sp}: "${st.enemyId}" is not an enemy`);
          break;
      }
    });
  });
  return out;
}
