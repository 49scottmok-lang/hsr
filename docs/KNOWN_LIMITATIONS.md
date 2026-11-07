# Known Limitations & Unverified Mechanics

Status is as of 2026-11-07. Formula-level verification status is tracked inline in `FORMULAS.md`. This file lists **scope gaps** and **mechanics the engine assumes**.

## Game data

- The repository ships **stat tables only** (SPEC D5, TASKS D3), generated from source A at a pinned commit (`DATA_SOURCES.md § Decision`): character and light cone base stats per ascension, relic main stats, the stat part of 2-piece sets, and stat traces.
- **Table coverage is game build 4.6.0.** Characters 1014, 1015, 1508 and 1509 are released (per source B) but missing from A's 4.6.0 build, so an import of them reports a table miss. Newer content needs A re-pinned.
- **2-piece sets: only the source's `PropertyList` is tabulated**, and it is treated as the unconditional part. Every tabulated value also appears in B's set description text (`crosscheck-b.test.ts`). That check confirms the number, not that it is unconditional. **[UNVERIFIED]** Sets whose 2-piece also has an ability part (`hasAbilityPart`, e.g. most planar ornaments) need that part entered by the user. Sets whose 2-piece is ability-only are not tabulated at all.
- **Enhanced trace trees.** Ten characters have a second ("enhanced") skill tree; only one of them (1004) has different stat traces. Which tree an account uses (probably the export's `ability_version`) is **[UNVERIFIED]**; both trees are tabulated.
- Outgoing Healing Boost and Elation DMG are tabulated as `unsupported`: the engine doesn't model them.
- Kit behaviour is still entered by the user: skill multipliers, talents, eidolon effects, 4-piece sets, light cone passives, and enemy RES.
- Account import (planned) supports **only** the Reliquary Archiver format, at the version documented in `IMPORT_FORMAT.md`. Other tools' formats (Kel-Z HSR Scanner, HoYoLAB, UID lookup) are not supported in v1.
- Imported relic data reflects the export's moment in time. Re-import after changing gear in game.
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

1. Stat formula `(char + LC base) × (1 + %) + flat`.
2. Whether the game itself rounds values.
3. Whether several Weaken sources add together.
4. How several Final DMG (Original DMG) sources stack. R1 multiplies them, and S3 doesn't say.
5. Level scaling below level 80 (base stats) and below max level (relic main stats). The formulas are checked only at those levels (`FORMULAS.md § Level scaling`).
6. RES clamp [10%, 200%] and the vulnerability cap of +250%. These rest on R1 alone, because S3's Damage page states no bounds. The Damage RES and Vulnerability sub-pages couldn't be read.

*Resolved 2026-11-07:* base CRIT Rate 5% / CRIT DMG 50% is in source A's `AvatarPromotionConfig` for every character and ascension, and matches B (`FORMULAS.md § Base CRIT`).

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
- **Superimposition scaling.** `LightCone.superimposition` is a label only. The values for each S1–S5 level must be entered or supplied by data.
- **Eidolon effects** are gated by `requires.minEidolon`, but the effects themselves (what E1–E6 do) must be entered by the user, because no kit data ships. Eidolons that *replace* an earlier effect, rather than adding to it, need two effects with the same ID: the later one replaces the earlier one when applied.
- **Stat-conversion buffs** (e.g. "ATK increases by X% of another stat"). Callers must precompute a flat value. The value doesn't update if the source stat changes mid-rotation.
- **Effect hit rate / effect RES and debuff application chance.** All debuffs land. R1 weights DoT damage by its application chance (`baseChance × (1 + EHR) × (1 − enemyEffectRES + effectResPen)`); we don't.
- **Attacker level.** Our DEF formula supports any attacker level. R1 always assumes Lv80, so results only match R1 at Lv80.
- **Enemy actions against allies, shields, healing, HP thresholds, and kill or overkill.** Damage isn't capped by enemy HP.
- **Multiple enemies.** Supported for targeting, but there is no blast/AoE helper. Each hit lists its target explicitly.
- **Allies as damage targets.** Not supported.
- **Elation, Joint ATK, and future DMG types.** These are not in `DAMAGE_TAGS`. Add them only with a source.

## Environment notes

- Node.js was not on the system PATH on the development machine. A bundled Node 24 / pnpm 11 was used. The data scripts (`pnpm data:extract`, `pnpm data:crosscheck`) run TypeScript directly and need Node ≥ 22.18. Use Node ≥ 20 and pnpm (the lockfile is `pnpm-lock.yaml`).
