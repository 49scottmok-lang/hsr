# Known Limitations & Unverified Mechanics

Status is as of 2026-11-07. Formula-level verification status is tracked inline in `FORMULAS.md`. This file lists **scope gaps** and **mechanics the engine assumes**.

## No game data

- The repository ships **no** character, light cone, relic, or enemy data. Every base stat, skill multiplier, buff value, and enemy RES must be entered by the user, or added to `src/data/` with a source citation (`src/data/README.md`).
- Test fixtures (`src/engine/__tests__/fixtures.ts`) are synthetic and are **not** game data.

## Unverified formula details

These are repeated here so they are easy to find. Details are in `FORMULAS.md`.

1. RES multiplier clamp to [10%, 200%].
2. Enemy base DEF = 200 + 10 × level.
3. DEF reduction and DEF ignore combine additively in one pool, floored at 0.
4. RES PEN (attacker) and RES reduction (target) combine additively.
5. Vulnerability is additive with no cap.
6. Each DMG mitigation source multiplies separately.
7. Base CRIT Rate is 5% and base CRIT DMG is 50% for every character.
8. DoT cannot crit.
9. The Extra Multiplier / flat Extra DMG terms in Base DMG.
10. No rounding anywhere.

## Engine assumptions (modelling choices)

| # | Assumption | Where |
|---|---|---|
| A1 | Re-applying an effect with the same ID to the same holder replaces the definition, adds stacks up to `maxStacks`, and resets the duration. Real abilities vary: some don't refresh, and some stack independently. | `effects.ts applyEffect` |
| A2 | An effect that ticks at `turnEnd`, applied during its tick unit's own turn, skips that turn's end tick unless `tickOnApplyTurn: true`. The default is a guess about common in-game behaviour. | `effects.ts` |
| A3 | `extra` events (Ultimates, follow-ups) never tick durations. | `rotation.ts` |
| A4 | Weaken is floored so the multiplier can't go below 0. | `formulas.ts` |
| A5 | A hit with several damage tags is counted once in `totalDamage` and once **per tag** in `damageByTag`, so tag totals can exceed the total. | `rotation.ts` |
| A6 | Missing enemy RES for an element is treated as 0. | `damage.ts` |
| A7 | Stats are resolved fresh at every hit. There is **no snapshotting**, including for DoTs. | `damage.ts` |
| A8 | Conditional modifiers are excluded from context-free stat displays. | `stats.ts` |

## Out of scope for the MVP

- **Break DMG and Super Break DMG.** Both need the level multiplier table, which is game data. Break Effect is tracked as a stat but unused.
- **Toughness simulation.** Weakness break is a manual toggle (`setBroken`).
- **SPD/AV timeline simulation.** Rotations are manual. `actionValue` exists as a utility only.
- **Energy and skill points.** Neither is tracked or validated, so a rotation can be "illegal" in-game.
- **Stat-conversion buffs** (e.g. "ATK increases by X% of another stat"). Callers must precompute a flat value. The value doesn't update if the source stat changes mid-rotation.
- **Effect hit rate / effect RES and debuff application chance.** All debuffs land.
- **Enemy actions against allies, shields, healing, HP thresholds, and kill or overkill.** Damage isn't capped by enemy HP.
- **Multiple enemies.** Supported for targeting, but there is no blast/AoE helper. Each hit lists its target explicitly.
- **Allies as damage targets.** Not supported.
- **Elation, Joint ATK, and future DMG types.** These are not in `DAMAGE_TAGS`. Add them only with a source.

## Environment notes

- Node.js was not on the system PATH on the development machine. A bundled Node 24 / pnpm 11 was used. Use Node ≥ 20 and pnpm (the lockfile is `pnpm-lock.yaml`).
