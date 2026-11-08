import { STACKING_POLICIES } from '../../engine/index';
import type { Scenario } from './scenario';

const invalid = Symbol('invalid scenario shape');
type Read = (value: unknown) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shape(fields: Readonly<Record<string, Read>>): Read {
  return (value) => {
    if (!isRecord(value)) return invalid;
    const result: Record<string, unknown> = {};
    for (const [key, read] of Object.entries(fields)) {
      const field = read(value[key]);
      if (field === invalid) return invalid;
      if (field !== undefined) result[key] = field;
    }
    return result;
  };
}

const checked = (check: (value: unknown) => boolean): Read => (value) => check(value) ? value : invalid;
const string = checked((value) => typeof value === 'string');
const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const number = checked(isNumber);
const numberRecord: Read = (value) => isRecord(value) && Object.values(value).every(isNumber) ? { ...value } : invalid;
const boolean = checked((value) => typeof value === 'boolean');
const oneOf = (...options: string[]): Read => checked((value) => typeof value === 'string' && options.includes(value));
const optional = (read: Read): Read => (value) => value === undefined ? undefined : read(value);
const list = (read: Read): Read => (value) => {
  if (!Array.isArray(value)) return invalid;
  const result = value.map(read);
  return result.includes(invalid) ? invalid : result;
};

// The engine validator expects typed inputs. Check the JSON shape before handing it
// numbers, enums and references for domain validation.
const requirement = optional(shape({ minEidolon: optional(number) }));
const condition = optional(shape({
  elements: optional(list(string)),
  damageTags: optional(list(string)),
  counterpartIds: optional(list(string)),
}));
const modifier = shape({
  stat: string,
  value: number,
  condition,
});
const conversion = shape({
  from: string,
  fromUnit: optional(string),
  to: string,
  ratio: number,
  threshold: optional(number),
  cap: optional(number),
  condition,
});
const unitRef = shape({ unitId: string });
const duration = shape({
  turns: number,
  tickUnit: (value) => value === 'holder' || value === 'source' ? value : unitRef(value),
  tickPhase: oneOf('turnStart', 'turnEnd'),
  tickOnApplyTurn: optional(boolean),
});
const effect = shape({
  id: string,
  name: string,
  kind: oneOf('buff', 'debuff'),
  modifiers: list(modifier),
  conversions: optional(list(conversion)),
  duration: optional(duration),
  maxStacks: optional(number),
  stacking: optional(oneOf(...STACKING_POLICIES)),
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
  breakLevelMultiplier: optional(number),
  lightCone: optional(shape({
    name: string, superimposition: optional(number), base: shape(baseStats), effects: list(effect),
  })),
  relics: optional(shape({ stats: list(modifier), setEffects: list(effect) })),
  traces: optional(list(modifier)),
});
const enemy = shape({
  ...unit,
  baseDef: optional(number),
  effectRes: optional(number),
  debuffRes: optional(numberRecord),
  maxToughness: optional(number),
  broken: optional(boolean),
  res: numberRecord,
});
const hit = shape({
  attackerId: optional(string),
  targetId: string,
  scaling: oneOf('atk', 'hp', 'def'),
  multiplier: number,
  extraMultiplier: optional(number),
  flatDmg: optional(number),
  element: optional(string),
  tags: list(string),
  canCrit: optional(boolean),
  baseChance: optional(number),
  dotType: optional(string),
  label: optional(string),
});
const stepFields = { op: string, requires: requirement };
const hitStep = shape({ ...stepFields, hit });
const breakFields = {
  targetId: string,
  attackerId: optional(string),
  element: optional(string),
  label: optional(string),
};
const breakHit = shape({ ...breakFields, kind: oneOf('break'), multiplier: optional(number) });
const superBreakHit = shape({
  ...breakFields,
  kind: oneOf('superBreak'),
  multiplier: number,
  toughnessReduction: number,
  breakEfficiency: optional(number),
  fixedToughnessReduction: optional(number),
});
const breakStep = shape({
  ...stepFields,
  hit: (value) => isRecord(value) && value.kind === 'superBreak' ? superBreakHit(value) : breakHit(value),
});
const applyStep = shape({ ...stepFields, effect, to: string, sourceId: optional(string), stacks: optional(number) });
const removeStep = shape({ ...stepFields, effectId: string, from: string });
const brokenStep = shape({ ...stepFields, enemyId: string, broken: boolean });

function step(value: unknown): unknown {
  if (!isRecord(value)) return invalid;
  switch (value.op) {
    case 'hit': return hitStep(value);
    case 'break': return breakStep(value);
    case 'apply': return applyStep(value);
    case 'remove': return removeStep(value);
    case 'setBroken': return brokenStep(value);
    default: return invalid;
  }
}

const event = shape({
  id: string,
  actorId: string,
  kind: oneOf('turn', 'extra'),
  label: optional(string),
  steps: list(step),
});
const team = shape({
  label: string,
  team: list(character),
  events: list(event),
  effectLibrary: optional(list(effect)),
  cycles: optional(number),
});
const teams = list(team);
const scenario = shape({
  enemies: list(enemy),
  critMode: oneOf('expected', 'crit', 'nonCrit'),
  teams: (value) => Array.isArray(value) && value.length === 2 ? teams(value) : invalid,
});

export function readScenario(value: unknown): Scenario | undefined {
  const result = scenario(value);
  return result === invalid ? undefined : result as Scenario;
}
