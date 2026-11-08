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
- **Acceptance:** when base DEF is empty, the UI shows "200 + 10 × level" as a hint.

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

- [x] Catch `EngineValidationError` and list its `issues`. Map each `events[i].steps[j]` path to the matching editor row where possible.
- **Acceptance:** an invalid target shows a visible error and does not crash the app.
- Note: also show the `issues` from an `ok: true` import (see F1 import contract). Route `enemies…` paths to the shared enemy editor, not to a team.

### F8. Local persistence

- [x] Autosave the current scenario to `localStorage`, wrapping access in try/catch. Add a "Reset" button.
- **Acceptance:** the app still works when `localStorage` throws.
- Note: restore through `importScenario()`. A saved draft with issues (`ok: true`) must still load. Fall back to the default scenario only on `ok: false`.

### F9. Disclaimers

- **Ready 2026-11-07 (D4 done):** list `DATA_CREDITS` (name, link, licence, short commit) and translate `GAME_DATA_NOTICE`.

- [x] Add a persistent footer in zh-HK. It says that game numbers come from the user or from cited stat tables (with a link to the data credits from D4), that formulas marked UNVERIFIED in docs/FORMULAS.md may differ from the game, and that this is a fan project not affiliated with HoYoverse.

### F10. Account import UI — `src/ui/components/ImportPanel.tsx` (after I1–I2)

- **Ready 2026-11-07 (I1–I3 done).** Flow: `JSON.parse` the file → `parseArchive(json)` from `src/import` (show `errors` on `ok: false`, `warnings` otherwise) → `importArchive(archive, DATA_TABLES)` with `DATA_TABLES` from `src/data`. Per build, `report.builds[i]` has `lookedUp`, `toEnter` and `problems`. Each item has a `kind` for zh-HK text and an English `message` as a fallback. `report.dropped` counts the unequipped items the parser discarded.

- [x] Add a file picker for a Reliquary Archiver `.json` export. The file is read **in the browser only**, with no upload or network request.
- [x] Call `importArchive()` (I2) and list the imported characters with level, eidolon, light cone and superimposition, and relic summary. The user picks which ones to add to Team A or Team B.
- [x] For each imported build, show what was **looked up** (base stats, main stats, 2-piece sets, traces) and what **must still be entered** (kit effects, 4-piece sets, LC passive), using `ImportReport` (I2).
- [x] Keep the raw export in memory only. Never persist it to `localStorage` and never put it in a share link.
- **Acceptance:** importing the synthetic fixture from I3 adds a build whose final stats match the I3 expected values. An unsupported file shows a zh-HK error and doesn't crash.

### F11. Traditional Chinese (Hong Kong) UI — `src/ui/i18n/` (start alongside F1)

- [x] Put every UI string in `src/ui/i18n/zh-HK.ts`, as a typed key → string map, behind a `t(key)` helper. Hard-coded UI text is not allowed. This leaves room for other languages later.
- [x] Use zh-HK game terms consistently: 星魂, 光錐, 疊影, 遺器, 行跡, 暴擊率, 暴擊傷害, 增傷, 易傷, 減防, 抗性穿透, 擊破, 持續傷害, 追加攻擊, 終結技, 戰技, 普攻, 天賦. Keep a glossary at the top of the file.
- [x] Translate `EngineValidationError.issues` for display by pattern, and fall back to the English text.
- [x] Format numbers with `Intl.NumberFormat('zh-HK')`.
- [x] Set `<html lang="zh-HK">`.
- **Acceptance:** a test fails if any component renders a string literal that isn't from `t()`, which can be checked with a simple lint/test scan.

### F12. Static deployment (GitHub Pages, SPEC D9)

- **Ready 2026-11-07:** the owner chose GitHub Pages. Deploy with GitHub Actions (`actions/deploy-pages`), set Vite `base` to the repository sub-path, and make sure share links (`#s=…` in the hash) still work under that path.

- [x] Make the production build work from a sub-path (Vite `base`) and add a deploy workflow for the chosen host. *Done 2026-11-07:* `.github/workflows/pages.yml` passes `--base` from `actions/configure-pages`, so `vite.config.ts` hard-codes no path.
- [x] Add a CI step that runs `pnpm check` and `pnpm build` before deploying.
- **Acceptance:** the public URL loads and the worked example computes 4386. *Verified 2026-11-07* on `https://49scottmok-lang.github.io/hsr/`: the worked example, loaded through a `#s=1.…` share link, shows 4386 for both teams, with no console errors.

### F13. Share by link — `src/ui/share/`

- [x] Encode the current `Scenario` as `#s=<version>.<base64url(compressed JSON)>` in the URL hash, with a "copy link" button. On load, decode it, validate it with `validateRotationInput`, and show any issues.
- [x] Include the scenario only. **Strip** anything from an account import except the resulting builds: no UID, no inventory.
- [x] Version the format, so that old links either still decode or show a clear "link from an older version" message.
- Note: decode through `importScenario()` so the link reuses its field allowlist, which already drops `uid` and other unknown keys. Still keep the UID test, and also cover the encode side.
- **Acceptance:** encode → decode gives a deep-equal result (unit test). A tampered link shows a validation error and doesn't crash. A test asserts that a link built from an imported scenario does not contain the UID.

### F14. Battle-sim visual redesign — done by the engine owner at the owner's request (2026-11-08)

The owner asked for a look like the NOUS StarRailSim site, with character art, and **approved Claude editing `src/ui/**`, `src/index.css` and `index.html` for this task**. Ownership of `src/ui` stays with the frontend agent afterwards.

- [x] Dark theme with a sticky top bar (title, section links, scenario import, reset, share). `src/index.css` replaces the unstyled defaults.
- [x] Each team is a row of up to four portrait cards (`PortraitCard`), with element-coloured borders, element and path badges and an issue dot. Clicking a card opens that member's `CharacterEditor`; the empty card adds a member.
- [x] `CharacterEditor` has a game-character picker (sets `characterId`, name and element) and a button that fills table base stats at the character's max level. Neither touches light cone, relics or effects.
- [x] Artwork is hotlinked from StarRailRes at a pinned commit (`docs/DATA_SOURCES.md § Artwork`), with a fallback when it fails to load.
- Engine/import side: `CharacterBuild.characterId?` (display metadata) and `importArchive` sets it. `scenario-shape` keeps it in files and links.

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
- [x] **D5. Traditional Chinese name tables.** *Done 2026-11-07:* `NAME_TABLES` from `src/data` (`names.ts`), generated by `pnpm data:extract` from A's `TextMap/TextMapCHT.json` at the same pinned commit, and cross-checked against B's zh_TW locale (`crosscheck-b.test.ts`). Details: `DATA_SOURCES.md § Names`.
  - Character (with path, and gender for the Trailblazer), light cone (with path), relic set and path (命途) names, for every released record. Lookups: `characterName`, `lightConeName`, `relicSetName`, `pathName`.
  - **For F2 and F10:** show `name` as is. `name: null` is the Trailblazer: the game shows the player's nickname, so show a `t()` label (e.g. 開拓者) plus the path name. Two characters can share a name (1001 and 1224 are both 三月七), so show the path whenever names collide. These names are game text, not UI strings, so they do not go through `t()`.

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
  - **Done 2026-11-07:** the stat formula is cross-checked against R1's stat pipeline (`calculateStats.ts`, `calculateContext.ts`), and Final DMG stacking is re-checked as multiplicative in R1 (`MULTIPLICATIVE_BOOST`). No engine change was needed.
  - **Done 2026-11-08** (Fandom pages read through the wiki API after one bot check; `FORMULAS.md § Sources`, S3):
    - Sourced: the RES clamp [10%, 200%], additive Vulnerability, the SPD formula, the AV rules and 150/100 AV challenge cycles, the 0.9 multiplier for the breaking hit's Break DMG, Mitigation on break hits, and the Debuff RES term.
    - **Bug fixes** (with regression tests): break and Super Break hits no longer apply Weaken (`break-buffs.test.ts`), and the turn order helper floors gauges at 0 (`timeline.test.ts`).
    - Added `TimelineAdjustment.actNow` ("immediately take action") and `CHALLENGE_CYCLE_AV`.
  - **Remaining (after the third pass below):** game rounding and Final DMG stacking. Both need an in-game measurement. Weaken stacking, the vulnerability cap and mid-battle AV ties are now cross-checked against R3. New conflicts were split out as E11 and E12, both done 2026-11-08.
  - **2026-11-08, third pass:** read R3 (srsim, `3967db0`, no licence; formulas compared only, no code copied). Results:
    - **Weaken** now multiplies across sources: `1 − Π (1 − w_i)` (R3). **Behaviour change:** two Weaken sources of 10% and 20% give ×0.72, not ×0.7. `stats.weaken` shows the combined value. New `formulas.combinedWeaken`. Regression tests are in `damage.test.ts` and `formulas.test.ts`.
    - **AV ties** follow R3's stable queue: an actor goes behind the units it ties with, and an adjusted unit goes in front. **Behaviour change:** an ally that has just acted no longer goes before a tied enemy. Tests are in `timeline.test.ts` (one expectation changed, four tests added).
    - The **vulnerability cap** (+250%) is now in two reference implementations (R1, R3). **Mitigation** stacking is also confirmed by R3.
    - **Still open:** game rounding (no source states it; R1 and R3 do not round) and Final DMG stacking (R1 only; R3 has no such term). Both need an in-game measurement, so E1 cannot be closed from sources alone.
    - **For the frontend:** no API change. The results and the turn order preview show engine output, so they update by themselves. The help text may say that several Weaken sources multiply.
  - **2026-11-08, second pass:** read S1 (Prydwen) in full in the browser pane. It confirms the RES bounds and additive DMG Taken, states no Vulnerability cap, and only guesses about rounding, so none of the remaining items changed.
- [x] E8. DoT application-chance weighting (EHR vs effect RES), as R1 does. *Done 2026-11-07:* `HitSpec.baseChance` (DoT only), `EnemyConfig.effectRes`, the stat `effectResPen`, `formulas.dotApplicationChance`, `DamageBreakdown.dotChanceMultiplier`, and `ResolvedHitStats.effectHitRate` / `effectResPen` / `targetEffectRes`. Formula and tags: `FORMULAS.md § DoT application chance`. Tests: `dot-chance.test.ts`.
  - **For the frontend:** F5, add a base-chance field (%) to the hit editor, shown when the `dot` tag is selected. F3, add an Effect RES (%) field to the enemy editor. F1, the scenario sanitizer must keep `baseChance` and `effectRes`. F7, new issue messages: `baseChance must be a finite number >= 0`, `baseChance needs the "dot" tag`, and `effectRes: must be a finite number` on an enemy.
- [x] E9. Evaluate Nous StarRailSim's APL model (`action on target if condition`) as the design for E6. Its source is closed, so use it for design only. *Done 2026-11-08:* read R2's APL reference (`starrailsim.com/apl`) in the browser pane. Each line is `action on target if condition`, the first matching line runs, ultimates have their own lines and windows, and conditions read energy, skill points, AV, buffs and kit counters. **Decision: do not adopt the APL.** It needs energy, skill points and kit state for every character, and this project ships no kit data (SPEC D3/D5), so it would run on invented numbers. E6 takes only R2's timeline layer (AV per turn, advance/delay, SPD changes), and the manual event list stays the authority (SPEC D1). Reasoning: `ARCHITECTURE.md § Turn order helper (E6)`.
- [x] E2. Reconcile the architecture with the master specification (`docs/SPEC.md`). This added eidolon gating and superimposition, bringing the total to 72 tests.
- [x] E10. Owner answered SPEC Q1–Q3 (decisions D5–D7). The work is split into D1–D4, I1–I3 and F10–F13.
- ~~E3. Data layer schema.~~ Superseded by D2.
- [x] E4. Break / Super Break DMG. *Done 2026-11-07:* a new `break` step (`BreakHitSpec`, kind `break` or `superBreak`), `calculateBreakHit` in `src/engine/breakDamage.ts`, the level multiplier table from A's `AvatarBreakDamage` (`breakLevelMultiplier` in `src/data`, filled in by `importArchive`), and a cross-check against B's break code. Formulas and verification tags: `FORMULAS.md § Break DMG` and `§ Super Break DMG`. Gaps: `KNOWN_LIMITATIONS.md`.
  - **API additions** (all optional, so existing scenarios still validate): `CharacterBuild.breakLevelMultiplier`, `EnemyConfig.maxToughness` (displayed units), `ActionStep` `{ op: 'break', hit: BreakHitSpec }`, and `HitResult.break` (`BreakDetails`). `DamageBreakdown` is unchanged: for break hits `baseDmg` already includes 1 + Break Effect, and CRIT and DMG Boost are 1.
  - **Stub in frontend files (owner-approved, 2026-11-07):** to keep `pnpm check` green, the engine owner added `case 'break': return;` to `addStep` in `RotationEditor.tsx` (no add button yet) and the label `'rotation.step.break': '擊破傷害'` to `zh-HK.ts`. Frontend: replace them with real UI.
  - **For the frontend:** F3, add a max Toughness field (displayed units). F2, show `breakLevelMultiplier`, prefilled from `breakLevelMultiplier(DATA_TABLES, level)`. F5, add a break step editor: kind, target, element override, `multiplier`, and for Super Break `toughnessReduction`, `breakEfficiency`, `fixedToughnessReduction`. F6, show `HitResult.break` for break hits; they have no tags, so they are not in `damageByTag`. F1, the scenario sanitizer (`scenario-shape.ts`) must keep the new fields and the `break` op: today it drops the fields and rejects a `break` step as an invalid structure.
  - [x] Follow-up, *done 2026-11-07:* `break` / `superBreak` damage tags (set by the engine on break hits; `HIT_DAMAGE_TAGS` lists the tags a `hit` step may use, and `BREAK_DAMAGE_TAGS` the other two), break-tag-only DMG Boost on break hits, and the attacker stats `breakEfficiency` / `superBreakDmg`, which add to a Super Break step's own values. `BreakDetails.breakEfficiency` is new. Formulas: `FORMULAS.md § Break DMG` and `§ Super Break DMG`. Tests: `break-buffs.test.ts`.
  - **Behaviour change:** break hits now have tags, so they appear in `damageByTag` under `break` / `superBreak`, and `dmgBoostMultiplier` can be above 1 for them.
  - **For the frontend:** F7, new issue message: `damage tag "<tag>" is only for break steps`.
- [x] E5. Effect stacking policies per effect: `refresh` | `independent` | `noRefresh`. This replaces assumption A1. *Done 2026-11-07:* optional `EffectDef.stacking` (default `refresh`, the old behaviour, so existing scenarios are unchanged) and the exported list `STACKING_POLICIES`. Semantics are in `types.ts` (`StackingPolicy`) and `ARCHITECTURE.md § Manual rotation engine`; tests are in `stacking.test.ts`.
  - **For the frontend:** F4, add a stacking selector to the effect editor, defaulting to `refresh`, and explain that `independent` makes `maxStacks` a cap on the total. F1, the scenario sanitizer must keep `stacking`: today it drops the field, so an imported effect falls back to `refresh`.
- [x] E6. Optional SPD/AV timeline helper, which would generate a turn order suggestion. *Done 2026-11-08:* `suggestTurnOrder(input)` and `timelineToEvents(result)` in `src/engine/timeline.ts`, with `validateTimelineInput`, `ACTION_GAUGE` and `MAX_TIMELINE_TURNS`. Mechanics from S4/S5 with tags in `FORMULAS.md § Action Value`; the API is in `ARCHITECTURE.md § Turn order helper (E6)`. Tests: `timeline.test.ts` (14, hand-computed). Cycle lengths have no default: the caller supplies `cycleAv`, since 150/100 AV is unsourced.
  - **For the frontend (optional, new task):** a "suggest turn order" panel per team. Take SPD for allies from `resolveUnitStats(createInitialState(team, enemies), id).spd` and ask for enemy SPD, an AV limit, optional cycle lengths (offer `CHALLENGE_CYCLE_AV` as a preset) and adjustments (advance/delay %, SPD change, "immediately take action" (`actNow`), "at start" or "after turn N of unit X"). Show `turns` (unit, turn, AV, cycle), warn on `truncated` and `unusedAdjustments`, and offer to insert `timelineToEvents(result)` into the rotation. New issue messages to translate: `spd must be a finite number > 0`, `side must be "ally" or "enemy"`, `duplicate id "<id>"`, `avLimit: must be a finite number > 0`, `cycleAv.first` / `cycleAv.later: must be a finite number > 0`, `unknown unit "<id>" in at`, `at.turn must be an integer >= 1`, `unknown target "<id>"`, `needs advance, spd or actNow`, `actNow must be true when set`, `advance must be a finite number`.
  - **For the frontend (E1, 2026-11-08):** break and Super Break hits now always show a Weaken multiplier of 1; `stats.weaken` still shows the attacker's Weaken. No API change.
- [x] E11. Super Break as Break DMG. *Done 2026-11-08:* the engine follows S3. A Super Break hit also matches `break` modifiers, and `dmgBoostMultiplier` is (1 + Break DMG Increase) × (1 + Super Break DMG Increase). R1's additive `SUPER_BREAK_MODIFIER` is the ability multiplier, which is unchanged (`superBreakDmg` stat), so S3 and R1 do not actually conflict there. `HitResult.tags` is still `['superBreak']`, so `damageByTag` is unchanged. Formula: `FORMULAS.md § Super Break DMG`. Tests: `break-buffs.test.ts`.
  - **Behaviour change:** `break`-tagged DMG Boost and Break DMG vulnerability now reach Super Break hits, so totals for scenarios with both change.
  - **API additions:** `BreakDetails.breakDmgIncrease` (required) and `superBreakDmgIncrease` (Super Break only).
  - **For the frontend:** F6, show `breakDmgIncrease` and, for Super Break, `superBreakDmgIncrease` in the break details, and explain that `dmgBoostMultiplier` is their product. F4/F5, the modifier condition help text may say that `break` conditions also reach Super Break. Code that builds `BreakDetails` by hand must add `breakDmgIncrease`.
- [x] E12. Debuff RES in the DoT application chance (S3: `× (1 − Debuff RES)`). *Done 2026-11-08:* `DOT_TYPES` / `DotType` (`bleed`, `burn`, `shock`, `windShear`), optional `EnemyConfig.debuffRes` (fractions per DoT type, default 0), optional `HitSpec.dotType` (needs `baseChance`), `formulas.dotApplicationChance` with a fifth argument (default 0), and `DamageInput.targetDebuffRes`. `ResolvedHitStats` and `DamageBreakdown` are unchanged: the factor is folded into `dotChanceMultiplier`. Formula: `FORMULAS.md § DoT application chance`. Tests: `dot-chance.test.ts`.
  - **For the frontend:** F3, add a Debuff RES (%) field per DoT type to the enemy editor. F5, add a DoT type selector to the hit editor, shown when `baseChance` is set (blank = none). F1, the scenario sanitizer must keep `debuffRes` and `dotType`. F7, new issue messages: `debuffRes: unknown DoT type "<x>"`, `debuffRes.<type>: must be a finite number` on an enemy, and `unknown DoT type "<x>"` and `dotType needs baseChance` on a hit.
- [x] E7. Stat-conversion modifiers, evaluated at hit time. *Done 2026-11-07:* optional `EffectDef.conversions` (`StatConversion`: `from` one of `CONVERSION_SOURCES`, `fromUnit` `holder` | `source`, `to`, `ratio`, `threshold`, `cap`, `condition`). Single pass, no chaining (KNOWN_LIMITATIONS A9). Formula: `FORMULAS.md § Stat conversion`. Tests: `conversion.test.ts`.
  - **For the frontend:** F4, add a conversion list to the effect editor (source stat, from holder or source, target stat, ratio %, optional threshold and cap, condition). F1, the scenario sanitizer must keep `conversions`. F7, new issue messages: `unknown conversion source "<x>"`, `fromUnit must be "holder" or "source"`, and `ratio` / `threshold` / `cap must be a finite number`.

- **Stubs in frontend files for E4 follow-up and E8 (owner-approved, 2026-11-07).** To keep `pnpm check` green, the engine owner added these. Frontend: please review the wording and replace the stubs with real UI.
  - `zh-HK.ts` labels: `tag.break` 擊破傷害, `tag.superBreak` 超擊破傷害, `stat.breakEfficiency` 弱點擊破效率, `stat.superBreakDmg` 超擊破傷害倍率, `stat.effectResPen` 效果抵抗穿透, `results.dotChanceMultiplier` 持續傷害命中機率乘數, `results.targetEffectRes` 目標效果抵抗. `results.breakBaseNote` was reworded, because break hits can now have a DMG Boost above 1.
  - `HitResults.tsx`: label entries for `dotChanceMultiplier`, `effectHitRate`, `effectResPen` and `targetEffectRes`.
  - `HitEditor.tsx`: the tag picker uses `HIT_DAMAGE_TAGS` instead of `DAMAGE_TAGS`, since validation rejects the break tags on `hit` steps. `ModifierList.tsx` keeps `DAMAGE_TAGS`, so conditions can name the break tags.
  - `Results.test.tsx`: break hits now appear in the by-tag table, the hit table has one more factor column (20 headers, 22 resolved stats), and the break-kind summary is matched with `selector: 'summary'`, because the tags cell shows the same words.

## Engine change requests (from frontend)

_Append requests here: what you need, why, and the proposed API._

- **Unit ID validation for editable enemies (F3–F6).** Please have `validateRotationInput` report per-unit issues for IDs `allAllies`, `allEnemies`, and `__proto__`. The first two are group references in apply/remove steps, and assigning the last to the plain object in `createInitialState` changes its prototype, omitting the unit from group targeting. The results view rejects these IDs before running the engine. Engine validation would provide the same protection to imports and other callers through the existing API.
  - **Handled 2026-11-07 (engine).** `validateRotationInput` now reports `team[i]: id "<id>" is reserved` / `enemies[i]: id "<id>" is reserved` for each ID in the newly exported `RESERVED_UNIT_IDS` (`allAllies`, `allEnemies`, `__proto__`). `createInitialState` and `setBroken` now build the units record with a null prototype, so even direct callers keep a `__proto__` unit in group targeting and no ID hits an inherited property. `CombatState` is unchanged. Regression tests are in `src/engine/__tests__/reserved-ids.test.ts`. **Frontend follow-up:** add an `issuePatterns` entry for `/^id "(.*)" is reserved$/s` with a zh-HK key, and the results view may reuse `RESERVED_UNIT_IDS` instead of its own list.

## Frontend handoff verification (2026-11-08)

- [x] **Reserved unit IDs (F7/F11).** The shared zh-HK translator handles engine issues for both character and enemy IDs. Results use engine validation directly. Tests cover both path formats and all three reserved IDs.
- [x] **Break and Super Break (E4).** Character and enemy inputs, the rotation editor, and scenario import and sharing support both kinds. The results table groups them by their damage tags and shows the engine's combined Weakness Break Efficiency bonus for Super Break. The normal hit picker excludes both tags, and modifier conditions allow them.
- [x] **Stacking, conversions and DoT application chance (E5/E7/E8).** The editors, scenario field allowlist and validation translations cover the handoff fields. The DoT column describes application chance and displays the engine's factor. Its expanded stats show Effect Hit Rate, Effect RES PEN and target Effect RES. The temporary label and result-field annotations have been reviewed and removed.
