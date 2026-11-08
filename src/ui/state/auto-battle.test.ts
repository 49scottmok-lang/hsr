import { describe, expect, it } from 'vitest';
import { characterEnergyCost, DATA_TABLES } from '../../data';
import { runRotation, simulateBattle, type ActionStep, type CharacterBuild } from '../../engine/index';
import { t } from '../i18n';
import { kitTemplateFor, newKit, toAutoBattleInput, type AutoKitDraft } from './auto-battle';
import { scenarioReducer } from './reducer';
import { exportScenario, importScenario } from './scenario-json';
import type { Scenario } from './scenario';

// TEST FIXTURE — NOT GAME DATA.
const build = (id: string, characterId?: string): CharacterBuild => ({
  id, name: id, level: 80, element: 'fire', base: { hp: 1000, atk: 500, def: 400, spd: 100 },
  ...(characterId !== undefined ? { characterId } : {}),
});
const hit: ActionStep = { op: 'hit', hit: { targetId: 'e1', scaling: 'atk', multiplier: 1, tags: ['skill'] } };
const kit: AutoKitDraft = {
  unitId: 'a',
  basic: { steps: [], energy: 20, skillPoints: 1 },
  skill: { steps: [hit], energy: 30, skillPoints: 1 },
  ultimate: { steps: [], energy: 5, energyCost: 120 },
  useSkill: true,
  useUltimate: false,
};
const scenario: Scenario = {
  critMode: 'expected',
  enemies: [{ id: 'e1', name: 'e1', level: 90, res: {}, spd: 100 }],
  teams: [
    { label: 'A', team: [build('a')], events: [], cycles: 3, autoBattle: { kits: [kit, { ...kit, unitId: 'gone' }], avLimit: 300 } },
    { label: 'B', team: [], events: [] },
  ],
};

describe('newKit', () => {
  it('pre-fills only the sourced Ultimate cost', () => {
    const record = DATA_TABLES.characters.find(({ id }) => (characterEnergyCost(DATA_TABLES, id) ?? 0) > 0)!;
    const created = newKit(build('x', record.id));
    expect(created.ultimate).toEqual({ steps: [], energyCost: characterEnergyCost(DATA_TABLES, record.id) });
    expect(created.basic).toEqual({ steps: [] });
    expect(created.startEnergy).toBeUndefined();
  });

  it('leaves the cost empty for unknown characters and a cost of 0 (1407)', () => {
    expect(newKit(build('x')).ultimate).toEqual({ steps: [] });
    expect(characterEnergyCost(DATA_TABLES, '1407')).toBe(0);
    expect(newKit(build('x', '1407')).ultimate).toEqual({ steps: [] });
  });
});

describe('newKit from the skill table', () => {
  // An imported Himeko (1003) with synthetic stats (TEST FIXTURE) and skill-tree levels 6 / 10 / 10.
  const himeko: CharacterBuild = { ...build('h', '1003'), skillLevels: { basic: 6, skill: 10, ultimate: 10, tree: 'base' } };
  const enemies = [1, 2, 3].map((n) => ({ id: `e${n}`, name: `e${n}`, level: 90, res: {}, spd: 100 }));
  const multipliers = (steps: readonly ActionStep[]) => steps.map((s) => s.op === 'hit' && [s.hit.targetId, s.hit.multiplier]);

  it('fills multipliers, Energy and skill points at the imported levels', () => {
    const kit = newKit(himeko, enemies);
    expect(kit.prefill).toEqual({ basic: 6, skill: 10, ultimate: 10 });
    // A at the levels above (cross-checked against B in data/__tests__/kits.test.ts): Basic 100%, Skill 200% + 80% Blast, Ultimate 230% AoE.
    expect(multipliers(kit.basic.steps)).toEqual([['e1', 1]]);
    expect(multipliers(kit.skill.steps)).toEqual([['e1', 2], ['e2', 0.8]]);
    expect(multipliers(kit.ultimate.steps)).toEqual([['e1', 2.3], ['e2', 2.3], ['e3', 2.3]]);
    expect(kit.basic).toMatchObject({ energy: 20, skillPoints: 1 });
    expect(kit.skill).toMatchObject({ energy: 30, skillPoints: 1 });
    expect(kit.ultimate).toMatchObject({ energy: 5, energyCost: characterEnergyCost(DATA_TABLES, '1003') });
  });

  it('adds eidolon levels and follows the chosen target', () => {
    const template = kitTemplateFor({ ...himeko, eidolon: 3 }, enemies, { basic: 6, skill: 10, ultimate: 10, targetId: 'e2' });
    // E3: Basic +1 (7 → 110%), Skill +2 (12 → 220% main, 88% neighbours).
    expect(template?.ok && multipliers(template.value.actions.basic!.steps)).toEqual([['e2', 1.1]]);
    expect(template?.ok && multipliers(template.value.actions.skill!.steps)).toEqual([['e2', 2.2], ['e1', 0.88], ['e3', 0.88]]);
  });

  it('a removed target falls back to the first enemy; no game ID means no template', () => {
    const template = kitTemplateFor(himeko, enemies, { basic: 6, skill: 10, ultimate: 10, targetId: 'gone' });
    expect(template?.ok && multipliers(template.value.actions.basic!.steps)).toEqual([['e1', 1]]);
    expect(kitTemplateFor(build('x'), enemies, {})).toBeUndefined();
  });

  it('produces a damaging rotation with no multiplier typed in', () => {
    const team: Scenario['teams'][0] = {
      label: 'A', team: [himeko], events: [],
      autoBattle: { kits: [{ ...newKit(himeko, enemies), startEnergy: 120 }], avLimit: 150, skillPointStart: 3, skillPointMax: 5 },
    };
    const input = toAutoBattleInput({ critMode: 'expected', enemies, teams: [team, team] }, 0);
    const battle = simulateBattle(input);
    const result = runRotation({ team: input.team, enemies, events: battle.events, critMode: 'expected' });
    expect(battle.actions.map(({ action }) => action)).toContain('ultimate');
    expect(result.totalDamage).toBeGreaterThan(0);
  });
});

describe('toAutoBattleInput', () => {
  it('passes empty numbers as NaN, defaults start Energy to 0 and skips removed members', () => {
    const input = toAutoBattleInput(scenario, 0);
    expect(input.avLimit).toBe(300);
    expect(input.skillPoints.start).toBeNaN();
    expect(input.skillPoints.max).toBeNaN();
    expect(input.cycleAv).toBeUndefined();
    expect(input.kits.map(({ unitId }) => unitId)).toEqual(['a']);
    expect(input.kits[0]).toMatchObject({
      startEnergy: 0,
      skill: { steps: [hit], energy: 30, skillPoints: 1, label: t('auto.action.skill') },
      ultimate: { energyCost: 120, label: t('auto.action.ultimate') },
    });
    expect(input.kits[0]).not.toHaveProperty('skillPointReserve');
  });

  it('adds cycles when either cycle field is set', () => {
    const team = { ...scenario.teams[0], autoBattle: { kits: [], firstCycle: 150 } };
    const input = toAutoBattleInput({ ...scenario, teams: [team, scenario.teams[1]] }, 0);
    expect(input.cycleAv?.first).toBe(150);
    expect(input.cycleAv?.later).toBeNaN();
  });
});

describe('auto battle state', () => {
  it('replaces the rotation and its cycle count', () => {
    const events = [{ kind: 'turn' as const, id: 'auto-1', actorId: 'a', steps: [hit] }];
    const next = scenarioReducer(scenario, { type: 'replaceRotation', teamIndex: 0, events, cycles: undefined });
    expect(next.teams[0].events).toBe(events);
    expect(next.teams[0]).not.toHaveProperty('cycles');
    expect(scenarioReducer(scenario, { type: 'replaceRotation', teamIndex: 0, events, cycles: 2 }).teams[0].cycles).toBe(2);
  });

  it('sets and clears the settings', () => {
    const cleared = scenarioReducer(scenario, { type: 'setAutoBattle', teamIndex: 0, autoBattle: undefined });
    expect(cleared.teams[0]).not.toHaveProperty('autoBattle');
    expect(scenarioReducer(cleared, { type: 'setAutoBattle', teamIndex: 0, autoBattle: undefined })).toBe(cleared);
  });

  it('survives export and import', () => {
    const result = importScenario(exportScenario(scenario));
    expect(result.ok && result.scenario.teams[0].autoBattle).toEqual(scenario.teams[0].autoBattle);
    const broken = JSON.parse(exportScenario(scenario)) as { teams: { autoBattle?: { kits: { useSkill: unknown }[] } }[] };
    broken.teams[0]!.autoBattle!.kits[0]!.useSkill = 'yes';
    expect(importScenario(JSON.stringify(broken)).ok).toBe(false);
  });
});
