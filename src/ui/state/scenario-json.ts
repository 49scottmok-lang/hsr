import { validateRotationInput } from '../../engine/index';
import { toRotationInput, type Scenario } from './scenario';
import { hasScenarioShape } from './scenario-shape';

export type ScenarioImportResult =
  | { ok: true; scenario: Scenario; issues: readonly [] }
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
  if (!hasScenarioShape(data)) return { ok: false, issues: ['Scenario: invalid structure'] };

  // The shape check makes validation safe. The engine checks domain values and references.
  const scenario = data as Scenario;
  const issues = ([0, 1] as const).flatMap((index) =>
    validateRotationInput(toRotationInput(scenario, index)).map((issue) => `teams[${index}].${issue}`),
  );
  return issues.length > 0 ? { ok: false, issues } : { ok: true, scenario, issues: [] };
}
