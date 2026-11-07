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

Engine independence is enforced three ways (and the same three cover `src/data` and `src/import`):

1. **Typecheck.** `tsconfig.engine.json` compiles `src/engine`, `src/data` and `src/import` with `lib: ["ES2023"]` and no DOM, so any use of `document`, `window`, etc. fails `pnpm typecheck` and `pnpm build`. `tsconfig.scripts.json` type-checks `scripts/` with Node types.
2. **Lint.** In `.oxlintrc.json`, `no-restricted-imports` blocks `react`, `react-dom`, `**/ui/**`, `**/data/**` and `**/import/**` inside `src/engine/**`, and React and `**/ui/**` inside `src/data/**` and `src/import/**`.
3. **Test.** `src/engine/__tests__/architecture.test.ts` scans engine sources for React, UI or DOM references. `src/data/__tests__/architecture.test.ts` does the same for `src/data` and `src/import`, and also rejects `node:` imports, `fetch`, `Date.now` and `Math.random`.

## Engine modules

| File | Responsibility | Pure? |
|---|---|---|
| `types.ts` | All domain interfaces and enumerations (`ELEMENTS`, `DAMAGE_TAGS`, `STAT_KEYS`). | types only |
| `formulas.ts` | One function per formula in `FORMULAS.md`, plus the documented constants. | yes |
| `stats.ts` | Modifier collection, condition matching, final unit stats. | yes |
| `damage.ts` | `resolveHitStats` → `computeBreakdown` → `calculateHit`. | yes |
| `effects.ts` | Buff/debuff lifecycle: `applyEffect`, `removeEffect`, `tickEffects`. | yes (returns new state) |
| `rotation.ts` | `createInitialState`, `runRotation` (manual rotation engine). | yes |
| `compare.ts` | `compareTeams`. | yes |
| `validate.ts` | `validateRotationInput`, `EngineValidationError`, `RESERVED_UNIT_IDS` (unit IDs that validation rejects). | yes |
| `index.ts` | **Public API.** The only import path for UI code. | — |

`formulas` (exported as a namespace) also holds the stat-table level formulas `promotedBaseStat` and `relicMainStatValue` (added 2026-11-07, `FORMULAS.md § Level scaling`).

## Data and import modules

| Module | Public API (`index.ts`) |
|---|---|
| `src/data` | `DATA_TABLES`, record types (`CharacterRecord`, `LightConeRecord`, `RelicMainStatRecord`, `SetBonusRecord`, `TraceRecord`), `validateDataTables`, lookups `characterBase`, `lightConeBase`, `relicMainStat`, `setBonus2pc`, `statTrace` (each returns `{ ok: true, value } \| { ok: false, reason }` or `undefined`), the pinned `DATA_COMMIT` / `DATA_GAME_VERSION`, and `DATA_CREDITS` / `GAME_DATA_NOTICE` (D4). |
| `src/import` | `parseArchive(json)` (I1): checks and normalises a Reliquary Archiver export, drops the UID, gacha and materials, and returns `{ ok: true, archive, warnings } \| { ok: false, errors }`. `importArchive(archive, tables)` (I2) returns `{ builds, report }`: one `CharacterBuild` per character the tables cover, plus an `ImportReport` whose items (`lookedUp`, `toEnter`, `problems`) are structured with a `kind` so the UI can translate them. |

`CombatState.units` is a null-prototype record keyed by unit ID (added 2026-11-07), so read it with indexing, `Object.keys` or `Object.values` rather than `Object.prototype` methods such as `units.hasOwnProperty`.

All engine functions are deterministic. None mutates its inputs, and this is tested. `CombatState` is treated as immutable.

## Data model (summary)

Full definitions are in `src/engine/types.ts`.

- **`CharacterBuild`**: id, level, element, base HP/ATK/DEF/SPD, optional base CRIT, `lightCone` (base stats plus passive `EffectDef[]`), `relics` (summed `StatModifier[]` plus set-bonus `EffectDef[]`), `traces`, `passiveEffects`.
- **`EnemyConfig`**: id, level, optional `baseDef`, per-element `res`, initial `broken`, `passiveEffects`.
- **`StatModifier`**: `{ stat, value, condition? }`. The condition can filter on hit element, damage tags (any-of), or counterpart unit IDs.
- **`EffectDef`** (buff or debuff): id, kind, modifiers, optional `DurationSpec`, `maxStacks`, `source`.
- **`EffectInstance`**: a live effect on a holder, with stacks, remaining turns, resolved tick unit, and the skip flag.
- **`CombatState`**: units by ID, effect instances, and the active turn unit.
- **`HitSpec`**: attacker, target, scaling stat, multiplier, element, tags, and `canCrit`.
- **`RotationEvent`**: either `turn` (ticks durations at the start and end) or `extra` (no ticking). Each holds ordered `ActionStep`s: `apply`, `remove`, `hit` or `setBroken`.
- **`RotationResult`**: per-hit `HitResult` (stats and breakdown), per-event log, totals by attacker and tag, per-cycle damage, and final state.

### Holder-side modifier semantics

A modifier always belongs to the unit that **holds** the effect. During a hit:

- **Attacker-held keys** are `atk*`, `hp*`, `def*` (scaling), `critRate`, `critDmg`, `dmgBoost`, `defIgnore`, `resPen`, `weaken`, `finalDmgBoost` (each modifier multiplies) and `trueDmg`.
- **Target-held keys** are `defPct`, `defFlat`, `defReduction`, `resReduction`, `vulnerability` and `dmgMitigation`.

So a "DEF reduction" debuff is an effect applied **to the enemy**, and a "DMG +X%" team buff is applied **to each ally**.

### Eidolon gating

- `CharacterBuild.eidolon` (0–6, default 0) is checked against `requires.minEidolon`.
- `EffectDef.requires` is checked against the effect's **source**, which for always-on effects is the holder. `ActionStep.requires` is checked against the step's source: the attacker for `hit`, `sourceId` for `apply`, and otherwise the event actor.
- Steps that fail the check are skipped and listed in `EventLogEntry.skippedSteps`, so one rotation can be reused across eidolon levels.
- `LightCone.superimposition` (1–5) is metadata only.

### Conditional modifiers

A modifier with a condition only applies during a hit whose context matches: the element, at least one of the damage tags, and the counterpart ID. `resolveUnitStats(state, id)` without a context shows unconditional stats only, which suits a character sheet.

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
     if turn:  tick(actor, turnEnd); activeTurn = none
  aggregate totals
```

- The engine does **not** simulate SPD, action order, energy, or toughness. The user's event list is the authority.
- Effects applied in a step affect every later step in the same event, but not earlier ones.
- Duration ticking is explicit per effect (`DurationSpec.tickUnit` / `tickPhase`). By default, an effect that ticks at `turnEnd` and is applied during its tick unit's own turn is **not** decremented at the end of that turn. Set `tickOnApplyTurn` to change this. The game behaviour behind this default is **UNVERIFIED** (see `KNOWN_LIMITATIONS.md`).
- Re-applying the same effect ID to the same holder replaces its definition, adds stacks up to `maxStacks`, and resets the duration. This is an **ASSUMPTION**.

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
