/**
 * Skill kit generator (auto battle prefill, 2026-11-08): source A's Basic ATK,
 * Skill and Ultimate rows → `SkillKitRecord`s. Pure; `extract.ts` does the I/O.
 *
 * The damage of a skill is read from the game's own Traditional Chinese
 * description template, which names each multiplier as `#k[i]%` = the k-th
 * value of the row's `ParamList`. The parser is deliberately strict: it only
 * accepts sentences of the form "對<area>造成等同於<name>#k[i]%<stat>的<element>屬性傷害"
 * whose area matches the row's `SkillEffect`. Everything else (bounces,
 * random targets, hit counts, extra or conditional damage, multi-stat
 * multipliers) is marked `unsupported` and stays manual. Rules and tags:
 * docs/FORMULAS.md § Skill kit templates.
 */
import { DAMAGE_TYPE_ELEMENTS } from '../../src/data/properties.ts';
import type { KitSlot, SkillDamageRecord, SkillRecord, TraceTree } from '../../src/data/schema.ts';
import type { Element } from '../../src/engine/types.ts';
import type { TextHash } from './sourceA.ts';

interface Num {
  Value?: number;
}

export interface RawSkill {
  SkillID: number;
  Level: number;
  SkillName?: TextHash;
  SkillDesc?: TextHash;
  AttackType?: string;
  SkillEffect?: string;
  StanceDamageType?: string;
  SPBase?: Num;
  BPAdd?: Num;
  BPNeed?: Num;
  ParamList: Num[];
}
export interface RawSkillTreeSkills {
  PointID: number;
  Level: number;
  AvatarID: number;
  AnchorType: string;
  LevelUpSkillID: number[];
}
export interface RawRank {
  RankID: number;
  Rank: number;
  SkillAddLevelList: Record<string, number>;
}
export interface RawSkillsA {
  avatars: { AvatarID: number; DamageType: string; Release?: boolean; RankIDList?: number[] }[];
  skillTree: RawSkillTreeSkills[];
  skills: RawSkill[];
  ranks: RawRank[];
  /** `TextMap/TextMapCHT.json`: hash → text. */
  textMap: Record<string, string>;
}

export interface SkillKitRow {
  characterId: string;
  tree: TraceTree;
  skills: SkillRecord[];
  eidolonLevels: { eidolon: number; slot: KitSlot; add: number }[];
}

const ANCHOR_SLOTS: Readonly<Record<string, KitSlot>> = { Point01: 'basic', Point02: 'skill', Point03: 'ultimate' };
/** The `AttackType` each slot's normal version must have, as a format check. */
const SLOT_ATTACK_TYPE: Readonly<Record<KitSlot, string>> = { basic: 'Normal', skill: 'BPSkill', ultimate: 'Ultra' };

/** Element names as the CHT descriptions write them. */
const ELEMENT_TEXT: Readonly<Record<string, Element>> = {
  物理: 'physical', 火: 'fire', 冰: 'ice', 雷: 'lightning', 風: 'wind', 量子: 'quantum', 虛數: 'imaginary',
};
const STAT_TEXT: Readonly<Record<string, SkillDamageRecord['scaling']>> = { 攻擊力: 'atk', 生命上限: 'hp', 防禦力: 'def' };

/** One damage sentence. Group 1 is the clause before 造成 (who is hit). */
const DAMAGE_CLAUSE = /([^。，\n]*?)造成等同於[^#，。+]{0,12}#(\d+)\[(?:i|f\d)\]%(攻擊力|生命上限|防禦力)的(物理|火|冰|雷|風|量子|虛數)屬性傷害/g;
/** Accepted "who is hit" clauses. Anything else (random, each segment, at most, …) is unsupported. */
const TARGET_CLAUSE = /^(?:並|同時|且|隨後|此外)?(對指定敵方單體(?:目標)?|對該目標|對其|對所選目標|對敵方全體(?:目標)?|對全體(?:敵方目標)?|對其?相鄰目標)?$/;
/** Damage the clause parser did not read. */
const UNREAD_DAMAGE = /造成等同於|額外造成|次傷害|段傷害|造成#|附加傷害|追加攻擊|彈射|最多造成/;
const DAMAGE_EFFECTS: Readonly<Record<string, readonly SkillDamageRecord['area'][]>> = {
  SingleAttack: ['target'],
  Blast: ['target', 'adjacent'],
  AoEAttack: ['all'],
};

/** Strips markup; the text map writes line breaks as a literal `\n`. */
export function plainDescription(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\\n|\n/g, '。');
}

export interface ParsedDamage {
  readonly damage: readonly { area: SkillDamageRecord['area']; scaling: SkillDamageRecord['scaling']; param: number; element: Element }[];
  readonly unsupported?: string;
  readonly otherEffects: boolean;
}

/** Reads the damage sentences of one description for a row with `skillEffect`. */
export function parseDamage(description: string, skillEffect: string): ParsedDamage {
  const text = plainDescription(description);
  const matches = [...text.matchAll(DAMAGE_CLAUSE)];
  const rest = text.replace(DAMAGE_CLAUSE, '');
  const otherEffects = rest.replace(/[。，\s]/g, '').length > 0;
  const fail = (unsupported: string): ParsedDamage => ({ damage: [], unsupported, otherEffects });

  const damage: ParsedDamage['damage'][number][] = [];
  const expected = DAMAGE_EFFECTS[skillEffect];
  for (const m of matches) {
    const who = (m[1] ?? '').trim();
    const target = TARGET_CLAUSE.exec(who);
    if (!target) return fail(`unrecognised target "${who}"`);
    const area = (target[1] ?? '').includes('相鄰') ? 'adjacent' : skillEffect === 'AoEAttack' ? 'all' : 'target';
    damage.push({
      area,
      scaling: STAT_TEXT[m[3] ?? '']!,
      param: Number(m[2]),
      element: ELEMENT_TEXT[m[4] ?? '']!,
    });
  }
  if (UNREAD_DAMAGE.test(rest)) return fail('damage the parser cannot read');
  if (damage.length === 0) {
    return expected || skillEffect === 'Bounce' ? fail(`no damage sentence for ${skillEffect}`) : { damage, otherEffects };
  }
  if (!expected) return fail(`effect ${skillEffect} is not supported`);
  const areas = damage.map((d) => d.area);
  if (areas.length !== expected.length || areas.some((a, i) => a !== expected[i])) {
    return fail(`damage areas ${areas.join('+')} do not match ${skillEffect}`);
  }
  return { damage, otherEffects };
}

const v = (n: Num | undefined): number => n?.Value ?? 0;

export function transformSkills(raw: RawSkillsA): SkillKitRow[] {
  const rowsBySkill = new Map<number, RawSkill[]>();
  for (const s of raw.skills) {
    const list = rowsBySkill.get(s.SkillID) ?? [];
    list.push(s);
    rowsBySkill.set(s.SkillID, list);
  }
  const text = (h: TextHash | undefined, where: string): string => {
    const t = h ? raw.textMap[h.Hash] : undefined;
    if (t === undefined) throw new Error(`${where}: text hash ${h?.Hash ?? '(none)'} is not in the text map`);
    return t;
  };
  const rankById = new Map(raw.ranks.map((r) => [r.RankID, r]));

  const out: SkillKitRow[] = [];
  for (const avatar of raw.avatars.filter((a) => a.Release).sort((x, y) => x.AvatarID - y.AvatarID)) {
    const id = avatar.AvatarID;
    const points = raw.skillTree.filter((p) => p.AvatarID === id && p.Level === 1 && p.AnchorType in ANCHOR_SLOTS);
    // The enhanced tree's point IDs carry an extra leading 1 (e.g. 11102001 for 1102001).
    const basePoints = points.filter((p) => String(p.PointID).startsWith(String(id)));
    const trees: [TraceTree, RawSkillTreeSkills[]][] = [
      ['base', basePoints],
      ['enhanced', points.filter((p) => String(p.PointID).startsWith(`1${id}`))],
    ];
    const baseSlotOf = new Map<number, KitSlot>();
    for (const p of basePoints) for (const s of p.LevelUpSkillID) baseSlotOf.set(s, ANCHOR_SLOTS[p.AnchorType]!);

    const eidolonLevels: SkillKitRow['eidolonLevels'] = [];
    for (const rankId of avatar.RankIDList ?? []) {
      const rank = rankById.get(rankId);
      if (!rank) throw new Error(`character ${id}: rank ${rankId} is missing`);
      for (const [skillId, add] of Object.entries(rank.SkillAddLevelList)) {
        const slot = baseSlotOf.get(Number(skillId));
        // Talent and memosprite levels do not change a kit template.
        if (slot && !eidolonLevels.some((e) => e.eidolon === rank.Rank && e.slot === slot)) {
          eidolonLevels.push({ eidolon: rank.Rank, slot, add });
        }
      }
    }

    for (const [tree, treePoints] of trees) {
      if (treePoints.length === 0) continue;
      const skills: SkillRecord[] = [];
      for (const point of treePoints.sort((x, y) => x.AnchorType.localeCompare(y.AnchorType))) {
        const slot = ANCHOR_SLOTS[point.AnchorType]!;
        point.LevelUpSkillID.forEach((skillId, variant) => {
          const where = `character ${id} skill ${skillId}`;
          const rows = (rowsBySkill.get(skillId) ?? []).slice().sort((x, y) => x.Level - y.Level);
          if (rows.length === 0) return; // listed but has no rows: nothing to offer
          rows.forEach((r, i) => {
            if (r.Level !== i + 1) throw new Error(`${where}: levels are not 1..${rows.length}`);
          });
          const first = rows[0]!;
          for (const r of rows) {
            if (v(r.SPBase) !== v(first.SPBase) || v(r.BPAdd) !== v(first.BPAdd) || v(r.BPNeed) !== v(first.BPNeed)) {
              throw new Error(`${where}: Energy or skill points change with level`);
            }
          }
          if (variant === 0 && first.AttackType !== SLOT_ATTACK_TYPE[slot]) {
            throw new Error(`${where}: ${slot} has AttackType ${first.AttackType}`);
          }
          const element = DAMAGE_TYPE_ELEMENTS[first.StanceDamageType ?? avatar.DamageType];
          if (!element) throw new Error(`${where}: unknown element ${first.StanceDamageType}`);
          // Some extra variants have no text; only the normal version must have it.
          const optional = (h: TextHash | undefined) => (variant > 0 && !(h && h.Hash in raw.textMap) ? undefined : text(h, where));
          const description = optional(first.SkillDesc);
          const parsed: ParsedDamage = description === undefined
            ? { damage: [], unsupported: 'no description', otherEffects: false }
            : parseDamage(description, first.SkillEffect ?? '');
          let unsupported = parsed.unsupported;
          const damage: SkillDamageRecord[] = [];
          for (const d of parsed.damage) {
            if (d.element !== element) {
              unsupported = `description element ${d.element} differs from ${element}`;
              break;
            }
            const multipliers = rows.map((r) => r.ParamList[d.param - 1]?.Value);
            if (multipliers.some((m) => m === undefined)) throw new Error(`${where}: #${d.param} is not in ParamList`);
            damage.push({ area: d.area, scaling: d.scaling, multipliers: multipliers as number[] });
          }
          skills.push({
            skillId: String(skillId),
            slot,
            variant,
            name: optional(first.SkillName) ?? '',
            element,
            energy: v(first.SPBase),
            skillPointGain: v(first.BPAdd),
            skillPointCost: Math.max(0, v(first.BPNeed)),
            maxLevel: rows.length,
            damage: unsupported ? [] : damage,
            ...(unsupported ? { unsupported } : {}),
            otherEffects: parsed.otherEffects,
          });
        });
      }
      out.push({ characterId: String(id), tree, skills, eidolonLevels });
    }
  }
  return out;
}
