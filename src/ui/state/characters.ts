import { characterBase, characterName, DATA_TABLES, NAME_TABLES, pathName } from '../../data';
import type { CharacterBuild } from '../../engine/index';
import { t } from '../i18n';
import { suggestedBreakLevelMultiplier } from './break-level';

/** Game name, with its path when two characters share it (e.g. the Trailblazer). */
export function displayCharacter(id: string, fallback: string): string {
  const record = characterName(NAME_TABLES, id);
  if (!record) return fallback || id;
  const name = record.name ?? t('import.trailblazer');
  const collision = NAME_TABLES.characters.some((other) => other.id !== id && other.name === record.name);
  if (record.name !== null && !collision) return name;
  const path = pathName(NAME_TABLES, record.path)?.name ?? record.path;
  return t('import.nameWithPath').replace('{name}', () => name).replace('{path}', () => path);
}

/** Characters the sourced tables cover, for the picker. */
export const CHARACTER_OPTIONS: readonly { readonly id: string; readonly name: string }[] = DATA_TABLES.characters
  .map(({ id }) => {
    const name = displayCharacter(id, id);
    // Both Trailblazers of a path share a name; only the gender tells the options apart.
    const gender = characterName(NAME_TABLES, id)?.gender;
    return {
      id,
      name: gender
        ? t('character.optionWithGender').replace('{name}', () => name).replace('{gender}', t(`character.gender.${gender}`))
        : name,
    };
  });

const known = new Set(DATA_TABLES.characters.map(({ id }) => id));

/**
 * The game character a build portrays. Builds imported before `characterId`
 * existed still carry the game ID as their unit ID.
 */
export function buildCharacterId(build: CharacterBuild): string | undefined {
  if (build.characterId !== undefined) return build.characterId;
  return known.has(build.id) ? build.id : undefined;
}

export function characterPathId(id: string): string | undefined {
  return characterName(NAME_TABLES, id)?.path;
}

/** Pick a game character: sets the portrait, name and element, keeps every number. */
export function pickCharacter(build: CharacterBuild, id: string | undefined): CharacterBuild {
  if (id === undefined) {
    const { characterId: _omit, ...rest } = build;
    return rest;
  }
  const record = DATA_TABLES.characters.find((c) => c.id === id);
  return {
    ...build,
    characterId: id,
    name: displayCharacter(id, build.name),
    ...(record ? { element: record.element } : {}),
  };
}

/** Sourced base stats at the character's highest level in the table, or undefined if not covered. */
export function maxLevelBase(build: CharacterBuild): CharacterBuild | undefined {
  const id = buildCharacterId(build);
  const record = id === undefined ? undefined : DATA_TABLES.characters.find((c) => c.id === id);
  if (!id || !record || record.ascensions.length === 0) return undefined;
  const ascension = record.ascensions.length - 1;
  const level = record.ascensions[ascension]!.maxLevel;
  const base = characterBase(DATA_TABLES, id, level, ascension);
  if (!base.ok) return undefined;
  const breakLevelMultiplier = suggestedBreakLevelMultiplier(level);
  return {
    ...build,
    level,
    element: base.value.element,
    base: base.value.base,
    baseCritRate: base.value.critRate,
    baseCritDmg: base.value.critDmg,
    ...(breakLevelMultiplier === undefined ? {} : { breakLevelMultiplier }),
  };
}
