import { DOT_TYPES, ELEMENTS } from '../../engine/index';
import type { Scenario } from './scenario';
import { scenarioIssues } from './scenario-issues';
import { readScenario } from './scenario-shape';

export type ScenarioImportResult =
  | { ok: true; scenario: Scenario; issues: readonly string[] }
  | { ok: false; issues: readonly string[] };

export function exportScenario(scenario: Scenario): string {
  return JSON.stringify(scenario, null, 2);
}

export function importScenario(json: string): ScenarioImportResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, issues: ['Scenario: invalid JSON'] };
  }
  const scenario = readScenario(data);
  if (!scenario) return { ok: false, issues: ['Scenario: invalid structure'] };

  const issues = scenarioIssues(scenario);

  // Report unknown resistance keys before dropping them.
  const enemies = scenario.enemies.map(({ debuffRes, ...enemy }) => ({
    ...enemy,
    res: Object.fromEntries(ELEMENTS.filter((element) => Object.hasOwn(enemy.res, element))
      .map((element) => [element, enemy.res[element]])),
    ...(debuffRes && { debuffRes: Object.fromEntries(DOT_TYPES.filter((type) => Object.hasOwn(debuffRes, type))
      .map((type) => [type, debuffRes[type]])) }),
  }));
  return { ok: true, scenario: { ...scenario, enemies }, issues };
}
