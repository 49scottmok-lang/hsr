import { ELEMENTS } from '../../engine/index';
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

  // Let validation report unknown RES elements before dropping their keys.
  const enemies = scenario.enemies.map((enemy) => ({
    ...enemy,
    res: Object.fromEntries(ELEMENTS.filter((element) => Object.hasOwn(enemy.res, element))
      .map((element) => [element, enemy.res[element]])),
  }));
  return { ok: true, scenario: { ...scenario, enemies }, issues };
}
