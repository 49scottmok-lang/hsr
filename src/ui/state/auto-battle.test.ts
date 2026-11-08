import { describe, expect, it } from 'vitest';
import { characterEnergyCost, DATA_TABLES } from '../../data';
import type { ActionStep, CharacterBuild } from '../../engine/index';
import { t } from '../i18n';
import { newKit, toAutoBattleInput, type AutoKitDraft } from './auto-battle';
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
