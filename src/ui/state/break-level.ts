import { breakLevelMultiplier, DATA_TABLES } from '../../data';

export function suggestedBreakLevelMultiplier(level: number): number | undefined {
  const result = breakLevelMultiplier(DATA_TABLES, level);
  return result.ok ? result.value : undefined;
}
