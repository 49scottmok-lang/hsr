/**
 * I2: turn a parsed export (I1 `parseArchive`) into engine `CharacterBuild`s
 * using the sourced stat tables (D3), and report what was looked up and what
 * the user still has to enter (SPEC D5).
 *
 * Report items are structured (`kind` + fields) so the UI can translate them
 * (F11); `message` is an English fallback. Nothing is rounded.
 */
import type { CharacterBuild, EffectDef, LightCone, StatKey, StatModifier } from '../engine';
import { breakLevelMultiplier, characterBase, lightConeBase, relicMainStat, setBonus2pc, statTrace, STAT_TRACES } from '../data';
import type { DataSource, DataTables, RelicSlot, StatTrace, TraceTree } from '../data';
import type { Archive, ArchiveCharacter, ArchiveRelic, SubstatKey } from './archive';

/** Export substat key → engine stat, and the divisor for percent units (docs/IMPORT_FORMAT.md). */
export const SUBSTAT_TARGETS: Readonly<Record<SubstatKey, { readonly stat: StatKey; readonly divisor: number }>> = {
  HP: { stat: 'hpFlat', divisor: 1 },
  HP_: { stat: 'hpPct', divisor: 100 },
  ATK: { stat: 'atkFlat', divisor: 1 },
  ATK_: { stat: 'atkPct', divisor: 100 },
  DEF: { stat: 'defFlat', divisor: 1 },
  DEF_: { stat: 'defPct', divisor: 100 },
  SPD: { stat: 'spdFlat', divisor: 1 },
  'CRIT Rate_': { stat: 'critRate', divisor: 100 },
  'CRIT DMG_': { stat: 'critDmg', divisor: 100 },
  'Break Effect_': { stat: 'breakEffect', divisor: 100 },
  'Effect Hit Rate_': { stat: 'effectHitRate', divisor: 100 },
  'Effect RES_': { stat: 'effectRes', divisor: 100 },
};

/** Something filled in from the stat tables. */
export type LookedUpItem =
  | { readonly kind: 'characterBase'; readonly message: string }
  | { readonly kind: 'breakLevelMultiplier'; readonly level: number; readonly message: string }
  | { readonly kind: 'lightConeBase'; readonly lightConeId: string; readonly message: string }
  | { readonly kind: 'relicMainStat'; readonly slot: RelicSlot; readonly mainstat: string; readonly message: string }
  | { readonly kind: 'setBonus2pc'; readonly setId: string; readonly message: string }
  | { readonly kind: 'trace'; readonly trace: StatTrace; readonly tree: TraceTree; readonly message: string };

/** Something the user must still enter by hand (not table data in v1). */
export type ToEnterItem =
  | { readonly kind: 'kit'; readonly message: string }
  | { readonly kind: 'eidolonEffects'; readonly eidolon: number; readonly message: string }
  | { readonly kind: 'lightConePassive'; readonly lightConeId: string; readonly superimposition: number; readonly message: string }
  | { readonly kind: 'setBonus4pc'; readonly setId: string; readonly setName: string; readonly message: string }
  | { readonly kind: 'setBonus2pc'; readonly setId: string; readonly setName: string; readonly message: string }
  | { readonly kind: 'setBonus2pcAbility'; readonly setId: string; readonly setName: string; readonly message: string };

/** Something that could not be imported as-is. */
export type ProblemItem =
  | {
      readonly kind: 'tableMiss';
      readonly what: 'character' | 'lightCone' | 'relicMainStat' | 'trace' | 'breakLevelMultiplier';
      readonly message: string;
    }
  | { readonly kind: 'unsupportedStat'; readonly property: string; readonly value: number; readonly message: string }
  | { readonly kind: 'traceTree'; readonly tree: TraceTree; readonly message: string };

export interface BuildReport {
  readonly characterId: string;
  readonly name: string;
  /** False when the character's base stats are missing; then no build is produced. */
  readonly built: boolean;
  readonly lookedUp: readonly LookedUpItem[];
  readonly toEnter: readonly ToEnterItem[];
  readonly problems: readonly ProblemItem[];
}

export interface ImportReport {
  readonly builds: readonly BuildReport[];
  /** Unequipped items the parser dropped (I1). */
  readonly dropped: Archive['dropped'];
}

export interface ImportResult {
  readonly builds: readonly CharacterBuild[];
  readonly report: ImportReport;
}

const cite = (s: DataSource, gameVersion: string): string =>
  `${s.repo}@${s.commit.slice(0, 7)} (${s.files.join(', ')}), game ${gameVersion}`;

/** Sums modifiers with the same stat and condition, keeping first-seen order. */
function mergeModifiers(mods: readonly StatModifier[]): StatModifier[] {
  const out: StatModifier[] = [];
  const index = new Map<string, number>();
  for (const m of mods) {
    const key = `${m.stat}|${JSON.stringify(m.condition ?? null)}`;
    const i = index.get(key);
    if (i === undefined) {
      index.set(key, out.length);
      out.push({ stat: m.stat, value: m.value, ...(m.condition ? { condition: m.condition } : {}) });
    } else {
      const prev = out[i]!;
      out[i] = { ...prev, value: prev.value + m.value };
    }
  }
  return out;
}

interface Collector {
  lookedUp: LookedUpItem[];
  toEnter: ToEnterItem[];
  problems: ProblemItem[];
}

function relicStats(relics: readonly ArchiveRelic[], tables: DataTables, r: Collector): StatModifier[] {
  const mods: StatModifier[] = [];
  for (const relic of relics) {
    const main = relicMainStat(tables, relic.slot, relic.rarity, relic.mainstat, relic.level);
    if (!main.ok) {
      r.problems.push({ kind: 'tableMiss', what: 'relicMainStat', message: main.reason });
    } else {
      r.lookedUp.push({
        kind: 'relicMainStat',
        slot: relic.slot,
        mainstat: relic.mainstat,
        message: `${relic.slot} main stat ${relic.mainstat} +${relic.level}`,
      });
      if (main.value.modifier) mods.push(main.value.modifier);
      else {
        r.problems.push({
          kind: 'unsupportedStat',
          property: main.value.record.property,
          value: main.value.value,
          message: `${relic.slot} main stat ${relic.mainstat} is not modelled by the engine`,
        });
      }
    }
    for (const sub of relic.substats) {
      const t = SUBSTAT_TARGETS[sub.key];
      mods.push({ stat: t.stat, value: sub.value / t.divisor });
    }
  }
  return mods;
}

function setEffects(relics: readonly ArchiveRelic[], tables: DataTables, r: Collector): EffectDef[] {
  const sets = new Map<string, { name: string; count: number }>();
  for (const relic of relics) {
    const s = sets.get(relic.setId);
    sets.set(relic.setId, { name: relic.setName, count: (s?.count ?? 0) + 1 });
  }
  const effects: EffectDef[] = [];
  for (const [setId, { name, count }] of sets) {
    if (count < 2) continue;
    const label = name || `set ${setId}`;
    const bonus = setBonus2pc(tables, setId);
    if (!bonus) {
      // Ability-only 2-piece bonuses (and sets newer than the table) have no stat row.
      r.toEnter.push({ kind: 'setBonus2pc', setId, setName: name, message: `${label} 2-piece bonus: not in the stat table` });
    } else {
      r.lookedUp.push({ kind: 'setBonus2pc', setId, message: `${label} 2-piece stat bonus` });
      if (bonus.modifiers.length > 0) {
        effects.push({
          id: `set-${setId}-2pc`,
          name: `${label} (2-piece, unconditional part)`,
          kind: 'buff',
          modifiers: bonus.modifiers,
          source: cite(bonus.source, bonus.gameVersion),
        });
      }
      for (const u of bonus.unsupported) {
        r.problems.push({
          kind: 'unsupportedStat',
          property: u.property,
          value: u.value,
          message: `${label} 2-piece ${u.property} is not modelled by the engine`,
        });
      }
      if (bonus.hasAbilityPart) {
        r.toEnter.push({ kind: 'setBonus2pcAbility', setId, setName: name, message: `${label} 2-piece conditional part` });
      }
    }
    if (count >= 4) r.toEnter.push({ kind: 'setBonus4pc', setId, setName: name, message: `${label} 4-piece bonus` });
  }
  return effects;
}

function traceTree(c: ArchiveCharacter, tables: DataTables, r: Collector): TraceTree {
  if (c.abilityVersion === 0) return 'base';
  const hasEnhanced = tables.traces.some((t) => t.characterId === c.id && t.tree === 'enhanced');
  // ASSUMPTION (docs/KNOWN_LIMITATIONS.md): a non-zero ability_version selects the enhanced tree.
  const tree: TraceTree = hasEnhanced ? 'enhanced' : 'base';
  r.problems.push({
    kind: 'traceTree',
    tree,
    message: `ability_version ${c.abilityVersion}: assumed the ${tree} trace tree (unverified)`,
  });
  return tree;
}

function traceStats(c: ArchiveCharacter, tree: TraceTree, tables: DataTables, r: Collector): StatModifier[] {
  const mods: StatModifier[] = [];
  for (const key of STAT_TRACES) {
    if (!c.traces[key]) continue;
    const t = statTrace(tables, c.id, key, tree);
    if (!t) {
      r.problems.push({ kind: 'tableMiss', what: 'trace', message: `${key} (${tree} tree) of character ${c.id} is not in the table` });
      continue;
    }
    r.lookedUp.push({ kind: 'trace', trace: key, tree, message: `trace ${key}` });
    mods.push(...t.modifiers);
    for (const u of t.unsupported) {
      r.problems.push({ kind: 'unsupportedStat', property: u.property, value: u.value, message: `trace ${key} ${u.property} is not modelled by the engine` });
    }
  }
  return mods;
}

function importCharacter(
  c: ArchiveCharacter,
  archive: Archive,
  tables: DataTables,
): { build?: CharacterBuild; report: BuildReport } {
  const r: Collector = { lookedUp: [], toEnter: [], problems: [] };
  const finish = (build?: CharacterBuild) => ({
    ...(build ? { build } : {}),
    report: { characterId: c.id, name: c.name, built: build !== undefined, ...r },
  });

  const base = characterBase(tables, c.id, c.level, c.ascension);
  if (!base.ok) {
    r.problems.push({ kind: 'tableMiss', what: 'character', message: base.reason });
    return finish();
  }
  r.lookedUp.push({ kind: 'characterBase', message: `base stats at level ${c.level}, ascension ${c.ascension}` });
  const breakLevel = breakLevelMultiplier(tables, c.level);
  if (breakLevel.ok) {
    r.lookedUp.push({ kind: 'breakLevelMultiplier', level: c.level, message: `break DMG level multiplier at level ${c.level}` });
  } else {
    r.problems.push({ kind: 'tableMiss', what: 'breakLevelMultiplier', message: breakLevel.reason });
  }

  let lightCone: LightCone | undefined;
  const lc = archive.lightCones.find((l) => l.location === c.id);
  if (lc) {
    const lcBase = lightConeBase(tables, lc.id, lc.level, lc.ascension);
    if (!lcBase.ok) {
      r.problems.push({ kind: 'tableMiss', what: 'lightCone', message: lcBase.reason });
    } else {
      r.lookedUp.push({ kind: 'lightConeBase', lightConeId: lc.id, message: `light cone ${lc.name || lc.id} base stats` });
      lightCone = { name: lc.name || lc.id, superimposition: lc.superimposition, base: lcBase.value, effects: [] };
    }
    r.toEnter.push({
      kind: 'lightConePassive',
      lightConeId: lc.id,
      superimposition: lc.superimposition,
      message: `light cone ${lc.name || lc.id} passive (S${lc.superimposition})`,
    });
  }

  const relics = archive.relics.filter((x) => x.location === c.id);
  const relicMods = relicStats(relics, tables, r);
  const sets = setEffects(relics, tables, r);
  const tree = traceTree(c, tables, r);
  const traces = traceStats(c, tree, tables, r);

  r.toEnter.unshift({ kind: 'kit', message: 'skill multipliers, talents and other kit effects' });
  if (c.eidolon > 0) r.toEnter.splice(1, 0, { kind: 'eidolonEffects', eidolon: c.eidolon, message: `eidolon effects E1–E${c.eidolon}` });

  const build: CharacterBuild = {
    id: c.id,
    name: c.name,
    characterId: c.id,
    // The kit uses the same tree as the traces (same ability_version assumption).
    skillLevels: { basic: c.skills.basic, skill: c.skills.skill, ultimate: c.skills.ult, tree },
    level: c.level,
    element: base.value.element,
    eidolon: c.eidolon,
    base: base.value.base,
    baseCritRate: base.value.critRate,
    baseCritDmg: base.value.critDmg,
    ...(breakLevel.ok ? { breakLevelMultiplier: breakLevel.value } : {}),
    ...(lightCone ? { lightCone } : {}),
    relics: { stats: mergeModifiers(relicMods), setEffects: sets },
    traces: mergeModifiers(traces),
  };
  return finish(build);
}

/**
 * One build per character the tables cover, in export order. Characters the
 * tables don't cover get a report entry with `built: false`.
 */
export function importArchive(archive: Archive, tables: DataTables): ImportResult {
  const builds: CharacterBuild[] = [];
  const reports: BuildReport[] = [];
  for (const c of archive.characters) {
    const { build, report } = importCharacter(c, archive, tables);
    if (build) builds.push(build);
    reports.push(report);
  }
  return { builds, report: { builds: reports, dropped: archive.dropped } };
}
