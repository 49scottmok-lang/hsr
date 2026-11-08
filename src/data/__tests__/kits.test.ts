import { describe, expect, it } from 'vitest';
import { kitTemplate, effectiveSkillLevel, skillKit, SKILL_TABLES } from '..';
import type { SkillKitRecord, SkillTables } from '..';

// TEST FIXTURE — NOT GAME DATA.
const source = { repo: 'test/test', commit: '0'.repeat(40), files: ['test.json'] };
const kit: SkillKitRecord = {
  characterId: '9001',
  tree: 'base',
  source,
  gameVersion: '0.0.0',
  eidolonLevels: [{ eidolon: 3, slot: 'skill', add: 2 }, { eidolon: 5, slot: 'basic', add: 1 }],
  skills: [
    { skillId: '1', slot: 'basic', variant: 0, name: 'B', element: 'fire', energy: 20, skillPointGain: 1, skillPointCost: 0, maxLevel: 3,
      damage: [{ area: 'target', scaling: 'atk', multipliers: [0.5, 0.6, 0.7] }], otherEffects: false },
    { skillId: '2', slot: 'skill', variant: 0, name: 'S', element: 'fire', energy: 30, skillPointGain: 0, skillPointCost: 1, maxLevel: 4,
      damage: [
        { area: 'target', scaling: 'atk', multipliers: [1, 1.1, 1.2, 1.3] },
        { area: 'adjacent', scaling: 'atk', multipliers: [0.4, 0.44, 0.48, 0.52] },
      ], otherEffects: true },
    { skillId: '3', slot: 'ultimate', variant: 0, name: 'U', element: 'fire', energy: 5, skillPointGain: 0, skillPointCost: 0, maxLevel: 2,
      damage: [], unsupported: 'bounces', otherEffects: true },
    // A variant is never used for the template.
    { skillId: '4', slot: 'basic', variant: 1, name: 'B+', element: 'fire', energy: 30, skillPointGain: 0, skillPointCost: 0, maxLevel: 3,
      damage: [{ area: 'all', scaling: 'atk', multipliers: [9, 9, 9] }], otherEffects: false },
  ],
};
const tables: SkillTables = { kits: [kit] };
const enemyIds = ['e1', 'e2', 'e3'];

describe('kitTemplate', () => {
  it('fills supported actions at the eidolon-adjusted level and lists the gaps', () => {
    const r = kitTemplate(tables, { characterId: '9001', eidolon: 3, levels: { basic: 2, skill: 2, ultimate: 1 }, targetId: 'e2', enemyIds });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // E3 adds 2 skill levels (2 → 4); the basic bonus is E5, so it stays 2.
    expect(r.value.actions.basic).toEqual({
      skillId: '1', name: 'B', level: 2, energy: 20, skillPoints: 1, otherEffects: false,
      steps: [{ op: 'hit', hit: { targetId: 'e2', scaling: 'atk', multiplier: 0.6, element: 'fire', tags: ['basic'], label: 'B' } }],
    });
    // Blast on the middle enemy: main e2 at L4 (1.3), neighbours e1 and e3 at L4 (0.52).
    expect(r.value.actions.skill?.steps.map((s) => s.op === 'hit' && [s.hit.targetId, s.hit.multiplier])).toEqual([
      ['e2', 1.3], ['e1', 0.52], ['e3', 0.52],
    ]);
    expect(r.value.actions.skill).toMatchObject({ level: 4, skillPoints: 1, energy: 30, otherEffects: true });
    expect(r.value.actions.ultimate).toBeUndefined();
    expect(r.value.gaps).toEqual([{ slot: 'ultimate', reason: 'unsupported', detail: 'bounces' }]);
    expect(r.value.source).toBe(source);
  });

  it('a Blast on the edge enemy has one neighbour', () => {
    const r = kitTemplate(tables, { characterId: '9001', levels: { basic: 1, skill: 1, ultimate: 1 }, targetId: 'e1', enemyIds });
    expect(r.ok && r.value.actions.skill?.steps.map((s) => s.op === 'hit' && s.hit.targetId)).toEqual(['e1', 'e2']);
  });

  it('reports levels outside the table, or missing, as gaps', () => {
    const r = kitTemplate(tables, { characterId: '9001', eidolon: 5, levels: { basic: 3, skill: NaN, ultimate: 1 }, targetId: 'e1', enemyIds });
    expect(r.ok && r.value.gaps.map((g) => [g.slot, g.reason])).toEqual([['basic', 'level'], ['skill', 'level'], ['ultimate', 'unsupported']]);
    expect(r.ok && Object.keys(r.value.actions)).toEqual([]);
  });

  it('misses unknown characters, trees and targets', () => {
    const levels = { basic: 1, skill: 1, ultimate: 1 };
    expect(kitTemplate(tables, { characterId: '9999', levels, targetId: 'e1', enemyIds }).ok).toBe(false);
    expect(kitTemplate(tables, { characterId: '9001', tree: 'enhanced', levels, targetId: 'e1', enemyIds }).ok).toBe(false);
    expect(kitTemplate(tables, { characterId: '9001', levels, targetId: 'x', enemyIds }).ok).toBe(false);
  });

  it('effectiveSkillLevel sums every bonus up to the eidolon', () => {
    expect(effectiveSkillLevel(kit, 'basic', 6, 4)).toBe(6);
    expect(effectiveSkillLevel(kit, 'basic', 6, 5)).toBe(7);
  });
});

/**
 * Cross-check of the generated table (A, parsed from the description) against
 * B's hand-written multipliers, fribbels/hsr-optimizer@dd0c4af
 * `src/lib/conditionals/character/<group>/<Name>.ts`. B gives each value at
 * the max tree level and at the E3/E5-boosted level: Basic ATK 6 / 7,
 * Skill and Ultimate 10 / 12.
 */
describe('generated skill kits against B', () => {
  const multiplier = (id: string, slot: 'basic' | 'skill' | 'ultimate', level: number, area = 0) =>
    skillKit(SKILL_TABLES, id)?.skills.find((s) => s.slot === slot && s.variant === 0)?.damage[area]?.multipliers[level - 1];

  it.each([
    // [character, slot, level, B value, B line]
    ['1003', 'basic', 6, 1.0, 'Himeko.ts:89 basic(e, 1.00, 1.10)'],
    ['1003', 'basic', 7, 1.1, 'Himeko.ts:89'],
    ['1003', 'skill', 10, 2.0, 'Himeko.ts:90 skill(e, 2.00, 2.20)'],
    ['1003', 'skill', 12, 2.2, 'Himeko.ts:90'],
    ['1003', 'ultimate', 10, 2.3, 'Himeko.ts:91 ult(e, 2.30, 2.484)'],
    ['1003', 'ultimate', 12, 2.484, 'Himeko.ts:91'],
    ['1013', 'skill', 10, 1.0, 'Herta.ts:93 skill(e, 1.00, 1.10)'],
    ['1013', 'skill', 12, 1.1, 'Herta.ts:93'],
    ['1013', 'ultimate', 10, 2.0, 'Herta.ts:94 ult(e, 2.00, 2.16)'],
    ['1013', 'ultimate', 12, 2.16, 'Herta.ts:94'],
    ['1008', 'ultimate', 10, 3.2, 'Arlan.ts:90 ult(e, 3.20, 3.456)'],
    ['1008', 'ultimate', 12, 3.456, 'Arlan.ts:90'],
    ['1206', 'ultimate', 10, 3.2, 'Sushang.ts:99 ult(e, 3.20, 3.456)'],
    ['1206', 'ultimate', 12, 3.456, 'Sushang.ts:99'],
  ] as const)('%s %s at level %i = %f (B %s)', (id, slot, level, expected, _line) => {
    expect(multiplier(id, slot, level)).toBeCloseTo(expected, 9);
  });

  it("eidolon level slots match B's AbilityEidolon groups", () => {
    const groups = (id: string) =>
      skillKit(SKILL_TABLES, id)?.eidolonLevels.map((e) => `${e.slot}${e.add}@E${e.eidolon}`).sort();
    // B: Himeko/Herta/Arlan SKILL_BASIC_3_ULT_TALENT_5, Sushang ULT_TALENT_3_SKILL_BASIC_5.
    for (const id of ['1003', '1013', '1008']) expect(groups(id)).toEqual(['basic1@E3', 'skill2@E3', 'ultimate2@E5']);
    expect(groups('1206')).toEqual(['basic1@E5', 'skill2@E5', 'ultimate2@E3']);
  });

  it('every record is cited and every multiplier list covers its levels', () => {
    for (const k of SKILL_TABLES.kits) {
      expect(k.source.files).toContain('ExcelOutput/AvatarSkillConfig.json');
      for (const s of k.skills) {
        expect(s.unsupported === undefined || s.damage.length === 0).toBe(true);
        for (const d of s.damage) expect(d.multipliers).toHaveLength(s.maxLevel);
      }
    }
  });
});
