# Tasks

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done. Owners are defined in `ARCHITECTURE.md § Module ownership`.

## Done (engine, 2026-11-07)

- [x] Scaffold Vite 8 + React 19 + TypeScript 7 + Vitest 5 + oxlint.
- [x] Engine types, formulas, stats, damage, effects, manual rotation, comparison, and validation.
- [x] Engine independence guards: typecheck, lint, and test.
- [x] 63 unit tests, including the hand-computed worked example.
- [x] Cross-checked the formulas against Fribbels HSR Optimizer. Added the vulnerability cap and the Final/True DMG multipliers, bringing the total to 66 tests.
- [x] Checked the formulas against the Fandom wiki Damage page.
- [x] Reconciled the design with the master spec. Added eidolon gating and superimposition, bringing the total to 72 tests.
- [x] v1 plan: account import, sourced stat tables, zh-HK UI, and share-by-link (SPEC D5–D7).

---

## Frontend tasks (owner: Codex)

Rules for every task:

- Import only from `src/engine` (the index), and never re-implement formulas.
- Use plain, unstyled-but-usable UI. No visual polish yet.
- Add component tests: Vitest + `@testing-library/react` + `jsdom`, with `// @vitest-environment jsdom` per test file. The engine stays on `node`.
- `pnpm check` must pass before each commit.

### F1. Scenario state model — `src/ui/state/`

- [x] Define `Scenario` and `TeamDraft` with readonly arrays, exactly two teams and optional per-team cycles.
- [x] Add a pure function `toRotationInput(scenario, teamIndex): RotationInput`. Both teams share the same `enemies` and `critMode`.
- [x] Add a reducer for `useReducer` that adds, updates, removes and reorders characters, enemies, events and steps, and sets crit mode and cycles.
- [x] Add JSON export and import of a `Scenario`. On import, run `validateRotationInput` for each team and return issues for display.
- **Acceptance:** the reducer and `toRotationInput` are unit-tested (node env). A round-trip export → import gives a deep-equal result.
- **Import contract (002be3f, for F7 / F8 / F13).** `importScenario()` returns `ok: false` only for invalid JSON or an invalid structure. `ok: true` can still carry `issues`. For example, an empty Team B is still a valid draft: load it and then show the issues so the user can fix them. Team issues use the `teams[0].…` / `teams[1].…` path. Shared enemy issues use the `enemies…` path and are listed once. Import rebuilds the scenario from known fields only, so extra keys (including `uid`) are dropped.

### F2. Character build editor — `src/ui/components/CharacterEditor.tsx`

- [x] Add an eidolon selector (E0–E6) and a light cone superimposition selector (S1–S5). Superimposition is a label only (SPEC D4).
- [x] Add inputs for level, element, base HP/ATK/DEF/SPD, optional base CRIT, LC base HP/ATK/DEF, and relic stat totals as a `StatModifier` list editor. Each row picks a `STAT_KEYS` stat, a value, and an optional condition (elements and damage tags).
- [x] Enter percentages in the UI as `%`, and divide by 100 when storing.
- [x] Show live final stats via `resolveUnitStats(createInitialState([build], [anyEnemy]), build.id)`.
- **Acceptance:** typing ATK% 50 stores `0.5`. The displayed final ATK matches the engine.
- The editor is connected to both team drafts. The component tests use Testing Library and jsdom.

### F3. Enemy editor — `src/ui/components/EnemyEditor.tsx`

- [x] Add inputs for id, name, level, optional base DEF override, per-element RES (%), and the initial broken toggle.
- **Acceptance:** when base DEF is empty, the UI shows "200 + 10 × level (unverified)" as a hint.

### F4. Effect editor — `src/ui/components/EffectEditor.tsx`

- [x] Edit an `EffectDef`: id, name, kind, modifiers (reuse the F2 modifier list), maxStacks, an optional duration (turns, tickUnit, tickPhase, tickOnApplyTurn), an optional "Requires Eidolon ≥ N" (`requires.minEidolon`), and a `source` text field.
- [x] Add a per-team **effect library**. Steps reference effects from it, and the full `EffectDef` is copied into the step on export.
- Library edits update matching steps in that team by effect ID. Removing a library entry keeps the existing apply steps' full definitions. F5 adds the effect picker.
- **Acceptance:** the duration controls explain the tick semantics inline, with a link to KNOWN_LIMITATIONS A2.

### F5. Manual rotation editor — `src/ui/components/RotationEditor.tsx`

- [x] Show an ordered list of events. Add a Turn or an Extra event, choose the actor, add a label, and reorder with up/down buttons (no drag-and-drop needed).
- [x] Each event has an ordered step list: `hit` (target, scaling, multiplier %, element override, tags multi-select, canCrit override, label), `apply` (effect from the library, target or allAllies/allEnemies, stacks), `remove`, and `setBroken`. Every step has an optional "Requires Eidolon ≥ N" field (`step.requires`).
- [x] In the results view (F6), show steps skipped by eidolon gating (`log[].skippedSteps`) so users can see why a hit didn't happen.
- [x] Add a "duplicate event" button to make repeating cycles quick.
- **Acceptance:** you can build both `rotation.test.ts` scenarios ("buff applied earlier" and "enemy debuff ticking") in the UI, and they give the same totals as the tests.

### F6. Results & comparison view — `src/ui/components/Results.tsx`

- [x] Call `runRotation` on each team, then `compareTeams`.
- [x] Show totals, damage per cycle, the B−A difference and the B/A ratio.
- [x] Show tables of damage by attacker and by tag. Add a footnote that multi-tag hits are counted under each tag (A5).
- [x] Add a hit-by-hit table: event, label, attacker, target, element, tags, and **every** `DamageBreakdown` factor plus damage. Include `finalDmgMultiplier` and `trueDmgMultiplier`. Each row expands to show `ResolvedHitStats`.
- [x] Show the per-event log, including expired effects.
- [x] Round only for display: integers for damage, 4 decimals for multipliers.
- **Acceptance:** the numbers match the engine output exactly before display rounding. A test renders the worked example from `FORMULAS.md` and finds `4386` (4385.83 rounded).

### F7. Validation UX

- [ ] Catch `EngineValidationError` and list its `issues`. Map each `events[i].steps[j]` path to the matching editor row where possible.
- **Acceptance:** an invalid target shows a visible error and does not crash the app.
- Note: also show the `issues` from an `ok: true` import (see F1 import contract). Route `enemies…` paths to the shared enemy editor, not to a team.

### F8. Local persistence

- [ ] Autosave the current scenario to `localStorage`, wrapping access in try/catch. Add a "Reset" button.
- **Acceptance:** the app still works when `localStorage` throws.
- Note: restore through `importScenario()`. A saved draft with issues (`ok: true`) must still load. Fall back to the default scenario only on `ok: false`.

### F9. Disclaimers

- **Ready 2026-11-07 (D4 done):** list `DATA_CREDITS` (name, link, licence, short commit) and translate `GAME_DATA_NOTICE`.

- [ ] Add a persistent footer in zh-HK. It says that game numbers come from the user or from cited stat tables (with a link to the data credits from D4), that formulas marked UNVERIFIED in docs/FORMULAS.md may differ from the game, and that this is a fan project not affiliated with HoYoverse.

### F10. Account import UI — `src/ui/components/ImportPanel.tsx` (after I1–I2)

- **Ready 2026-11-07 (I1–I3 done).** Flow: `JSON.parse` the file → `parseArchive(json)` from `src/import` (show `errors` on `ok: false`, `warnings` otherwise) → `importArchive(archive, DATA_TABLES)` with `DATA_TABLES` from `src/data`. Per build, `report.builds[i]` has `lookedUp`, `toEnter` and `problems`. Each item has a `kind` for zh-HK text and an English `message` as a fallback. `report.dropped` counts the unequipped items the parser discarded.

- [ ] Add a file picker for a Reliquary Archiver `.json` export. The file is read **in the browser only**, with no upload or network request.
- [ ] Call `importArchive()` (I2) and list the imported characters with level, eidolon, light cone and superimposition, and relic summary. The user picks which ones to add to Team A or Team B.
- [ ] For each imported build, show what was **looked up** (base stats, main stats, 2-piece sets, traces) and what **must still be entered** (kit effects, 4-piece sets, LC passive), using `ImportReport` (I2).
- [ ] Keep the raw export in memory only. Never persist it to `localStorage` and never put it in a share link.
- **Acceptance:** importing the synthetic fixture from I3 adds a build whose final stats match the I3 expected values. An unsupported file shows a zh-HK error and doesn't crash.

### F11. Traditional Chinese (Hong Kong) UI — `src/ui/i18n/` (start alongside F1)

- [x] Put every UI string in `src/ui/i18n/zh-HK.ts`, as a typed key → string map, behind a `t(key)` helper. Hard-coded UI text is not allowed. This leaves room for other languages later.
- [x] Use zh-HK game terms consistently: 星魂, 光錐, 疊影, 遺器, 行跡, 暴擊率, 暴擊傷害, 增傷, 易傷, 減防, 抗性穿透, 擊破, 持續傷害, 追加攻擊, 終結技, 戰技, 普攻, 天賦. Keep a glossary at the top of the file.
- [x] Translate `EngineValidationError.issues` for display by pattern, and fall back to the English text.
- [x] Format numbers with `Intl.NumberFormat('zh-HK')`.
- [x] Set `<html lang="zh-HK">`.
- **Acceptance:** a test fails if any component renders a string literal that isn't from `t()`, which can be checked with a simple lint/test scan.

### F12. Static deployment (needs SPEC Q4)

- [ ] Make the production build work from a sub-path (Vite `base`) and add a deploy workflow for the chosen host.
- [ ] Add a CI step that runs `pnpm check` and `pnpm build` before deploying.
- **Acceptance:** the public URL loads and the worked example computes 4386.

### F13. Share by link — `src/ui/share/`

- [ ] Encode the current `Scenario` as `#s=<version>.<base64url(compressed JSON)>` in the URL hash, with a "copy link" button. On load, decode it, validate it with `validateRotationInput`, and show any issues.
- [ ] Include the scenario only. **Strip** anything from an account import except the resulting builds: no UID, no inventory.
- [ ] Version the format, so that old links either still decode or show a clear "link from an older version" message.
- Note: decode through `importScenario()` so the link reuses its field allowlist, which already drops `uid` and other unknown keys. Still keep the UID test, and also cover the encode side.
- **Acceptance:** encode → decode gives a deep-equal result (unit test). A tampered link shows a validation error and doesn't crash. A test asserts that a link built from an imported scenario does not contain the UID.

### Suggested order

F1 + F11 → F2 → F3 → F4 → F5 → F6 → F7 → F8 → F10 (once I1–I2 land) → F13 → F9 → F12

---

## Data tasks (owner: engine owner) — `src/data/`

- [x] **D1. Choose the stat-table source** (SPEC Q5).
  - **Candidates listed 2026-11-07** in `docs/DATA_SOURCES.md`. The recommendation is the DimbreathBot/TurnBasedGameData raw tables, pinned to a commit, cross-checked against Fribbels (MIT). Mar-7th StarRailRes is AGPL-3.0, and the Enka store has been deprecated since 3.8.
  - **Decided 2026-11-07 (owner): A is the source, B is the cross-check.** A is pinned to `74a7b96` (game build 4.6.0) and B to `dd0c4af`. See `DATA_SOURCES.md § Decision`. Recorded as SPEC D8.
  - List candidates with their licence and update cadence, e.g. datamined resource repositories, or Fribbels' MIT-licensed data files.
  - Record the chosen source, its version and the date checked.
  - **Do not add numbers before this is decided.**
- [x] **D2. Schema and validator** (replaces E3). *Done 2026-11-07:* `src/data/schema.ts`, `validate.ts`, `lookup.ts`. The level formulas are in `FORMULAS.md § Level scaling`.
  - Each table record carries `source` and `gameVersion`.
  - A validator test fails on any record without a citation, or with an out-of-range value.
- [x] **D3. Tables (stat-only, no kit logic).** *Done 2026-11-07:* generated by `pnpm data:extract` from A@`74a7b96` and cross-checked against B@`dd0c4af` (`pnpm data:crosscheck`, `crosscheck-b.test.ts`). Results and the known coverage gap are in `DATA_SOURCES.md § D3 results`.
  - character element and base HP/ATK/DEF/SPD per level and ascension
  - light cone base HP/ATK/DEF per level and ascension
  - relic main stat value per slot, stat, rarity and level
  - 2-piece set bonuses **only when they are unconditional stat bonuses**
  - character trace stat bonuses (`stat_1`–`stat_10`)
  - The values must match the source exactly. No interpolation.
- [x] **D4. Credits.** Add a data credits list (source, licence, version), shown by F9. *Done 2026-11-07:* `DATA_CREDITS` and `GAME_DATA_NOTICE` from `src/data` (`credits.ts`). Each credit has `role` (`tableSource` / `crossCheck` / `exportFormat`) so F9 can show its own zh-HK text; `note` is English.

## Import tasks (owner: engine owner) — `src/import/` (pure TS; same independence rules as the engine)

- [x] **I1. Parse and validate the Reliquary Archiver export.** *Done 2026-11-07:* `parseArchive(json)` in `src/import/archive.ts`. File-level problems fail the parse; a bad entry is skipped with a warning. Unequipped light cones and relics are dropped too (only counted), so no inventory leaves the parser. Tests use a synthetic fixture with a fake UID.
  - The format is documented in `docs/IMPORT_FORMAT.md`, observed from a v0.19.0 / `version: 4` export.
  - Reject unknown `source` or `version` values with a clear error.
  - Drop `metadata.uid`, `gacha` and `materials` immediately after parsing.
- [x] **I2. `importArchive(archive, tables): { builds; report: ImportReport }`.** *Done 2026-11-07* in `src/import/importArchive.ts`. It takes the parsed `Archive` from `parseArchive()` (I1), not the raw JSON, so the UI can show parse errors first. Builds have no kit effects; set and trace modifiers carry their citation in `EffectDef.source`. Characters missing from the tables get `built: false` and no build.
  - Map each owned character to a `CharacterBuild`: level, ascension, eidolon, and the equipped light cone (matched by `location`) with superimposition.
  - Convert relics using the IMPORT_FORMAT key map. Substats with a trailing `_` are percentages, so divide by 100. Main stat **values** come from D3. Equipped sets with an unconditional 2-piece bonus become `setEffects`.
  - Unlocked `stat_N` traces become `traces`, with values from D3.
  - `ImportReport` lists, per build, everything looked up and everything still missing: kit, 4-piece sets, LC passive, and any table miss.
- [x] **I3. Tests with a small synthetic fixture** (*done 2026-11-07*, `src/import/__tests__/importArchive.test.ts`; final stats are checked through `resolveUnitStats`) that is hand-written and has a fake UID. **Never commit a real account export.** Expected final stats are computed by hand from the fixture tables.

## Engine backlog (owner: engine)

- [~] E1. Verify the [UNVERIFIED] items in `FORMULAS.md`.
  - **Done 2026-11-07:** cross-checked against Fribbels HSR Optimizer (`ac5e9d6`). This added the vulnerability cap and the Final/True DMG multipliers.
  - **Done 2026-11-07:** the Fandom wiki Damage page confirmed Weaken, mitigation, flat Extra DMG, enemy DEF% and the Original/Final DMG zone. No engine change was needed.
  - **Done 2026-11-07:** base CRIT 5% / 50% is in source A for every character (D3), so it is now [SOURCED].
  - **Remaining:** the stat formula, game rounding, Weaken and Final DMG stacking, and the RES clamp and vulnerability cap (wiki sub-pages). See KNOWN_LIMITATIONS for the list.
- [ ] E8. DoT application-chance weighting (EHR vs effect RES), as R1 does. This needs `effectHitRate` plumbing and an enemy effect RES field.
- [ ] E9. Evaluate Nous StarRailSim's APL model (`action on target if condition`) as the design for E6. Its source is closed, so use it for design only.
- [x] E2. Reconcile the architecture with the master specification (`docs/SPEC.md`). This added eidolon gating and superimposition, bringing the total to 72 tests.
- [x] E10. Owner answered SPEC Q1–Q3 (decisions D5–D7). The work is split into D1–D4, I1–I3 and F10–F13.
- ~~E3. Data layer schema.~~ Superseded by D2.
- [ ] E4. Break / Super Break DMG. This needs the sourced level multiplier table.
- [ ] E5. Effect stacking policies per effect: `refresh` | `independent` | `noRefresh`. This replaces assumption A1.
- [ ] E6. Optional SPD/AV timeline helper, which would generate a turn order suggestion.
- [ ] E7. Stat-conversion modifiers, evaluated at hit time.

## Engine change requests (from frontend)

_Append requests here: what you need, why, and the proposed API._

- **Unit ID validation for editable enemies (F3–F6).** Please have `validateRotationInput` report per-unit issues for IDs `allAllies`, `allEnemies`, and `__proto__`. The first two are group references in apply/remove steps, and assigning the last to the plain object in `createInitialState` changes its prototype, omitting the unit from group targeting. The results view rejects these IDs before running the engine. Engine validation would provide the same protection to imports and other callers through the existing API.
