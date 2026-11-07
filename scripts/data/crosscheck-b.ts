/**
 * Writes the cross-check reference `src/data/__tests__/reference-b.json`
 * from source B (fribbels/hsr-optimizer, MIT) at a pinned commit. The app
 * never reads this file: only `crosscheck-b.test.ts` compares the A-derived
 * tables with it. See docs/DATA_SOURCES.md § Decision.
 *
 *   node scripts/data/crosscheck-b.ts              # fetch from GitHub
 *   node scripts/data/crosscheck-b.ts --from DIR   # read DIR/game_data.json etc.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_B = {
  repo: 'fribbels/hsr-optimizer',
  commit: 'dd0c4af98ea95ddde2abe38cb9a4443cc8b2f13d',
  files: {
    gameData: 'src/data/game_data.json',
    mainAffixes: 'src/data/relic_main_affixes.json',
    statCalculator: 'src/lib/relics/statCalculator.ts',
    namesZhTW: 'public/locales/zh_TW/gameData.yaml',
    damageCalculator: 'src/lib/optimization/engine/damage/damageCalculator.ts',
    calculateContext: 'src/lib/optimization/context/calculateContext.ts',
    enemyDrawer: 'src/lib/tabs/tabOptimizer/optimizerForm/components/EnemyConfigurationsDrawer.tsx',
  },
} as const;

const match = (text: string, re: RegExp, what: string): RegExpExecArray => {
  const m = re.exec(text);
  if (!m) throw new Error(`${what} not found`);
  return m;
};

/**
 * B's Break and Super Break constants (E4), read from its source code. B fixes
 * the attacker at level 80, so its level multiplier is a single constant.
 */
function readBreakConstants(damageCalculator: string, calculateContext: string, enemyDrawer: string): object {
  const brk = match(
    damageCalculator,
    /const breakBaseMulti = ([\d.]+) \* context\.elementalBreakScaling\s*\* \(0\.5 \+ context\.enemyMaxToughness \/ (\d+)\)/,
    'BreakDamageFunction base',
  );
  const sup = match(damageCalculator, /const superBreakBaseMulti = \(([\d.]+) \/ (\d+)\) \* effectiveToughness/, 'SuperBreak base');
  const block = match(calculateContext, /const ElementToBreakScaling = \{([^}]*)\}/, 'ElementToBreakScaling')[1]!;
  const elementFactors = Object.fromEntries(
    [...block.matchAll(/(\w+):\s*([\d.]+)/g)].map((m) => [m[1]!, Number(m[2])]),
  );
  // The enemy form stores Toughness ×3 and labels it `toughness / 3`.
  const display = match(enemyDrawer, /label: t\('ToughnessOptionLabel', \{ toughness: toughness \/ (\d+) \}\)/, 'toughness label');
  return {
    levelMultiplierLv80: Number(brk[1]),
    breakToughnessDivisor: Number(brk[2]),
    superBreakLevelMultiplierLv80: Number(sup[1]),
    superBreakToughnessDivisor: Number(sup[2]),
    enemyToughnessPerDisplayedPoint: Number(display[1]),
    elementFactors,
  };
}

type NameSection = Record<string, string>;

/**
 * Reads the `Name` of each entry (and the flat `Paths` map) from B's
 * zh_TW `gameData.yaml`. The file is two levels deep with unquoted values, so
 * a line reader is enough; anything else fails loudly instead of being guessed.
 */
function readZhTwNames(yaml: string): { characters: NameSection; lightCones: NameSection; relicSets: NameSection; paths: NameSection } {
  const sections: Record<string, NameSection> = {};
  let section: NameSection | undefined;
  let entry: string | undefined;
  let flat = false;
  for (const line of yaml.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const top = /^(\w+):$/.exec(line);
    if (top) {
      section = sections[top[1]!] = {};
      flat = top[1] === 'Paths' || top[1] === 'Elements';
      continue;
    }
    if (!section) throw new Error(`gameData.yaml: line outside a section: ${line}`);
    const key = /^ {2}"?([^\s":][^":]*)"?:\s*(.*)$/.exec(line);
    if (key) {
      entry = key[1]!;
      if (flat) section[entry] = key[2]!;
      continue;
    }
    const field = /^ {4}(\w+):\s*(.*)$/.exec(line);
    if (field && entry !== undefined) {
      const value = field[2]!;
      if (field[1] !== 'Name') continue;
      if (/^["'|>]/.test(value) || value === '') throw new Error(`gameData.yaml: unsupported Name value for ${entry}: ${value}`);
      section[entry] = value;
      continue;
    }
    // Deeper lines belong to multi-line description values, which are not read.
    if (!/^ {6}/.test(line)) throw new Error(`gameData.yaml: unexpected line: ${line}`);
  }
  const need = (name: string): NameSection => {
    const s = sections[name];
    if (!s) throw new Error(`gameData.yaml: no ${name} section`);
    return s;
  };
  return { characters: need('Characters'), lightCones: need('Lightcones'), relicSets: need('RelicSets'), paths: need('Paths') };
}

async function load(path: string, fromDir: string | undefined): Promise<string> {
  const name = path.split('/').pop() ?? path;
  if (fromDir) return readFileSync(join(fromDir, name), 'utf8');
  const url = `https://raw.githubusercontent.com/${SOURCE_B.repo}/${SOURCE_B.commit}/${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

interface TraceNode {
  id: string;
  stat: string;
  value: number;
  children: TraceNode[];
}
interface BCharacter {
  stats: Record<string, number>;
  traceTree: TraceNode[];
  unreleased?: boolean;
}
interface BLightCone {
  stats: Record<string, number>;
  unreleased?: boolean;
}
interface BGameData {
  characters: Record<string, BCharacter>;
  lightCones: Record<string, BLightCone>;
  relics: { id: string; skills: string }[];
}
type BMainAffixes = Record<string, { affixes: Record<string, { property: string; base: number; step: number }> }>;

function flatten(nodes: readonly TraceNode[], out: Record<string, { stat: string; value: number }>): void {
  for (const n of nodes) {
    out[n.id] = { stat: n.stat, value: n.value };
    flatten(n.children, out);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fromIndex = args.indexOf('--from');
  const fromDir = fromIndex >= 0 ? args[fromIndex + 1] : undefined;

  const game = JSON.parse(await load(SOURCE_B.files.gameData, fromDir)) as BGameData;
  const affixes = JSON.parse(await load(SOURCE_B.files.mainAffixes, fromDir)) as BMainAffixes;
  const calc = await load(SOURCE_B.files.statCalculator, fromDir);
  const namesZhTW = readZhTwNames(await load(SOURCE_B.files.namesZhTW, fromDir));
  const breakConstants = readBreakConstants(
    await load(SOURCE_B.files.damageCalculator, fromDir),
    await load(SOURCE_B.files.calculateContext, fromDir),
    await load(SOURCE_B.files.enemyDrawer, fromDir),
  );

  // `maxedMainStats` in statCalculator.ts: [Constants.Stats.X]: [r2, r3, r4, r5] at max level.
  const block = /const maxedMainStats = \{([\s\S]*?)\n\}/.exec(calc)?.[1];
  if (!block) throw new Error('maxedMainStats not found in statCalculator.ts');
  const maxedMainStats: Record<string, number[]> = {};
  for (const m of block.matchAll(/\[Constants\.Stats\.(\w+)\]:\s*\[([^\]]+)\]/g)) {
    maxedMainStats[m[1]!] = m[2]!.split(',').map((s) => Number(s.trim()));
  }

  const characters: Record<string, object> = {};
  for (const [id, c] of Object.entries(game.characters)) {
    const traces: Record<string, { stat: string; value: number }> = {};
    flatten(c.traceTree, traces);
    characters[id] = { stats80: c.stats, unreleased: Boolean(c.unreleased), traces };
  }
  const lightCones: Record<string, object> = {};
  for (const [id, l] of Object.entries(game.lightCones)) {
    lightCones[id] = { stats80: l.stats, unreleased: Boolean(l.unreleased) };
  }
  const relicMainAffixes: Record<string, Record<string, { base: number; step: number }>> = {};
  for (const [group, g] of Object.entries(affixes)) {
    relicMainAffixes[group] = Object.fromEntries(Object.values(g.affixes).map((a) => [a.property, { base: a.base, step: a.step }]));
  }
  const setDescriptions = Object.fromEntries(game.relics.map((r) => [r.id, r.skills]));

  const reference = {
    _note: 'CROSS-CHECK REFERENCE for tests only; the app never reads it. Generated by scripts/data/crosscheck-b.ts.',
    _license: 'From fribbels/hsr-optimizer, MIT License, Copyright (c) 2024 Fribbels.',
    source: { repo: SOURCE_B.repo, commit: SOURCE_B.commit, files: Object.values(SOURCE_B.files) },
    characters,
    lightCones,
    relicMainAffixes,
    maxedMainStats,
    setDescriptions,
    namesZhTW,
    breakConstants,
  };
  const out = join(dirname(fileURLToPath(import.meta.url)), '../../src/data/__tests__/reference-b.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(reference, null, 1)}\n`);
  console.log(
    `reference-b.json: ${Object.keys(characters).length} characters, ${Object.keys(lightCones).length} light cones, ` +
      `${Object.keys(relicMainAffixes).length} main-affix groups, ${Object.keys(maxedMainStats).length} maxed main stats`,
  );
}

await main();
