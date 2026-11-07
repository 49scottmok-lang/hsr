/**
 * I1: parse and validate a Reliquary Archiver export (docs/IMPORT_FORMAT.md).
 *
 * The result is rebuilt from an allowlist of fields, so personal and
 * irrelevant data never leaves this function: `metadata.uid`, `gacha`,
 * `materials`, item `_uid`s, lock/discard flags, and unequipped light cones
 * and relics are all dropped. Values are only checked and normalised here;
 * converting them to engine stats is I2's job.
 *
 * File-level problems (not an object, wrong `source`, unsupported `version`,
 * missing arrays) fail the whole parse. A bad individual entry is skipped
 * with a warning, so one odd relic doesn't block the import.
 */
import { RELIC_SLOTS } from '../data';
import type { RelicSlot } from '../data';

export const ARCHIVE_SOURCE = 'reliquary_archiver';
/** Export format versions this parser has been checked against. */
export const SUPPORTED_ARCHIVE_VERSIONS: readonly number[] = [4];

export const TRACE_KEYS = [
  'ability_1',
  'ability_2',
  'ability_3',
  'stat_1',
  'stat_2',
  'stat_3',
  'stat_4',
  'stat_5',
  'stat_6',
  'stat_7',
  'stat_8',
  'stat_9',
  'stat_10',
  'special',
] as const;
export type TraceKey = (typeof TRACE_KEYS)[number];

/** Substat keys as written by the export. A trailing `_` means percent units (3.4 = 3.4%). */
export const SUBSTAT_KEYS = [
  'HP',
  'HP_',
  'ATK',
  'ATK_',
  'DEF',
  'DEF_',
  'SPD',
  'CRIT Rate_',
  'CRIT DMG_',
  'Break Effect_',
  'Effect Hit Rate_',
  'Effect RES_',
] as const;
export type SubstatKey = (typeof SUBSTAT_KEYS)[number];

export interface ArchiveSkills {
  readonly basic: number;
  readonly skill: number;
  readonly ult: number;
  readonly talent: number;
  readonly elation?: number;
}

export interface ArchiveCharacter {
  readonly id: string;
  readonly name: string;
  /** 命途 (Path), display only. Not the element. */
  readonly path: string;
  readonly level: number;
  readonly ascension: number;
  readonly eidolon: number;
  readonly skills: ArchiveSkills;
  readonly traces: Readonly<Record<TraceKey, boolean>>;
  readonly memosprite?: { readonly skill: number; readonly talent: number };
  /** The export's `ability_version` (0 when absent). */
  readonly abilityVersion: number;
}

export interface ArchiveLightCone {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly ascension: number;
  readonly superimposition: number;
  /** ID of the equipping character. */
  readonly location: string;
}

export interface ArchiveSubstat {
  readonly key: SubstatKey;
  /** Total value, in the export's units (percent units for `_` keys). */
  readonly value: number;
  readonly count: number;
  readonly step: number;
}

export interface ArchiveRelic {
  readonly setId: string;
  readonly setName: string;
  readonly slot: RelicSlot;
  readonly rarity: number;
  readonly level: number;
  /** Main stat name only; the value comes from the D3 table. */
  readonly mainstat: string;
  readonly substats: readonly ArchiveSubstat[];
  readonly location: string;
}

export interface Archive {
  readonly source: typeof ARCHIVE_SOURCE;
  /** Tool version, e.g. `"0.19.0"`. */
  readonly build: string;
  readonly version: number;
  readonly characters: readonly ArchiveCharacter[];
  /** Equipped light cones only. */
  readonly lightCones: readonly ArchiveLightCone[];
  /** Equipped relics only. */
  readonly relics: readonly ArchiveRelic[];
  /** How many unequipped items were dropped. */
  readonly dropped: { readonly lightCones: number; readonly relics: number };
}

export interface ArchiveIssue {
  readonly path: string;
  readonly message: string;
}

export type ArchiveParseResult =
  | { readonly ok: true; readonly archive: Archive; readonly warnings: readonly ArchiveIssue[] }
  | { readonly ok: false; readonly errors: readonly ArchiveIssue[] };

// --- Field readers ------------------------------------------------------------
// Each returns undefined after recording why, so callers can skip the entry.

type Rec = Readonly<Record<string, unknown>>;
type Report = (path: string, message: string) => void;

const isRecord = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x);

function int(o: Rec, key: string, min: number, max: number, path: string, report: Report): number | undefined {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    report(`${path}.${key}`, `must be an integer from ${min} to ${max}`);
    return undefined;
  }
  return v;
}

function str(o: Rec, key: string, path: string, report: Report): string | undefined {
  const v = o[key];
  if (typeof v !== 'string') {
    report(`${path}.${key}`, 'must be a string');
    return undefined;
  }
  return v;
}

/** Game IDs are numeric strings; tolerate a plain integer. */
function id(o: Rec, key: string, path: string, report: Report): string | undefined {
  const v = o[key];
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : v;
  if (typeof s !== 'string' || !/^\d+$/.test(s)) {
    report(`${path}.${key}`, 'must be a numeric ID');
    return undefined;
  }
  return s;
}

/** `""` = not equipped (returns ''), otherwise the equipping character's ID. */
function location(o: Rec, path: string, report: Report): string | undefined {
  const v = o['location'];
  if (v === '' || v === undefined || v === null) return '';
  return id(o, 'location', path, report);
}

// --- Entry parsers --------------------------------------------------------------

function parseCharacter(raw: unknown, path: string, report: Report): ArchiveCharacter | undefined {
  if (!isRecord(raw)) return void report(path, 'must be an object');
  let bad = false;
  const fail: Report = (p, m) => {
    bad = true;
    report(p, m);
  };
  const charId = id(raw, 'id', path, fail);
  const name = str(raw, 'name', path, fail);
  const charPath = typeof raw['path'] === 'string' ? raw['path'] : '';
  const level = int(raw, 'level', 1, 80, path, fail);
  const ascension = int(raw, 'ascension', 0, 6, path, fail);
  const eidolon = int(raw, 'eidolon', 0, 6, path, fail);

  const skillsRaw = raw['skills'];
  let skills: ArchiveSkills | undefined;
  if (!isRecord(skillsRaw)) {
    fail(`${path}.skills`, 'must be an object');
  } else {
    const sp = `${path}.skills`;
    const basic = int(skillsRaw, 'basic', 0, 15, sp, fail);
    const skill = int(skillsRaw, 'skill', 0, 15, sp, fail);
    const ult = int(skillsRaw, 'ult', 0, 15, sp, fail);
    const talent = int(skillsRaw, 'talent', 0, 15, sp, fail);
    const elation = skillsRaw['elation'] === undefined ? undefined : int(skillsRaw, 'elation', 0, 15, sp, fail);
    if (basic !== undefined && skill !== undefined && ult !== undefined && talent !== undefined) {
      skills = { basic, skill, ult, talent, ...(elation === undefined ? {} : { elation }) };
    }
  }

  const tracesRaw = raw['traces'];
  const traces = Object.fromEntries(TRACE_KEYS.map((k) => [k, false])) as Record<TraceKey, boolean>;
  if (!isRecord(tracesRaw)) {
    fail(`${path}.traces`, 'must be an object');
  } else {
    for (const k of TRACE_KEYS) {
      const v = tracesRaw[k];
      if (v === undefined) continue; // absent = locked
      if (typeof v !== 'boolean') fail(`${path}.traces.${k}`, 'must be true or false');
      else traces[k] = v;
    }
  }

  const memoRaw = raw['memosprite'];
  let memosprite: ArchiveCharacter['memosprite'];
  if (isRecord(memoRaw)) {
    const skill = int(memoRaw, 'skill', 0, 15, `${path}.memosprite`, fail);
    const talent = int(memoRaw, 'talent', 0, 15, `${path}.memosprite`, fail);
    if (skill !== undefined && talent !== undefined) memosprite = { skill, talent };
  }
  const av = raw['ability_version'];
  const abilityVersion = typeof av === 'number' && Number.isInteger(av) && av >= 0 ? av : 0;

  if (bad || charId === undefined || name === undefined || level === undefined) return undefined;
  if (ascension === undefined || eidolon === undefined || skills === undefined) return undefined;
  return {
    id: charId,
    name,
    path: charPath,
    level,
    ascension,
    eidolon,
    skills,
    traces,
    ...(memosprite ? { memosprite } : {}),
    abilityVersion,
  };
}

function parseLightCone(raw: unknown, path: string, report: Report): ArchiveLightCone | undefined {
  if (!isRecord(raw)) return void report(path, 'must be an object');
  let bad = false;
  const fail: Report = (p, m) => {
    bad = true;
    report(p, m);
  };
  const lcId = id(raw, 'id', path, fail);
  const name = typeof raw['name'] === 'string' ? raw['name'] : '';
  const level = int(raw, 'level', 1, 80, path, fail);
  const ascension = int(raw, 'ascension', 0, 6, path, fail);
  const superimposition = int(raw, 'superimposition', 1, 5, path, fail);
  const loc = location(raw, path, fail);
  if (bad || lcId === undefined || level === undefined || ascension === undefined) return undefined;
  if (superimposition === undefined || loc === undefined) return undefined;
  return { id: lcId, name, level, ascension, superimposition, location: loc };
}

function parseSubstat(raw: unknown, path: string, report: Report): ArchiveSubstat | undefined {
  if (!isRecord(raw)) return void report(path, 'must be an object');
  const key = raw['key'];
  if (typeof key !== 'string' || !(SUBSTAT_KEYS as readonly string[]).includes(key)) {
    return void report(`${path}.key`, `unknown substat ${JSON.stringify(key)}`);
  }
  const value = raw['value'];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return void report(`${path}.value`, 'must be a non-negative number');
  }
  const count = int(raw, 'count', 0, 10, path, report);
  const step = int(raw, 'step', 0, 20, path, report);
  if (count === undefined || step === undefined) return undefined;
  return { key: key as SubstatKey, value, count, step };
}

function parseRelic(raw: unknown, path: string, report: Report): ArchiveRelic | undefined {
  if (!isRecord(raw)) return void report(path, 'must be an object');
  let bad = false;
  const fail: Report = (p, m) => {
    bad = true;
    report(p, m);
  };
  const setId = id(raw, 'set_id', path, fail);
  const setName = typeof raw['name'] === 'string' ? raw['name'] : '';
  const slot = raw['slot'];
  if (typeof slot !== 'string' || !(RELIC_SLOTS as readonly string[]).includes(slot)) {
    fail(`${path}.slot`, `unknown slot ${JSON.stringify(slot)}`);
  }
  const rarity = int(raw, 'rarity', 2, 5, path, fail);
  // Max relic level is 3 × rarity (Reliquary Archiver computes rarity as MaxLevel / 3).
  const level = rarity === undefined ? undefined : int(raw, 'level', 0, rarity * 3, path, fail);
  const mainstat = str(raw, 'mainstat', path, fail);
  const loc = location(raw, path, fail);
  const subsRaw = raw['substats'];
  const substats: ArchiveSubstat[] = [];
  if (!Array.isArray(subsRaw)) {
    fail(`${path}.substats`, 'must be an array');
  } else {
    subsRaw.forEach((s, i) => {
      // A bad substat fails the relic: its stats would otherwise be silently wrong.
      const parsed = parseSubstat(s, `${path}.substats[${i}]`, fail);
      if (parsed) substats.push(parsed);
    });
  }
  if (bad || setId === undefined || rarity === undefined || level === undefined) return undefined;
  if (mainstat === undefined || loc === undefined) return undefined;
  return { setId, setName, slot: slot as RelicSlot, rarity, level, mainstat, substats, location: loc };
}

// --- Entry point ------------------------------------------------------------------

/** `json` is the already-parsed file contents (`JSON.parse` output). */
export function parseArchive(json: unknown): ArchiveParseResult {
  const errors: ArchiveIssue[] = [];
  const error: Report = (path, message) => errors.push({ path, message });
  if (!isRecord(json)) return { ok: false, errors: [{ path: '', message: 'not a JSON object' }] };

  if (json['source'] !== ARCHIVE_SOURCE) {
    error('source', `expected "${ARCHIVE_SOURCE}", got ${JSON.stringify(json['source'])}: not a Reliquary Archiver export`);
  }
  const version = json['version'];
  if (typeof version !== 'number' || !SUPPORTED_ARCHIVE_VERSIONS.includes(version)) {
    error('version', `unsupported export version ${JSON.stringify(version)}; supported: ${SUPPORTED_ARCHIVE_VERSIONS.join(', ')}`);
  }
  for (const key of ['characters', 'light_cones', 'relics']) {
    if (!Array.isArray(json[key])) error(key, 'must be an array');
  }
  if (errors.length > 0) return { ok: false, errors };

  const warnings: ArchiveIssue[] = [];
  const warn: Report = (path, message) => warnings.push({ path, message });

  const characters: ArchiveCharacter[] = [];
  const owned = new Set<string>();
  (json['characters'] as unknown[]).forEach((raw, i) => {
    const c = parseCharacter(raw, `characters[${i}]`, warn);
    if (!c) return;
    if (owned.has(c.id)) return void warn(`characters[${i}]`, `duplicate character ${c.id}; kept the first`);
    owned.add(c.id);
    characters.push(c);
  });

  // An equipped item must belong to a parsed character, one per character (light
  // cone) or per character and slot (relic). Unequipped items are inventory: dropped.
  const lightCones: ArchiveLightCone[] = [];
  let droppedLightCones = 0;
  const lcHolders = new Set<string>();
  (json['light_cones'] as unknown[]).forEach((raw, i) => {
    const p = `light_cones[${i}]`;
    const lc = parseLightCone(raw, p, warn);
    if (!lc) return;
    if (lc.location === '') return void droppedLightCones++;
    if (!owned.has(lc.location)) return void warn(p, `equipped by unknown character ${lc.location}; skipped`);
    if (lcHolders.has(lc.location)) return void warn(p, `character ${lc.location} already has a light cone; kept the first`);
    lcHolders.add(lc.location);
    lightCones.push(lc);
  });

  const relics: ArchiveRelic[] = [];
  let droppedRelics = 0;
  const relicSlots = new Set<string>();
  (json['relics'] as unknown[]).forEach((raw, i) => {
    const p = `relics[${i}]`;
    const r = parseRelic(raw, p, warn);
    if (!r) return;
    if (r.location === '') return void droppedRelics++;
    if (!owned.has(r.location)) return void warn(p, `equipped by unknown character ${r.location}; skipped`);
    const key = `${r.location}/${r.slot}`;
    if (relicSlots.has(key)) return void warn(p, `character ${r.location} already has a ${r.slot}; kept the first`);
    relicSlots.add(key);
    relics.push(r);
  });

  return {
    ok: true,
    archive: {
      source: ARCHIVE_SOURCE,
      build: typeof json['build'] === 'string' ? json['build'] : '',
      version: version as number,
      characters,
      lightCones,
      relics,
      dropped: { lightCones: droppedLightCones, relics: droppedRelics },
    },
    warnings,
  };
}
