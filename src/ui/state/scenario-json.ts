import { ELEMENTS, validateRotationInput } from '../../engine/index';
import { toRotationInput, type Scenario } from './scenario';
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

  const issues = new Set<string>();
  for (const index of [0, 1] as const) {
    for (const issue of validateRotationInput(toRotationInput(scenario, index))) {
      const shared = issue.startsWith('enemies:') || issue.startsWith('enemies[');
      issues.add(shared ? issue : `teams[${index}].${issue}`);
    }
  }

  // Let validation report unknown RES elements before dropping their keys.
  const enemies = scenario.enemies.map((enemy) => ({
    ...enemy,
    res: Object.fromEntries(ELEMENTS.filter((element) => Object.hasOwn(enemy.res, element))
      .map((element) => [element, enemy.res[element]])),
  }));
  return { ok: true, scenario: { ...scenario, enemies }, issues: [...issues] };
}
