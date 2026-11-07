/**
 * D4: data credits, shown by the UI footer (F9). Every source the stat tables
 * or the account import depend on, with its licence and pinned commit.
 * Keep in step with docs/DATA_SOURCES.md § Decision.
 */
import { BUILD, COMMIT, GAME_VERSION, REPO } from './generated/source';

export type CreditRole = 'tableSource' | 'crossCheck' | 'exportFormat';

export interface DataCredit {
  readonly name: string;
  readonly repo: string;
  readonly url: string;
  readonly role: CreditRole;
  /** SPDX ID, or `null` when the repository states no licence. */
  readonly licence: string | null;
  readonly commit: string;
  /** English note for docs; the UI shows its own zh-HK text per `role`. */
  readonly note: string;
}

export const DATA_CREDITS: readonly DataCredit[] = [
  {
    name: 'Dimbreath',
    repo: REPO,
    url: `https://github.com/${REPO}`,
    role: 'tableSource',
    licence: null,
    commit: COMMIT,
    note: `Every number in the stat tables comes from this datamine, game build ${BUILD} (${GAME_VERSION}). Its README asks for credit.`,
  },
  {
    name: 'Fribbels HSR Optimizer',
    repo: 'fribbels/hsr-optimizer',
    url: 'https://github.com/fribbels/hsr-optimizer',
    role: 'crossCheck',
    licence: 'MIT',
    commit: 'dd0c4af98ea95ddde2abe38cb9a4443cc8b2f13d',
    note: 'Used in tests to cross-check the tables and the damage formulas. None of its data ships in the app.',
  },
  {
    name: 'Reliquary Archiver',
    repo: 'IceDynamix/reliquary-archiver',
    url: 'https://github.com/IceDynamix/reliquary-archiver',
    role: 'exportFormat',
    licence: 'MIT',
    commit: '5e50dcbf980afe77463f9ad357001f2afa3c66fb',
    note: 'The account export format, and how its trace and main-stat fields map to game data.',
  },
];

/** Game data and names belong to their owner; this is a fan project (F9 shows this in zh-HK). */
export const GAME_DATA_NOTICE =
  'Honkai: Star Rail game data is the property of HoYoverse. This is an unofficial fan project, not affiliated with HoYoverse.';
