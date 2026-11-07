import { characterName, DATA_TABLES, lightConeName, NAME_TABLES, pathName, relicSetName } from '../../data';
import {
  importArchive, parseArchive, SUPPORTED_ARCHIVE_VERSIONS,
  type ArchiveIssue, type LookedUpItem, type ProblemItem, type ToEnterItem,
} from '../../import';
import { formatNumber, t } from '../i18n';

function displayCharacter(id: string, fallback: string): string {
  const record = characterName(NAME_TABLES, id);
  if (!record) return fallback || id;
  const name = record.name ?? t('import.trailblazer');
  const collision = NAME_TABLES.characters.some((other) => other.id !== id && other.name === record.name);
  if (record.name !== null && !collision) return name;
  const path = pathName(NAME_TABLES, record.path)?.name ?? record.path;
  return t('import.nameWithPath').replace('{name}', () => name).replace('{path}', () => path);
}

const displayCone = (id: string, fallback?: string) => lightConeName(NAME_TABLES, id)?.name || fallback || id;
const displaySet = (id: string, fallback?: string) => relicSetName(NAME_TABLES, id)?.name || fallback || id;

const relicSlots = {
  Head: 'import.slot.Head',
  Hands: 'import.slot.Hands',
  Body: 'import.slot.Body',
  Feet: 'import.slot.Feet',
  'Planar Sphere': 'import.slot.Planar Sphere',
  'Link Rope': 'import.slot.Link Rope',
} as const;

function importReportItem(
  item: LookedUpItem | ToEnterItem | ProblemItem,
  coneName?: string,
  sets?: ReadonlyMap<string, { name: string; count: number }>,
): string {
  switch (item.kind) {
    case 'characterBase': return t('import.report.characterBase');
    case 'breakLevelMultiplier': return t('import.report.breakLevelMultiplier').replace('{level}', formatNumber(item.level));
    case 'lightConeBase': return t('import.report.lightConeBase').replace('{name}', () => displayCone(item.lightConeId, coneName));
    case 'relicMainStat': return t('import.report.relicMainStat').replace('{slot}', t(relicSlots[item.slot]));
    case 'setBonus2pc': {
      const name = displaySet(item.setId, 'setName' in item ? item.setName : sets?.get(item.setId)?.name);
      const key = 'setName' in item ? 'import.report.setBonus2pcMissing' : 'import.report.setBonus2pc';
      return t(key).replace('{name}', () => name);
    }
    case 'trace': return t('import.report.trace').replace('{trace}', () => item.trace);
    case 'kit': return t('import.report.kit');
    case 'eidolonEffects': return t('import.report.eidolonEffects').replace('{rank}', formatNumber(item.eidolon));
    case 'lightConePassive': return t('import.report.lightConePassive')
      .replace('{rank}', formatNumber(item.superimposition)).replace('{name}', () => displayCone(item.lightConeId, coneName));
    case 'setBonus4pc':
    case 'setBonus2pcAbility': return t(`import.report.${item.kind}`).replace('{name}', () => displaySet(item.setId, item.setName));
    case 'tableMiss': return t(`import.report.tableMiss.${item.what}`);
    case 'unsupportedStat': return t('import.report.unsupportedStat').replace('{property}', () => item.property);
    case 'traceTree': return t('import.report.traceTree').replace('{tree}', t(`import.tree.${item.tree}`));
  }
}

function archiveIssue({ path, message }: ArchiveIssue): string {
  if (!path) return t('import.error.object');
  if (path === 'source') return t('import.error.source');
  if (path === 'version') return t('import.error.version').replace('{versions}',
    SUPPORTED_ARCHIVE_VERSIONS.map((version) => formatNumber(version)).join(t('results.separator')));
  return t(message === 'must be an array' ? 'import.error.array' : 'import.warning.entry')
    .replace('{path}', () => path);
}

export function prepareAccountImport(json: unknown) {
  const parsed = parseArchive(json);
  if (!parsed.ok) return { ok: false as const, errors: parsed.errors.map(archiveIssue) };
  const { archive, warnings } = parsed;
  const { builds, report } = importArchive(archive, DATA_TABLES);
  const entries = report.builds.map((details) => {
    const id = details.characterId;
    const character = archive.characters.find((unit) => unit.id === id)!;
    const name = displayCharacter(id, character.name);
    const cone = archive.lightCones.find(({ location }) => location === id);
    const coneName = cone && displayCone(cone.id, cone.name);
    const sets = new Map<string, { name: string; count: number }>();
    for (const relic of archive.relics) {
      if (relic.location !== id) continue;
      sets.set(relic.setId, { name: displaySet(relic.setId, relic.setName), count: (sets.get(relic.setId)?.count ?? 0) + 1 });
    }

    const original = builds.find((build) => build.id === id);
    const build = original && {
      ...original,
      name,
      ...(original.lightCone && coneName ? { lightCone: { ...original.lightCone, name: coneName } } : {}),
    };
    const itemText = (item: LookedUpItem | ToEnterItem | ProblemItem) => importReportItem(item, coneName, sets);
    return {
      id, name, build,
      level: character.level, eidolon: character.eidolon,
      cone: cone && coneName ? { name: coneName, superimposition: cone.superimposition } : undefined,
      sets: [...sets.values()],
      lookedUp: details.lookedUp.map(itemText),
      toEnter: details.toEnter.map(itemText),
      problems: details.problems.map(itemText),
    };
  });
  return { ok: true as const, entries, warnings: warnings.map(archiveIssue), dropped: report.dropped };
}
