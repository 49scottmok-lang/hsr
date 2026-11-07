import type { RotationResult, TeamComparison } from './types';

/**
 * Compare two rotation results. Differences and ratios are B relative to A.
 * Per-cycle metrics are only produced when both results declare cycles.
 * Comparing results that used different enemies or critModes is allowed but
 * meaningless; callers (UI) must keep scenario inputs identical.
 */
export function compareTeams(
  a: RotationResult,
  b: RotationResult,
  labels: { a: string; b: string } = { a: 'Team A', b: 'Team B' },
): TeamComparison {
  const cmp: TeamComparison = {
    a: { label: labels.a, totalDamage: a.totalDamage, damagePerCycle: a.damagePerCycle },
    b: { label: labels.b, totalDamage: b.totalDamage, damagePerCycle: b.damagePerCycle },
    totalDifference: b.totalDamage - a.totalDamage,
    totalRatio: a.totalDamage !== 0 ? b.totalDamage / a.totalDamage : undefined,
  };
  if (a.damagePerCycle !== undefined && b.damagePerCycle !== undefined) {
    cmp.perCycleDifference = b.damagePerCycle - a.damagePerCycle;
    cmp.perCycleRatio = a.damagePerCycle !== 0 ? b.damagePerCycle / a.damagePerCycle : undefined;
  }
  return cmp;
}
