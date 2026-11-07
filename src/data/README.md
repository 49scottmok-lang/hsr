# src/data — sourced stat tables

Stat tables only (SPEC D5, TASKS D2–D3). Kit logic never goes here. The source and pinned commits are in `docs/DATA_SOURCES.md § Decision`.

| File | What |
|---|---|
| `schema.ts` | Record types. Every record has `source` (repo, commit, files) and `gameVersion`. |
| `validate.ts` | `validateDataTables()`: missing citations and out-of-range values. |
| `lookup.ts` | `characterBase`, `lightConeBase`, `relicMainStat`, `setBonus2pc`, `statTrace`. Level values come from the engine's level formulas (`docs/FORMULAS.md § Level scaling`). |
| `properties.ts` | Game property → engine stat, and the export's main-stat names. |
| `generated/*.ts` | **Generated. Do not edit.** Written by `pnpm data:extract` (`scripts/data/extract.ts`). |
| `__tests__/reference-b.json` | Cross-check reference from source B, written by `pnpm data:crosscheck`. Tests only. |
| `index.ts` | Public API, including `DATA_TABLES`. Import from here only. |

Policy (owner: engine owner, see `docs/ARCHITECTURE.md`):

1. Every number comes from the pinned source through the generator. Never edit `generated/` by hand: change the generator or the pinned commit, re-run it, and run `pnpm check`.
2. Store values exactly as the source gives them. Never store per-level values, interpolate, estimate or fill in gaps.
3. Use engine types (`StatModifier`, `Element`, `BaseStats`) imported from `src/engine`.
4. This layer follows the engine's rules: no React, no DOM, no I/O, no network (enforced by `__tests__/architecture.test.ts`, lint and the DOM-free typecheck).
5. Never commit a real account export (Reliquary Archiver or any other tool). They contain the player's UID and inventory.
6. Test fixtures (`__tests__/fixtures.ts`, `src/engine/__tests__/fixtures.ts`) are synthetic and must never be moved here.
