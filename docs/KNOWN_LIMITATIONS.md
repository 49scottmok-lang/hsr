# Known Limitations & Unverified Mechanics

Status is as of 2026-11-07. Formula-level verification status is tracked inline in `FORMULAS.md`. This file lists **scope gaps** and **mechanics the engine assumes**.

## No game data

- The repository ships **no** character, light cone, relic, or enemy data. Every base stat, skill multiplier, buff value, and enemy RES must be entered by the user, or added to `src/data/` with a source citation (`src/data/README.md`).
- Test fixtures (`src/engine/__tests__/fixtures.ts`) are synthetic and are **not** game data.

## Formula verification status

Details are in `FORMULAS.md`. On 2026-11-07, these items were cross-checked against the Fribbels HSR Optimizer source code (R1, commit `ac5e9d6`):

| Item | Result |
|---|---|
| RES multiplier clamp to [10%, 200%] | ✅ Matches R1 |
| Enemy base DEF = 200 + 10 × level | ✅ Matches R1 (R1 fixes attacker Lv80) |
| DEF reduction + DEF ignore in one pool, floored at 0 | ✅ Matches R1 |
| RES PEN + RES reduction in one pool | ✅ Matches R1 |
| CRIT Rate capped at 100% in expected value | ✅ Matches R1 |
| DoT cannot crit | ✅ Matches R1 |
| Broken multiplier 0.9 / 1.0 | ✅ Matches R1 |
| No rounding of damage | ✅ Matches R1 |
| Vulnerability is additive with **no cap** | ❌ **R1 caps it at +250% and floors it at 0. The engine is now fixed to match.** |
| Final DMG and True DMG multipliers | ➕ **R1 has them and our engine didn't. Both are now added.** |

These are still **unverified** (not in R1, and no source read):

1. Weaken multiplier.
2. Enemy-side DMG mitigation, where each source multiplies separately.
3. Base CRIT Rate 5% and base CRIT DMG 50% for every character.
4. Flat Extra DMG term in Base DMG.
5. Enemy DEF% bonus and flat DEF.
6. Stat formula `(char + LC base) × (1 + %) + flat`.
7. Whether the game itself rounds values.

R1 is a widely used optimizer, but it is not the game. If game testing contradicts R1, the game wins.

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
- **Effect hit rate / effect RES and debuff application chance.** All debuffs land. R1 weights DoT damage by its application chance (`baseChance × (1 + EHR) × (1 − enemyEffectRES + effectResPen)`); we don't.
- **Attacker level.** Our DEF formula supports any attacker level. R1 always assumes Lv80, so results only match R1 at Lv80.
- **Enemy actions against allies, shields, healing, HP thresholds, and kill or overkill.** Damage isn't capped by enemy HP.
- **Multiple enemies.** Supported for targeting, but there is no blast/AoE helper. Each hit lists its target explicitly.
- **Allies as damage targets.** Not supported.
- **Elation, Joint ATK, and future DMG types.** These are not in `DAMAGE_TAGS`. Add them only with a source.

## Environment notes

- Node.js was not on the system PATH on the development machine. A bundled Node 24 / pnpm 11 was used. Use Node ≥ 20 and pnpm (the lockfile is `pnpm-lock.yaml`).
