/**
 * D3 cross-check: the A-derived tables against source B (fribbels/hsr-optimizer,
 * MIT) at a pinned commit. B's values were not used to build the tables, so
 * agreement is independent evidence that the extraction and the level
 * formulas are right. Regenerate the reference with scripts/data/crosscheck-b.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formulas } from '../../engine';
import type { Element, StatModifier } from '../../engine';
import { DATA_TABLES, NAME_TABLES, breakLevelMultiplier, characterBase, lightConeBase, relicMainStat } from '..';
import { isFlatStat } from '../properties';

interface Reference {
  source: { repo: string; commit: string };
  characters: Record<
    string,
    {
      stats80: Record<string, number>;
      maxSp: number;
      unreleased: boolean;
      traces: Record<string, { stat: string; value: number }>;
    }
  >;
  lightCones: Record<string, { stats80: Record<string, number>; unreleased: boolean }>;
  relicMainAffixes: Record<string, Record<string, { base: number; step: number }>>;
  maxedMainStats: Record<string, number[]>;
  setDescriptions: Record<string, string>;
  namesZhTW: Record<'characters' | 'lightCones' | 'relicSets' | 'paths', Record<string, string>>;
  breakConstants: {
    levelMultiplierLv80: number;
    breakToughnessDivisor: number;
    superBreakLevelMultiplierLv80: number;
    superBreakToughnessDivisor: number;
    enemyToughnessPerDisplayedPoint: number;
    elementFactors: Record<string, number>;
  };
}

const B = JSON.parse(readFileSync(new URL('./reference-b.json', import.meta.url), 'utf8')) as Reference;

/** B's trace stat names → what our tables should hold. `null` = unsupported in the engine. */
function bTraceTarget(name: string): Pick<StatModifier, 'stat' | 'condition'> | null {
  const element = /^(\w+) DMG Boost$/.exec(name)?.[1];
  if (element) return { stat: 'dmgBoost', condition: { elements: [element.toLowerCase() as 'fire'] } };
  const map: Record<string, StatModifier['stat']> = {
    'ATK%': 'atkPct',
    'HP%': 'hpPct',
    'DEF%': 'defPct',
    SPD: 'spdFlat',
    'CRIT Rate': 'critRate',
    'CRIT DMG': 'critDmg',
    'Effect Hit Rate': 'effectHitRate',
    'Effect RES': 'effectRes',
    'Break Effect': 'breakEffect',
  };
  if (name === 'Elation') return null;
  const stat = map[name];
  if (!stat) throw new Error(`unmapped B trace stat ${name}`);
  return { stat };
}

/** B's `statCalculator.ts` stat constants → game property. */
const B_MAIN_STAT: Record<string, string> = {
  HP: 'HPDelta',
  ATK: 'AttackDelta',
  HP_P: 'HPAddedRatio',
  ATK_P: 'AttackAddedRatio',
  DEF_P: 'DefenceAddedRatio',
  SPD: 'SpeedDelta',
  CR: 'CriticalChanceBase',
  CD: 'CriticalDamageBase',
  OHB: 'HealRatioBase',
  EHR: 'StatusProbabilityBase',
  BE: 'BreakDamageAddedRatioBase',
  ERR: 'SPRatioBase',
  Physical_DMG: 'PhysicalAddedRatio',
  Fire_DMG: 'FireAddedRatio',
  Ice_DMG: 'IceAddedRatio',
  Lightning_DMG: 'ThunderAddedRatio',
  Wind_DMG: 'WindAddedRatio',
  Quantum_DMG: 'QuantumAddedRatio',
  Imaginary_DMG: 'ImaginaryAddedRatio',
};

describe('cross-check against B (fribbels/hsr-optimizer)', () => {
  it('uses the pinned B commit', () => {
    expect(B.source.commit).toBe('dd0c4af98ea95ddde2abe38cb9a4443cc8b2f13d');
  });

  describe('released content', () => {
    it('every character and light cone is in B and not flagged unreleased', () => {
      for (const c of DATA_TABLES.characters) expect(B.characters[c.id]?.unreleased, c.id).toBe(false);
      for (const l of DATA_TABLES.lightCones) expect(B.lightCones[l.id]?.unreleased, l.id).toBe(false);
    });

    it('known coverage gap: B characters missing from A (see DATA_SOURCES.md)', () => {
      const ours = new Set(DATA_TABLES.characters.map((c) => c.id));
      const missing = Object.entries(B.characters)
        .filter(([id, c]) => /^\d+$/.test(id) && !c.unreleased && !ours.has(id))
        .map(([id]) => id);
      expect(missing).toEqual(['1014', '1015', '1508', '1509']);
    });
  });

  it('character base stats at level 80 (A: base + perLevel × 79) match B', () => {
    for (const c of DATA_TABLES.characters) {
      const last = c.ascensions.length - 1;
      const r = characterBase(DATA_TABLES, c.id, 80, last);
      const b = B.characters[c.id]!.stats80;
      expect(r.ok, c.id).toBe(true);
      if (!r.ok) continue;
      expect(r.value.base.hp, `${c.id} HP`).toBeCloseTo(b['HP']!, 6);
      expect(r.value.base.atk, `${c.id} ATK`).toBeCloseTo(b['ATK']!, 6);
      expect(r.value.base.def, `${c.id} DEF`).toBeCloseTo(b['DEF']!, 6);
      expect(r.value.base.spd, `${c.id} SPD`).toBe(b['SPD']);
      expect(r.value.critRate, `${c.id} CR`).toBe(b['CRIT Rate']);
      expect(r.value.critDmg, `${c.id} CD`).toBe(b['CRIT DMG']);
    }
  });

  it('ultimate Energy cost (A: SPNeed) matches B (max_sp), except 1407', () => {
    // 1407 (遐蝶): her Ultimate uses its own charge, not Energy. A has no SPNeed (0);
    // B stores 120 as a placeholder. A is right (DATA_SOURCES.md § Ultimate Energy cost).
    const differ = DATA_TABLES.characters.filter((c) => c.energyCost !== B.characters[c.id]!.maxSp);
    expect(differ.map((c) => [c.id, c.energyCost])).toEqual([['1407', 0]]);
  });

  it('light cone base stats at level 80 match B', () => {
    for (const l of DATA_TABLES.lightCones) {
      const r = lightConeBase(DATA_TABLES, l.id, 80, l.ascensions.length - 1);
      const b = B.lightCones[l.id]!.stats80;
      expect(r.ok, l.id).toBe(true);
      if (!r.ok) continue;
      expect(r.value.hp, `${l.id} HP`).toBeCloseTo(b['HP']!, 6);
      expect(r.value.atk, `${l.id} ATK`).toBeCloseTo(b['ATK']!, 6);
      expect(r.value.def, `${l.id} DEF`).toBeCloseTo(b['DEF']!, 6);
    }
  });

  it('relic main stat base/step per group equal B exactly', () => {
    for (const r of DATA_TABLES.relicMainStats) {
      const b = B.relicMainAffixes[String(r.groupId)]?.[r.property];
      expect(b, `${r.groupId} ${r.property}`).toBeDefined();
      expect(r.value.base).toBe(b!.base);
      expect(r.value.perLevel).toBe(b!.step);
    }
  });

  it('relic main stats at max level (A: base + perLevel × level) match B to 3 decimals', () => {
    let checked = 0;
    for (const [bName, values] of Object.entries(B.maxedMainStats)) {
      const property = B_MAIN_STAT[bName];
      expect(property, bName).toBeDefined();
      values.forEach((bValue, i) => {
        const rarity = i + 2;
        const rows = DATA_TABLES.relicMainStats.filter((r) => r.property === property && r.rarity === rarity);
        expect(rows.length, `${bName} ${rarity}★`).toBeGreaterThan(0);
        for (const row of rows) {
          const r = relicMainStat(DATA_TABLES, row.slot, rarity, row.exportName, row.maxLevel);
          expect(r.ok).toBe(true);
          if (!r.ok) continue;
          const flat = row.target ? isFlatStat(row.target.stat) : false;
          // B lists flat values as is and percentages in percent units, rounded to 3 decimals.
          expect(r.value.value * (flat ? 1 : 100), `${bName} ${rarity}★ ${row.slot}`).toBeCloseTo(bValue, 3);
          checked++;
        }
      });
    }
    expect(checked).toBe(DATA_TABLES.relicMainStats.length);
  });

  it('stat traces match B trace trees (stat and value)', () => {
    for (const t of DATA_TABLES.traces) {
      const key = t.tree === 'base' ? t.characterId : `${t.characterId}b1`;
      const b = B.characters[key]?.traces[t.pointId];
      expect(b, `${key} ${t.pointId}`).toBeDefined();
      const target = bTraceTarget(b!.stat);
      const [ours] = t.modifiers;
      if (target === null) {
        expect(t.modifiers).toEqual([]);
        expect(t.unsupported[0]?.value).toBeCloseTo(b!.value, 6);
      } else {
        expect(t.modifiers.length + t.unsupported.length, t.pointId).toBe(1);
        expect(ours?.stat, t.pointId).toBe(target.stat);
        expect(ours?.condition, t.pointId).toEqual(target.condition);
        expect(ours?.value, t.pointId).toBeCloseTo(b!.value, 6);
      }
    }
  });

  it("each 2-piece value appears in B's set description", () => {
    for (const s of DATA_TABLES.setBonuses) {
      const text = B.setDescriptions[s.setId];
      expect(text, s.setId).toBeDefined();
      for (const v of [...s.modifiers.map((m) => m.value), ...s.unsupported.map((u) => u.value)]) {
        const pct = `${Number((v * 100).toFixed(4))}%`; // 0.12 → "12%"
        expect(text, `${s.setId} ${pct}`).toContain(pct);
      }
    }
  });
});

/**
 * Names: A's Traditional Chinese text against B's zh_TW locale file. B builds
 * its names from the same game text, so agreement mainly confirms that the
 * text-hash join picks the right row. Every difference at the pinned commits
 * is listed here with its reason; a new one fails the test.
 */
describe('zh-Hant names against B (public/locales/zh_TW/gameData.yaml)', () => {
  const NAMES = B.namesZhTW;
  /** B marks some characters with a "⚰️ " prefix of its own; it is not game text. */
  const bName = (name: string | undefined): string | undefined => name?.replace(/^⚰️ /, '');
  /** B's zh_TW file still has Simplified Chinese for these; A has the Traditional text. */
  const B_SIMPLIFIED = { lightCones: { '23055': '献给明日的色彩' }, relicSets: { '133': '戏梦点星的伶人', '134': '贪噬禁果的异端' } };
  /** B shows the Trailblazer's default names; A has the nickname placeholder (`name: null`) and a gender. */
  const B_TRAILBLAZER = { male: '穹', female: '星' } as const;

  it('path names equal B', () => {
    for (const p of NAME_TABLES.paths) expect(NAMES.paths[p.id], p.id).toBe(p.name);
  });

  it('character names equal B, except the Trailblazer', () => {
    for (const c of NAME_TABLES.characters) {
      const b = bName(NAMES.characters[c.id]);
      if (c.name === null) expect(b, c.id).toBe(B_TRAILBLAZER[c.gender!]);
      else expect(b, c.id).toBe(c.name);
    }
  });

  it('light cone and relic set names equal B, except the listed Simplified entries', () => {
    const check = (records: readonly { key: string; name: string }[], b: Record<string, string>, simplified: Record<string, string>) => {
      for (const r of records) expect(b[r.key], r.key).toBe(simplified[r.key] ?? r.name);
      // Each listed exception must still be a real difference, or it should be removed.
      for (const [key, text] of Object.entries(simplified)) expect(records.find((r) => r.key === key)?.name).not.toBe(text);
    };
    check(NAME_TABLES.lightCones.map((l) => ({ key: l.id, name: l.name })), NAMES.lightCones, B_SIMPLIFIED.lightCones);
    check(NAME_TABLES.relicSets.map((s) => ({ key: s.setId, name: s.name })), NAMES.relicSets, B_SIMPLIFIED.relicSets);
  });
});

/**
 * E4: Break and Super Break DMG against B's damageCalculator.ts and
 * calculateContext.ts. B fixes the attacker at level 80 and stores enemy
 * Toughness ×3 (its form labels it `toughness / 3`); the engine takes
 * displayed Toughness, so B's `0.5 + T×3 / 120` must equal our `0.5 + T / 40`.
 */
describe('Break DMG constants against B', () => {
  const K = B.breakConstants;

  it("A's level-80 multiplier equals B's constant to 3 decimals (A 3767.5535, B 3767.5533)", () => {
    const a = breakLevelMultiplier(DATA_TABLES, 80);
    expect(a.ok && a.value).toBeCloseTo(K.levelMultiplierLv80, 3);
    expect(K.superBreakLevelMultiplierLv80).toBe(K.levelMultiplierLv80);
  });

  it('element factors equal B', () => {
    const b = Object.fromEntries(Object.entries(K.elementFactors).map(([el, v]) => [el.toLowerCase() as Element, v]));
    expect(formulas.BREAK_ELEMENT_FACTOR).toEqual(b);
  });

  it("Break and Super Break bases equal B's formulas once Toughness units are converted", () => {
    const level = K.levelMultiplierLv80;
    for (const displayed of [30, 120, 160, 240]) {
      const bInternal = displayed * K.enemyToughnessPerDisplayedPoint;
      const bBreak = level * 2 * (0.5 + bInternal / K.breakToughnessDivisor);
      expect(formulas.breakBaseDmg(level, 2, displayed, 1), String(displayed)).toBeCloseTo(bBreak, 9);
    }
    // B: (level / 10) × ((1 + efficiency) × toughnessDmg + fixed), toughnessDmg in displayed units.
    const toughness = formulas.superBreakToughness(20, 0.5, 5);
    expect(formulas.superBreakBaseDmg(level, toughness, 1)).toBeCloseTo((level / K.superBreakToughnessDivisor) * toughness, 9);
  });
});
