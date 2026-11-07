/**
 * Display names in Traditional Chinese, from the source's text map (see
 * schema.ts § Display names). Kept apart from `DataTables` because names
 * carry no numbers and the account import does not need them.
 */
import { CHARACTER_NAMES } from './generated/characterNames';
import { LIGHT_CONE_NAMES } from './generated/lightConeNames';
import { PATH_NAMES } from './generated/pathNames';
import { RELIC_SET_NAMES } from './generated/relicSetNames';
import type {
  CharacterNameRecord,
  LightConeNameRecord,
  NameTables,
  PathNameRecord,
  RelicSetNameRecord,
} from './schema';
import { checkCited, checkUnique } from './validate';
import type { DataIssue, Push } from './validate';

export const NAME_TABLES: NameTables = {
  paths: PATH_NAMES,
  characters: CHARACTER_NAMES,
  lightCones: LIGHT_CONE_NAMES,
  relicSets: RELIC_SET_NAMES,
};

export function pathName(tables: NameTables, id: string): PathNameRecord | undefined {
  return tables.paths.find((p) => p.id === id);
}

export function characterName(tables: NameTables, id: string): CharacterNameRecord | undefined {
  return tables.characters.find((c) => c.id === id);
}

export function lightConeName(tables: NameTables, id: string): LightConeNameRecord | undefined {
  return tables.lightCones.find((l) => l.id === id);
}

export function relicSetName(tables: NameTables, setId: string): RelicSetNameRecord | undefined {
  return tables.relicSets.find((s) => s.setId === setId);
}

const ID_RE = /^\d+$/;

/** Plain display text: non-empty, trimmed, with no markup left over. */
function checkName(push: Push, path: string, name: unknown): void {
  if (typeof name !== 'string' || name === '' || name !== name.trim() || /[<>{}]/.test(name)) {
    push(path, `must be plain non-empty text, got ${JSON.stringify(name)}`);
  }
}

/** Returns every problem found; an empty list means the name tables are valid. */
export function validateNameTables(tables: NameTables): DataIssue[] {
  const issues: DataIssue[] = [];
  const push: Push = (path, message) => issues.push({ path, message });
  const pathIds = new Set(tables.paths.map((p) => p.id));
  const checkPath = (path: string, id: string): void => {
    if (!pathIds.has(id)) push(path, `unknown path ${id}`);
  };

  tables.paths.forEach((p, i) => {
    checkCited(push, `paths[${i}]`, p);
    if (!p.id) push(`paths[${i}].id`, 'missing');
    checkName(push, `paths[${i}].name`, p.name);
  });
  checkUnique(push, 'paths', tables.paths.map((p) => p.id));

  tables.characters.forEach((c, i) => {
    const p = `characters[${i}]`;
    checkCited(push, p, c);
    if (!ID_RE.test(c.id)) push(`${p}.id`, 'must be a numeric ID');
    checkPath(`${p}.path`, c.path);
    if (c.name === null) {
      if (c.gender !== 'male' && c.gender !== 'female') push(`${p}.gender`, 'a nickname character needs a gender');
    } else {
      checkName(push, `${p}.name`, c.name);
      if (c.gender !== undefined) push(`${p}.gender`, 'only nickname characters carry a gender');
    }
  });
  checkUnique(push, 'characters', tables.characters.map((c) => c.id));
  // Names can repeat across paths (1001 and 1224), so name + path (+ gender) must tell them apart.
  checkUnique(push, 'characters (name, path)', tables.characters.map((c) => `${c.name ?? `(${c.gender})`}/${c.path}`));

  tables.lightCones.forEach((l, i) => {
    const p = `lightCones[${i}]`;
    checkCited(push, p, l);
    if (!ID_RE.test(l.id)) push(`${p}.id`, 'must be a numeric ID');
    checkName(push, `${p}.name`, l.name);
    checkPath(`${p}.path`, l.path);
  });
  checkUnique(push, 'lightCones', tables.lightCones.map((l) => l.id));

  tables.relicSets.forEach((s, i) => {
    const p = `relicSets[${i}]`;
    checkCited(push, p, s);
    if (!ID_RE.test(s.setId)) push(`${p}.setId`, 'must be a numeric ID');
    checkName(push, `${p}.name`, s.name);
  });
  checkUnique(push, 'relicSets', tables.relicSets.map((s) => s.setId));

  return issues;
}
