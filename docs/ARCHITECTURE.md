# Architecture

## Goal

The HSR Team Damage Comparator compares the damage of two teams. Each team gets a **user-defined manual rotation** against the **same enemy scenario**. The MVP is deliberately narrow: the formulas must be correct and transparent, and every number comes from the user.

> **Spec:** see `docs/SPEC.md` for the master specification, the requirement-to-module mapping, interpretation decisions, and open questions. It was received and reconciled on 2026-11-07, which added eidolon support.

## Layers

```
┌────────────────────────────────────────────┐
│ src/ui/       React UI (frontend agent)    │  forms, rotation editor, results
│   └─ imports ONLY from 'src/engine' index  │
├────────────────────────────────────────────┤
│ src/import/   account import (I1 done)     │  Reliquary Archiver → CharacterBuild
├────────────────────────────────────────────┤
│ src/data/     sourced stat tables (D2–D3)  │  cited, validated, no kit logic
├────────────────────────────────────────────┤
│ src/engine/   pure TypeScript engine       │  no React, no DOM, no I/O
└────────────────────────────────────────────┘
```

Dependency direction: `ui → engine`, `ui → import`, `ui → data`, `import → data`, `import → engine`, `data → engine`. `data` and `import` use the engine's types and its pure `formulas` (e.g. the level-scaling formulas), never its rotation state. **The engine never imports from `ui`, `import` or `data`.** `src/data` and `src/import` follow the same framework-free rules as the engine: no React, no DOM, no I/O, and the import receives the file contents as a parsed object.

`scripts/data/` holds the Node generator scripts that write `src/data/generated/` (TASKS D3). They are the only code that touches the network, and they run by hand, never in the app or in tests.

**Build chunks** (`vite.config.ts`, 2026-11-08): `pnpm build` splits `src/data/generated/` into a `data-tables` chunk and React into a `react` chunk. The stat tables are most of the bundle and change only on a re-pin, so an app update re-downloads only the app chunk. It also keeps every chunk under Vite's 500 kB warning.

Engine independence is enforced three ways (and the same three cover `src/data` and `src/import`):

1. **Typecheck.** `tsconfig.engine.json` compiles `src/engine`, `src/data` and `src/import` with `lib: ["ES2023"]` and no DOM, so any use of `document`, `window`, etc. fails `pnpm typecheck` and `pnpm build`. `tsconfig.scripts.json` type-checks `scripts/` with Node types.
2. **Lint.** In `.oxlintrc.json`, `no-restricted-imports` blocks `react`, `react-dom`, `**/ui/**`, `**/data/**` and `**/import/**` inside `src/engine/**`, and React and `**/ui/**` inside `src/data/**` and `src/import/**`.
3. **Test.** `src/engine/__tests__/architecture.test.ts` scans engine sources for React, UI or DOM references. `src/data/__tests__/architecture.test.ts` does the same for `src/data` and `src/import`, and also rejects `node:` imports, `fetch`, `Date.now` and `Math.random`.

## Engine modules

| File | Responsibility | Pure? |
|---|---|---|
| `types.ts` | All domain interfaces and enumerations (`ELEMENTS`, `DAMAGE_TAGS` with its subsets `HIT_DAMAGE_TAGS` / `BREAK_DAMAGE_TAGS`, `STAT_KEYS`, `CONVERSION_SOURCES`, `STACKING_POLICIES`). | types only |
| `formulas.ts` | One function per formula in `FORMULAS.md`, plus the documented constants. | yes |
| `stats.ts` | Modifier and stat-conversion collection (E7), condition matching, final unit stats. | yes |
| `damage.ts` | `resolveHitStats` → `computeBreakdown` → `calculateHit`. | yes |
| `breakDamage.ts` | Break and Super Break DMG (E4): `computeBreakBreakdown`, `calculateBreakHit`. | yes |
| `effects.ts` | Buff/debuff lifecycle: `applyEffect`, `removeEffect`, `tickEffects`. | yes (returns new state) |
| `rotation.ts` | `createInitialState`, `runRotation` (manual rotation engine). | yes |
| `compare.ts` | `compareTeams`. | yes |
| `timeline.ts` | Turn order helper (E6): `suggestTurnOrder`, `timelineToEvents`, `validateTimelineInput`, `ACTION_GAUGE`, `CHALLENGE_CYCLE_AV`, `MAX_TIMELINE_TURNS`. | yes |
| `autoBattle.ts` | Auto battle (D7): `simulateBattle`, `validateAutoBattleInput`, `energyGain`. | yes |
| `validate.ts` | `validateRotationInput`, `EngineValidationError`, `RESERVED_UNIT_IDS` (unit IDs that validation rejects). | yes |
| `index.ts` | **Public API.** The only import path for UI code. | — |

`formulas` (exported as a namespace) also holds the stat-table level formulas `promotedBaseStat` and `relicMainStatValue` (added 2026-11-07, `FORMULAS.md § Level scaling`), the break formulas `BREAK_ELEMENT_FACTOR`, `breakToughnessFactor`, `breakBaseDmg`, `superBreakToughness`, `superBreakBaseDmg` and `breakEffectMultiplier` (E4, `FORMULAS.md § Break DMG`), `dotApplicationChance` (E8, `FORMULAS.md § DoT application chance`), `combinedWeaken` (E1, `FORMULAS.md § Weaken`), and `enemyStageStat` and `STANCE_PER_TOUGHNESS` (D6, `FORMULAS.md § Enemy stats`, used by `src/data`).

## Data and import modules

| Module | Public API (`index.ts`) |
|---|---|
| `src/data` | `DATA_TABLES`, record types (`CharacterRecord`, `LightConeRecord`, `RelicMainStatRecord`, `SetBonusRecord`, `TraceRecord`), `validateDataTables`, lookups `characterBase`, `lightConeBase`, `relicMainStat`, `setBonus2pc`, `statTrace`, `breakLevelMultiplier` (E4) (each returns `{ ok: true, value } \| { ok: false, reason }` or `undefined`), the pinned `DATA_COMMIT` / `DATA_GAME_VERSION`, `DATA_CREDITS` / `GAME_DATA_NOTICE` (D4), and the Traditional Chinese `NAME_TABLES` with `validateNameTables` and the lookups `characterName`, `lightConeName`, `relicSetName`, `pathName` (D5). Endgame enemies (D6): `ENEMY_TABLES` with `validateEnemyTables`, `endgameStages(tables, mode)`, `stageEnemies(tables, stageId)` (each enemy scaled to its stage: level, HP, DEF, SPD, displayed Toughness, Effect RES) and `stageEnemyConfig(stageEnemy, unitId)` (→ engine `EnemyConfig`). |
| `src/import` | `parseArchive(json)` (I1): checks and normalises a Reliquary Archiver export, drops the UID, gacha and materials, and returns `{ ok: true, archive, warnings } \| { ok: false, errors }`. `importArchive(archive, tables)` (I2) returns `{ builds, report }`: one `CharacterBuild` per character the tables cover, plus an `ImportReport` whose items (`lookedUp`, `toEnter`, `problems`) are structured with a `kind` so the UI can translate them. |

`CombatState.units` is a null-prototype record keyed by unit ID (added 2026-11-07), so read it with indexing, `Object.keys` or `Object.values` rather than `Object.prototype` methods such as `units.hasOwnProperty`.

All engine functions are deterministic. None mutates its inputs, and this is tested. `CombatState` is treated as immutable.

## Data model (summary)

Full definitions are in `src/engine/types.ts`.

- **`CharacterBuild`**: id, optional `characterId` (game character ID for portraits and names; display metadata the engine never reads), level, element, base HP/ATK/DEF/SPD, optional base CRIT, optional `breakLevelMultiplier` (E4), `lightCone` (base stats plus passive `EffectDef[]`), `relics` (summed `StatModifier[]` plus set-bonus `EffectDef[]`), `traces`, `passiveEffects`.
- **`EnemyConfig`**: id, level, optional `baseDef`, per-element `res`, initial `broken`, optional `maxToughness` (displayed units, E4), optional `effectRes` (E8), optional `debuffRes` per DoT type (E12), optional `spd` (D6: for the turn order helper's caller only; `runRotation` never reads it), `passiveEffects`.
- **`StatModifier`**: `{ stat, value, condition? }`. The condition can filter on hit element, damage tags (any-of), or counterpart unit IDs.
- **`EffectDef`** (buff or debuff): id, kind, modifiers, optional `conversions` (`StatConversion[]`, E7), `DurationSpec`, `maxStacks`, `stacking` (E5), `source`.
- **`StatConversion`** (E7): `to` += min(`cap`, `ratio` × stacks × max(0, `from` − `threshold`)), with `from` one of `CONVERSION_SOURCES`, read from the holder (default, in the hit context) or the effect's source (`fromUnit: 'source'`, context-free), without other conversions.
- **`EffectInstance`**: a live effect on a holder, with stacks, remaining turns, resolved tick unit, and the skip flag.
- **`CombatState`**: units by ID, effect instances, and the active turn unit.
- **`HitSpec`**: attacker, target, scaling stat, multiplier, element, tags (`HIT_DAMAGE_TAGS` only), `canCrit`, and for DoT an optional `baseChance` (E8) and `dotType` (E12, one of `DOT_TYPES`), which picks the target's `EnemyConfig.debuffRes` entry.
- **`RotationEvent`**: either `turn` (ticks durations at the start and end) or `extra` (no ticking). Each holds ordered `ActionStep`s: `apply`, `remove`, `hit`, `break` or `setBroken`.
- **`BreakHitSpec`** (E4, the `break` step): `kind: 'break'` (Break DMG, optional `multiplier`) or `kind: 'superBreak'` (`toughnessReduction`, optional `breakEfficiency` and `fixedToughnessReduction`, `multiplier`). Its `HitResult` has `break: BreakDetails`, the single tag `break` or `superBreak` (E4 follow-up), `canCrit: false`, and `breakdown.baseDmg` that already includes 1 + Break Effect. `BreakDetails.breakEfficiency` and `multiplier` for Super Break include the attacker's `breakEfficiency` / `superBreakDmg` stats. A Super Break hit also matches `break` modifiers (E11), and `BreakDetails.breakDmgIncrease` / `superBreakDmgIncrease` are the two factors whose product is `dmgBoostMultiplier`.
- **`DamageBreakdown`** has `dotChanceMultiplier` (E8; 1 unless a DoT sets `baseChance`; includes the E12 Debuff RES factor), and `ResolvedHitStats` has `effectHitRate`, `effectResPen` and `targetEffectRes`. Both are required fields, added 2026-11-07: code that builds these objects by hand must add them.
- **`RotationResult`**: per-hit `HitResult` (stats and breakdown), per-event log, totals by attacker and tag, per-cycle damage, and final state.

### Holder-side modifier semantics

A modifier always belongs to the unit that **holds** the effect. During a hit:

- **Attacker-held keys** are `atk*`, `hp*`, `def*` (scaling), `critRate`, `critDmg`, `dmgBoost`, `defIgnore`, `resPen`, `weaken`, `finalDmgBoost` (each modifier multiplies), `trueDmg`, `breakEffect`, `breakEfficiency` and `superBreakDmg` (break hits), and `effectHitRate` and `effectResPen` (DoT chance).
- **Target-held keys** are `defPct`, `defFlat`, `defReduction`, `resReduction`, `vulnerability`, `dmgMitigation` and `effectRes`.

So a "DEF reduction" debuff is an effect applied **to the enemy**, and a "DMG +X%" team buff is applied **to each ally**.

### Eidolon gating

- `CharacterBuild.eidolon` (0–6, default 0) is checked against `requires.minEidolon`.
- `EffectDef.requires` is checked against the effect's **source**, which for always-on effects is the holder. `ActionStep.requires` is checked against the step's source: the attacker for `hit`, `sourceId` for `apply`, and otherwise the event actor.
- Steps that fail the check are skipped and listed in `EventLogEntry.skippedSteps`, so one rotation can be reused across eidolon levels.
- `LightCone.superimposition` (1–5) is metadata only.

### Conditional modifiers

A modifier with a condition only applies during a hit whose context matches: the element, at least one of the damage tags, and the counterpart ID. Break hits are the exception for DMG Boost: only `dmgBoost` modifiers whose condition names `break` / `superBreak` apply to them (`FORMULAS.md § Break DMG`). `resolveUnitStats(state, id)` without a context shows unconditional stats only, which suits a character sheet.

## Manual rotation engine

```
runRotation(input):
  validate(input)                → throws EngineValidationError(issues[])
  state = createInitialState()   → units + permanent LC / relic-set / passive effects
  for event in input.events (user order):
     if turn:  activeTurn = actor; tick(actor, turnStart)
     run steps in order:
        apply   → applyEffect (refresh/stack rules)
        remove  → removeEffect
        setBroken
        hit     → calculateHit against the CURRENT state → HitResult
        break   → calculateBreakHit against the CURRENT state → HitResult (with .break)
     if turn:  tick(actor, turnEnd); activeTurn = none
  aggregate totals
```

- `runRotation` does **not** simulate SPD, action order, energy, or toughness. The user's event list is the authority. The separate turn order helper (below) can *suggest* the order of `turn` events.
- Effects applied in a step affect every later step in the same event, but not earlier ones.
- Duration ticking is explicit per effect (`DurationSpec.tickUnit` / `tickPhase`). By default, an effect that ticks at `turnEnd` and is applied during its tick unit's own turn is **not** decremented at the end of that turn. Set `tickOnApplyTurn` to change this. The game behaviour behind this default is **UNVERIFIED** (see `KNOWN_LIMITATIONS.md`).
- Re-applying the same effect ID to the same holder follows the effect's `stacking` policy (E5, `STACKING_POLICIES`): `refresh` (default) replaces the definition, adds stacks up to `maxStacks` and restarts the duration; `noRefresh` keeps the live instance and only adds stacks; `independent` adds a separate instance with its own duration, and `maxStacks` caps the holder's total by trimming the oldest instances. Only the default is an **ASSUMPTION** (KNOWN_LIMITATIONS A1).

## Turn order helper (E6)

```
suggestTurnOrder({ units, avLimit, adjustments?, cycleAv? }) → { turns, truncated, unusedAdjustments }
timelineToEvents(result) → RotationEvent[]   (empty 'turn' events, ids "turn-<n>-<unitId>")
```

- **Input.** `units` are `{ id, side, spd }` in slot order. The caller supplies SPD: for allies, `resolveUnitStats(createInitialState(team, enemies), id).spd`; for enemies, user input, because `EnemyConfig` has no SPD. `adjustments` are manual Action Advance/Delay (`advance`, a fraction of the 10000 gauge, negative for delay; the gauge never goes below 0), "immediately take action" (`actNow`, gauge set to 0) and absolute SPD changes, each triggered at battle start or right after a given turn of a given unit. `cycleAv` is optional; `CHALLENGE_CYCLE_AV` holds the sourced 150/100 AV.
- **Output.** `turns` lists each turn with the unit's own turn count, the elapsed AV and, with `cycleAv`, the cycle. `truncated` is true when `MAX_TIMELINE_TURNS` stopped it; `unusedAdjustments` lists adjustments whose trigger turn never came.
- **Scope.** Only turns. Ultimates, follow-ups, energy, skill points and kit-driven advances are not simulated: the user enters them (as adjustments or `extra` events). Formulas and tags: `FORMULAS.md § Action Value`.
- **Why not an APL simulator (E9).** R2's APL (`action on target if condition`, first matching line wins, ultimates in their own windows) needs energy, skill points, kit state and targeting for every character. This project ships no kit data (SPEC D5, AGENTS rule 3), so an APL would run on invented numbers. The helper takes R2's timeline layer only, and keeps the manual event list as the authority.
- Throws `EngineValidationError` (issues in the same English style) on invalid input.

## Auto battle (D7)

```
simulateBattle({ team, enemies, kits, avLimit, cycleAv?, skillPoints: { start, max } })
  → { events, actions, truncated, cycles? }
validateAutoBattleInput(input) → string[]
```

- **Input.** One `AutoKit` per team member that should act: `basic` (steps, Energy, skill points gained), optional `skill` (skill points spent) and `ultimate` (`energyCost`), `startEnergy`, `useSkill`, `skillPointReserve`, `useUltimate`. Every enemy needs `EnemyConfig.spd`. All numbers are user input; the UI may pre-fill `ultimate.energyCost` from `characterEnergyCost` in `src/data`.
- **Output.** `events` is an ordinary `RotationEvent[]` (ids `auto-<n>`; turns as `turn`, Ultimates as `extra`), which the UI puts into the team's rotation and `runRotation` scores. `actions` is a log, one entry per event, with the action kind, AV, cycle, skill points after it and the actor's Energy after it.
- **Rules.** `FORMULAS.md § Auto battle`. The turn order is `suggestTurnOrder` with static SPD; actions never move gauges.
- **Why semi-auto.** The project ships no kit data (SPEC D5, AGENTS rule 3), so the user enters each kit once and the simulator only repeats it under the Energy and skill point rules. The generated rotation stays editable by hand.
- Throws `EngineValidationError` on invalid input; paths name the kit (`kits[i].skill.steps[0]…`).

## Team comparison

`compareTeams(a, b, labels)` returns B − A and B / A for total damage. When both results declare `cycles`, it also does this per cycle. The UI must make both rotations use the same enemies and `critMode`, otherwise the comparison is meaningless.

## Module ownership

| Path | Owner | Others may |
|---|---|---|
| `src/engine/**` (including `__tests__`) | **Engine owner** (Claude / lead architect) | Read and import via `src/engine/index.ts` only. Request changes in `docs/TASKS.md § Engine change requests`. |
| `src/ui/**`, `src/main.tsx`, `src/index.css`, `index.html`, `public/**` | **Frontend agent** (Codex) | — |
| `src/data/**` | **Engine owner** (tasks D1–D4; citations required) | Frontend may read. |
| `src/import/**` | **Engine owner** (tasks I1–I3) | Frontend calls `parseArchive()` / `importArchive()` only. |
| `scripts/**` | **Engine owner** (D3 generators) | — |
| `src/ui/i18n/**`, `src/ui/share/**` | **Frontend agent** (F11, F13) | — |
| `docs/ARCHITECTURE.md`, `docs/FORMULAS.md` | Engine owner | Propose edits via TASKS.md. |
| `docs/TASKS.md`, `docs/KNOWN_LIMITATIONS.md` | Shared | Append. Don't delete others' items. |
| `package.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `.oxlintrc.json` | Engine owner | Frontend may add UI deps and UI test setup. Note the change in the commit. |

Contract rules:

- **Public API stability.** Exports from `src/engine/index.ts` are the contract. A breaking change requires updating this document and noting it in `TASKS.md`.
- The UI must not re-implement any formula. Any number shown must come from engine output (`HitResult.breakdown`, `RotationResult`, `resolveUnitStats`).
- The UI may build `RotationInput` objects, and must surface `EngineValidationError.issues` to the user.
