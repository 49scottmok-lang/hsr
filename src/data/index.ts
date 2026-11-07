/**
 * Public API of the sourced stat tables. Other layers import only from here.
 * Source and pinned commits: docs/DATA_SOURCES.md § Decision.
 */
import { CHARACTERS } from './generated/characters';
import { LIGHT_CONES } from './generated/lightCones';
import { RELIC_MAIN_STATS } from './generated/relicMainStats';
import { SET_BONUSES } from './generated/setBonuses';
import { TRACES } from './generated/traces';
import type { DataTables } from './schema';

export * from './schema';
export { validateDataTables, DATA_LIMITS } from './validate';
export type { DataIssue } from './validate';
export { characterBase, lightConeBase, relicMainStat, setBonus2pc, statTrace } from './lookup';
export type { Lookup, CharacterBase, RelicMainStat } from './lookup';
export { REPO as DATA_REPO, COMMIT as DATA_COMMIT, BUILD as DATA_BUILD, GAME_VERSION as DATA_GAME_VERSION } from './generated/source';

export const DATA_TABLES: DataTables = {
  characters: CHARACTERS,
  lightCones: LIGHT_CONES,
  relicMainStats: RELIC_MAIN_STATS,
  setBonuses: SET_BONUSES,
  traces: TRACES,
};
export { DATA_CREDITS, GAME_DATA_NOTICE } from './credits';
export type { DataCredit, CreditRole } from './credits';
