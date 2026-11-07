type Check = (value: unknown) => boolean;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shape(fields: Readonly<Record<string, Check>>): Check {
  return (value) => isRecord(value) && Object.entries(fields).every(([key, check]) => check(value[key]));
}

const string: Check = (value) => typeof value === 'string';
const number: Check = (value) => typeof value === 'number' && Number.isFinite(value);
const boolean: Check = (value) => typeof value === 'boolean';
const optional = (check: Check): Check => (value) => value === undefined || check(value);
const list = (check: Check): Check => (value) => Array.isArray(value) && value.every(check);

// The engine validator expects typed inputs. Check the JSON shape before handing it
// numbers, enums and references for domain validation.
const requirement = optional(shape({ minEidolon: optional(number) }));
const modifier = shape({
  stat: string,
  value: number,
  condition: optional(shape({
    elements: optional(list(string)),
    damageTags: optional(list(string)),
    counterpartIds: optional(list(string)),
  })),
});
const duration = shape({
  turns: number,
  tickUnit: (value) => value === 'holder' || value === 'source' || shape({ unitId: string })(value),
  tickPhase: (value) => value === 'turnStart' || value === 'turnEnd',
  tickOnApplyTurn: optional(boolean),
});
const effect = shape({
  id: string,
  name: string,
  kind: (value) => value === 'buff' || value === 'debuff',
  modifiers: list(modifier),
  duration: optional(duration),
  maxStacks: optional(number),
  requires: requirement,
  source: optional(string),
});
const unit = { id: string, name: string, level: number, passiveEffects: optional(list(effect)) };
const baseStats = { hp: number, atk: number, def: number };
const character = shape({
  ...unit,
  element: string,
  eidolon: optional(number),
  base: shape({ ...baseStats, spd: number }),
  baseCritRate: optional(number),
  baseCritDmg: optional(number),
  lightCone: optional(shape({
    name: string, superimposition: optional(number), base: shape(baseStats), effects: list(effect),
  })),
  relics: optional(shape({ stats: list(modifier), setEffects: list(effect) })),
  traces: optional(list(modifier)),
});
const enemy = shape({
  ...unit,
  baseDef: optional(number),
  broken: optional(boolean),
  res: (value) => isRecord(value) && Object.values(value).every(number),
});
const hit = shape({
  attackerId: optional(string),
  targetId: string,
  scaling: (value) => value === 'atk' || value === 'hp' || value === 'def',
  multiplier: number,
  extraMultiplier: optional(number),
  flatDmg: optional(number),
  element: optional(string),
  tags: list(string),
  canCrit: optional(boolean),
  label: optional(string),
});
const applyStep = shape({ effect, to: string, sourceId: optional(string), stacks: optional(number) });
const removeStep = shape({ effectId: string, from: string });
const brokenStep = shape({ enemyId: string, broken: boolean });

function step(value: unknown): boolean {
  if (!isRecord(value) || !requirement(value.requires)) return false;
  switch (value.op) {
    case 'hit': return hit(value.hit);
    case 'apply': return applyStep(value);
    case 'remove': return removeStep(value);
    case 'setBroken': return brokenStep(value);
    default: return false;
  }
}

const event = shape({
  id: string,
  actorId: string,
  kind: (value) => value === 'turn' || value === 'extra',
  label: optional(string),
  steps: list(step),
});
const team = shape({ label: string, team: list(character), events: list(event), cycles: optional(number) });
export const hasScenarioShape = shape({
  enemies: list(enemy),
  critMode: (value) => value === 'expected' || value === 'crit' || value === 'nonCrit',
  teams: (value) => Array.isArray(value) && value.length === 2 && value.every(team),
});
