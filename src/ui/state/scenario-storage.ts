import type { Scenario } from './scenario';
import { exportScenario, importScenario, type ScenarioImportResult } from './scenario-json';

export const SCENARIO_STORAGE_KEY = 'hsr-team-damage-comparator.scenario';

export function restoreScenario(): ScenarioImportResult | undefined {
  try {
    const saved = localStorage.getItem(SCENARIO_STORAGE_KEY);
    if (saved !== null) return importScenario(saved);
  } catch {
    // Storage can be disabled or unavailable in the current browsing context.
  }
}

export function saveScenario(scenario: Scenario): void {
  try {
    localStorage.setItem(SCENARIO_STORAGE_KEY, exportScenario(scenario));
  } catch {
    // Keep editing if the browser denies storage or its quota is full.
  }
}
