import { stageEnemyConfig, type StageEnemy } from '../../data';
import { RESERVED_UNIT_IDS, type EnemyConfig } from '../../engine/index';

/** The first `enemy-N` not in `taken` (nor a reserved ID); adds it to `taken`. */
function freshEnemyId(taken: Set<string>): string {
  let n = 1;
  while (taken.has(`enemy-${n}`) || (RESERVED_UNIT_IDS as readonly string[]).includes(`enemy-${n}`)) n++;
  const id = `enemy-${n}`;
  taken.add(id);
  return id;
}

/**
 * Puts a stage's enemies into the shared list in order. Enemy *i* replaces the
 * current enemy *i* and keeps its ID, so rotation steps that target it still
 * work; extra stage enemies get new IDs, and extra current enemies stay.
 * `takenIds` holds every unit ID in the scenario (characters included).
 */
export function applyStageEnemies(
  current: readonly EnemyConfig[],
  picked: readonly StageEnemy[],
  takenIds: Iterable<string>,
): EnemyConfig[] {
  const taken = new Set(takenIds);
  const replaced = picked.map((e, i) => stageEnemyConfig(e, current[i]?.id ?? freshEnemyId(taken)));
  return [...replaced, ...current.slice(picked.length)];
}

/** Appends one stage enemy under a new ID. */
export function addStageEnemy(current: readonly EnemyConfig[], picked: StageEnemy, takenIds: Iterable<string>): EnemyConfig[] {
  return [...current, stageEnemyConfig(picked, freshEnemyId(new Set(takenIds)))];
}
