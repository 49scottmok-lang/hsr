# Tasks

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done. Owners are defined in `ARCHITECTURE.md § Module ownership`.

## Done (engine, 2026-11-07)

- [x] Scaffold Vite 8 + React 19 + TypeScript 7 + Vitest 5 + oxlint.
- [x] Engine types, formulas, stats, damage, effects, manual rotation, comparison, and validation.
- [x] Engine independence guards: typecheck, lint, and test.
- [x] 63 unit tests, including the hand-computed worked example.

---

## Frontend tasks (owner: Codex)

Rules for every task:

- Import only from `src/engine` (the index), and never re-implement formulas.
- Use plain, unstyled-but-usable UI. No visual polish yet.
- Add component tests: Vitest + `@testing-library/react` + `jsdom`, with `// @vitest-environment jsdom` per test file. The engine stays on `node`.
- `pnpm check` must pass before each commit.

### F1. Scenario state model — `src/ui/state/`

- [ ] Define a `Scenario` type: `{ enemies: EnemyConfig[]; critMode: CritMode; teams: [TeamDraft, TeamDraft] }`, where `TeamDraft = { label; team: CharacterBuild[]; events: RotationEvent[]; cycles?: number }`.
- [ ] Add a pure function `toRotationInput(scenario, teamIndex): RotationInput`. Both teams must share the same `enemies` and `critMode`.
- [ ] Use a reducer (`useReducer`) with actions to add, update, remove and reorder characters, effects, events and steps.
- [ ] Add JSON export and import of a `Scenario`. On import, run `validateRotationInput` for each team and show the issues.
- **Acceptance:** the reducer and `toRotationInput` are unit-tested (node env). A round-trip export → import gives a deep-equal result.

### F2. Character build editor — `src/ui/components/CharacterEditor.tsx`

- [ ] Add numeric inputs for level, element, base HP/ATK/DEF/SPD, optional base CRIT, LC base HP/ATK/DEF, and relic stat totals as a `StatModifier` list editor. Each row picks a `STAT_KEYS` stat, a value, and an optional condition (elements and damage tags).
- [ ] Enter percentages in the UI as `%`, and divide by 100 when storing.
- [ ] Show live final stats via `resolveUnitStats(createInitialState([build], [anyEnemy]), build.id)`.
- **Acceptance:** typing ATK% 50 stores `0.5`. The displayed final ATK matches the engine.

### F3. Enemy editor — `src/ui/components/EnemyEditor.tsx`

- [ ] Add inputs for id, name, level, optional base DEF override, per-element RES (%), and the initial broken toggle.
- **Acceptance:** when base DEF is empty, the UI shows "200 + 10 × level (unverified)" as a hint.

### F4. Effect editor — `src/ui/components/EffectEditor.tsx`

- [ ] Edit an `EffectDef`: id, name, kind, modifiers (reuse the F2 modifier list), maxStacks, an optional duration (turns, tickUnit, tickPhase, tickOnApplyTurn), and a `source` text field.
- [ ] Add a per-team **effect library**. Steps reference effects from it, and the full `EffectDef` is copied into the step on export.
- **Acceptance:** the duration controls explain the tick semantics inline, with a link to KNOWN_LIMITATIONS A2.

### F5. Manual rotation editor — `src/ui/components/RotationEditor.tsx`

- [ ] Show an ordered list of events. Add a Turn or an Extra event, choose the actor, add a label, and reorder with up/down buttons (no drag-and-drop needed).
- [ ] Each event has an ordered step list: `hit` (target, scaling, multiplier %, element override, tags multi-select, canCrit override, label), `apply` (effect from the library, target or allAllies/allEnemies, stacks), `remove`, and `setBroken`.
- [ ] Add a "duplicate event" button to make repeating cycles quick.
- **Acceptance:** you can build both `rotation.test.ts` scenarios ("buff applied earlier" and "enemy debuff ticking") in the UI, and they give the same totals as the tests.

### F6. Results & comparison view — `src/ui/components/Results.tsx`

- [ ] Call `runRotation` on each team, then `compareTeams`.
- [ ] Show totals, damage per cycle, the B−A difference and the B/A ratio.
- [ ] Show tables of damage by attacker and by tag. Add a footnote that multi-tag hits are counted under each tag (A5).
- [ ] Add a hit-by-hit table: event, label, attacker, target, element, tags, and **every** `DamageBreakdown` factor plus damage. Each row expands to show `ResolvedHitStats`.
- [ ] Show the per-event log, including expired effects.
- [ ] Round only for display: integers for damage, 4 decimals for multipliers.
- **Acceptance:** the numbers match the engine output exactly before display rounding. A test renders the worked example from `FORMULAS.md` and finds `4386` (4385.83 rounded).

### F7. Validation UX

- [ ] Catch `EngineValidationError` and list its `issues`. Map each `events[i].steps[j]` path to the matching editor row where possible.
- **Acceptance:** an invalid target shows a visible error and does not crash the app.

### F8. Local persistence

- [ ] Autosave the current scenario to `localStorage`, wrapping access in try/catch. Add a "Reset" button.
- **Acceptance:** the app still works when `localStorage` throws.

### F9. Disclaimers

- [ ] Add a persistent footer: "All game numbers are user-entered. Formulas marked UNVERIFIED in docs/FORMULAS.md may differ from the game."

---

## Engine backlog (owner: engine)

- [ ] E1. Verify the [UNVERIFIED] items in `FORMULAS.md` against a primary community source (Fandom wiki Damage page, Prydwen, datamined references) and update the tags.
- [ ] E2. Reconcile the architecture with the master specification once it is added to `docs/`.
- [ ] E3. Data layer: a schema plus a validator for `src/data` entries that requires a `source` on every number-bearing record.
- [ ] E4. Break / Super Break DMG. This needs the sourced level multiplier table.
- [ ] E5. Effect stacking policies per effect: `refresh` | `independent` | `noRefresh`. This replaces assumption A1.
- [ ] E6. Optional SPD/AV timeline helper, which would generate a turn order suggestion.
- [ ] E7. Stat-conversion modifiers, evaluated at hit time.

## Engine change requests (from frontend)

_Append requests here: what you need, why, and the proposed API._
