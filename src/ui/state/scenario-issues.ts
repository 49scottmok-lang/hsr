import { validateRotationInput } from '../../engine/index';
import { toRotationInput, type Scenario } from './scenario';

export function scenarioIssues(scenario: Scenario): string[] {
  const issues = new Set<string>();
  for (const index of [0, 1] as const) {
    for (const issue of validateRotationInput(toRotationInput(scenario, index))) {
      const shared = issue.startsWith('enemies:') || issue.startsWith('enemies[');
      issues.add(shared ? issue : `teams[${index}].${issue}`);
    }
  }
  return [...issues];
}

export function editorIssues(scenario: Scenario, issues: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const rows = new Map<string, Set<string>>();
  function add(row: string, message: string) {
    if (!rows.has(row)) rows.set(row, new Set());
    rows.get(row)!.add(message);
  }

  for (const issue of issues) {
    const separator = issue.indexOf(': ');
    const path = issue.slice(0, separator);
    const message = issue.slice(separator + 2);
    const step = /^(teams\[([01])\])\.events\[\d+\]\.steps\[\d+\]/.exec(path);
    if (!step) continue;
    const attacker = /^attacker "(.*)" needs a breakLevelMultiplier for break hits$/s.exec(message);
    const target = /^target "(.*)" needs a maxToughness for Break DMG$/s.exec(message);
    if (attacker) {
      const team = scenario.teams[step[2] === '0' ? 0 : 1].team;
      const index = team.findIndex(({ id }) => id === attacker[1]);
      if (index >= 0) add(`${step[1]}.team[${index}]`, message);
      add(step[0], message);
    }
    if (target) {
      const index = scenario.enemies.findIndex(({ id }) => id === target[1]);
      if (index >= 0) add(`enemies[${index}]`, message);
      add(step[0], message);
    }
  }
  return new Map(Array.from(rows, ([path, messages]) => [path, [...messages]]));
}
