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

Also on 2026-11-07, these were confirmed by the Fandom wiki Damage page (S3):

| Item | Result |
|---|---|
| Overall formula and the order of its multipliers | ✅ Matches S3 |
| Weaken multiplier `1 − Weaken` | ✅ Matches S3 |
| Enemy DMG mitigation, each source multiplying separately | ✅ Matches S3 |
| Flat Extra DMG and the DMG Multiplier Increase in Base DMG | ✅ Matches S3 |
| Enemy DEF% bonus in the same pool as DEF reduction and ignore | ✅ Matches S3 |
| DMG Boost and Vulnerability additive across type, element and all-type | ✅ Matches S3 |
| Final DMG zone | ✅ Matches S3's "Original DMG Multiplier" (e.g. The Abyss) |

These are still **unverified**, because no read source covers them:

1. Base CRIT Rate 5% and base CRIT DMG 50% for every character.
2. Stat formula `(char + LC base) × (1 + %) + flat`.
3. Whether the game itself rounds values.
4. Whether several Weaken sources add together.
5. How several Final DMG (Original DMG) sources stack. R1 multiplies them, and S3 doesn't say.
6. RES clamp [10%, 200%] and the vulnerability cap of +250%. These rest on R1 alone, because S3's Damage page states no bounds. The Damage RES and Vulnerability sub-pages couldn't be read.

The enemy flat DEF term is an engine extension with no source behind it. It defaults to 0.

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
- **Standalone True DMG** (based on tallied DMG, Max HP, etc.). Not supported. Only "True DMG equal to X% of this hit" is modelled, via `trueDmg`.
- **Stat-conversion buffs** (e.g. "ATK increases by X% of another stat"). Callers must precompute a flat value. The value doesn't update if the source stat changes mid-rotation.
- **Effect hit rate / effect RES and debuff application chance.** All debuffs land. R1 weights DoT damage by its application chance (`baseChance × (1 + EHR) × (1 − enemyEffectRES + effectResPen)`); we don't.
- **Attacker level.** Our DEF formula supports any attacker level. R1 always assumes Lv80, so results only match R1 at Lv80.
- **Enemy actions against allies, shields, healing, HP thresholds, and kill or overkill.** Damage isn't capped by enemy HP.
- **Multiple enemies.** Supported for targeting, but there is no blast/AoE helper. Each hit lists its target explicitly.
- **Allies as damage targets.** Not supported.
- **Elation, Joint ATK, and future DMG types.** These are not in `DAMAGE_TAGS`. Add them only with a source.

## Environment notes

- Node.js was not on the system PATH on the development machine. A bundled Node 24 / pnpm 11 was used. Use Node ≥ 20 and pnpm (the lockfile is `pnpm-lock.yaml`).
