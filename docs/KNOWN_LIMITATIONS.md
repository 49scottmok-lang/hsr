# Known Limitations & Unverified Mechanics

Status is as of 2026-11-07. Formula-level verification status is tracked inline in `FORMULAS.md`. This file lists **scope gaps** and **mechanics the engine assumes**.

## Game data

- The repository ships **stat tables only** (SPEC D5, TASKS D3), generated from source A at a pinned commit (`DATA_SOURCES.md § Decision`): character and light cone base stats per ascension, relic main stats, the stat part of 2-piece sets, and stat traces.
- **Table coverage is game build 4.6.0.** Characters 1014, 1015, 1508 and 1509 are released (per source B) but missing from A's 4.6.0 build, so an import of them reports a table miss. Newer content needs A re-pinned.
- **2-piece sets: only the source's `PropertyList` is tabulated**, and it is treated as the unconditional part. Every tabulated value also appears in B's set description text (`crosscheck-b.test.ts`). That check confirms the number, not that it is unconditional. **[UNVERIFIED]** Sets whose 2-piece also has an ability part (`hasAbilityPart`, e.g. most planar ornaments) need that part entered by the user. Sets whose 2-piece is ability-only are not tabulated at all.
- **Enhanced trace trees.** Ten characters have a second ("enhanced") skill tree; only one of them (1004) has different stat traces. Which tree an account uses is **[UNVERIFIED]**. Both trees are tabulated, and `importArchive` **assumes** that a non-zero `ability_version` means the enhanced tree; it reports this as a `traceTree` problem whenever it applies.
- Outgoing Healing Boost and Elation DMG are tabulated as `unsupported`: the engine doesn't model them. The import reports them instead of dropping them silently.
- Imported builds carry stats only. Kit, eidolon effects, light cone passives, 4-piece sets and the ability part of 2-piece sets are listed in the import report as still to be entered.
- **Names are the game's 繁體中文 text** (TextMapCHT, D5). The game ships one Traditional Chinese text for every region, so a name may not match Hong Kong usage word for word. The Trailblazer has no fixed name (`name: null`); the UI labels it itself.
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

1. ~~Stat formula `(char + LC base) × (1 + %) + flat`.~~ *Cross-checked 2026-11-07 (E1) against R1's stat pipeline (`FORMULAS.md § Stats`). It still has no game-side source.*
2. Whether the game itself rounds values.
3. Whether several Weaken sources add together.
4. How several Final DMG (Original DMG) sources stack. R1 multiplies them (re-checked 2026-11-07: its `MULTIPLICATIVE_BOOST` operator), and so does the engine. No other source says.
5. Level scaling below level 80 (base stats) and below max level (relic main stats). The formulas are checked only at those levels (`FORMULAS.md § Level scaling`).
6. The vulnerability cap of +250%. It rests on R1 alone: the S3 Vulnerability page (read 2026-11-08) says sources add, but states no cap. *The RES clamp [10%, 200%] was sourced on 2026-11-08 (S3 Damage RES).*
7. *(E8)* R1's multi-stack DoT weighting. Debuff RES is now sourced (S3, 2026-11-08: `× (1 − Debuff RES)`) but **not modelled** (TASKS E12).
8. *(E11)* Super Break as Break DMG. S3 says Super Break DMG is also Break DMG and multiplies `(1 + Break DMG Increase) × (1 + Super Break DMG Increase)`. The engine keeps the two tags apart and adds `superBreakDmg` to the ability multiplier, as R1 does. S3 and R1 disagree (`FORMULAS.md § Super Break DMG`).

*Resolved 2026-11-07:* base CRIT Rate 5% / CRIT DMG 50% is in source A's `AvatarPromotionConfig` for every character and ascension, and matches B (`FORMULAS.md § Base CRIT`).

The enemy flat DEF term is an engine extension with no source behind it. It defaults to 0.

R1 is a widely used optimizer, but it is not the game. If game testing contradicts R1, the game wins.

## Engine assumptions (modelling choices)

| # | Assumption | Where |
|---|---|---|
| A1 | *Replaced 2026-11-07 by `EffectDef.stacking` (E5).* Each effect now states its re-application rule: `refresh` (the default, and the old behaviour), `noRefresh` or `independent`. What remains an assumption is the **default**: an effect without `stacking` refreshes. Which rule a real ability uses is user-supplied. | `effects.ts applyEffect` |
| A2 | An effect that ticks at `turnEnd`, applied during its tick unit's own turn, skips that turn's end tick unless `tickOnApplyTurn: true`. The default is a guess about common in-game behaviour. | `effects.ts` |
| A3 | `extra` events (Ultimates, follow-ups) never tick durations. | `rotation.ts` |
| A4 | Weaken is floored so the multiplier can't go below 0. | `formulas.ts` |
| A5 | A hit with several damage tags is counted once in `totalDamage` and once **per tag** in `damageByTag`, so tag totals can exceed the total. | `rotation.ts` |
| A6 | Missing enemy RES for an element is treated as 0. | `damage.ts` |
| A7 | Stats are resolved fresh at every hit. There is **no snapshotting**, including for DoTs. | `damage.ts` |
| A8 | Conditional modifiers are excluded from context-free stat displays. | `stats.ts` |
| A9 | *(E7)* A stat conversion reads its source stat **without** other conversions (single pass), so conversions never chain. `fromUnit: 'source'` reads the source unit's context-free stats. The cap applies after stacks. | `stats.ts` |
| A10 | *(E8)* Enemy Effect RES defaults to 0 when `EnemyConfig.effectRes` is not set. | `damage.ts` |
| A11 | *(E4 follow-up)* Break hits carry only their own tag (`break` or `superBreak`). An effect that should boost both must list both. `breakEfficiency` / `superBreakDmg` modifiers are read in the Super Break hit's context, not the triggering hit's. | `breakDamage.ts` |
| A12 | *(E6)* AV ties mid-battle are broken like battle-start ties (allies first, then slot). The source describes the battle-start order and a stable sort only. | `timeline.ts` |
| A13 | *(E6)* ~~A gauge can go below 0.~~ *Replaced 2026-11-08 (E1):* gauges are floored at 0 (S3 Speed), so two units advanced to 0 tie and A12 decides. | `timeline.ts` |
| A14 | *(E6)* An adjustment triggered by a turn applies after that turn ends, after the actor's gauge refill. S3 Speed (2026-11-08) confirms that post-action Ultimates act at this point. | `timeline.ts` |

## Out of scope for the MVP

- **Break and Super Break DMG (E4, added 2026-11-07) have these gaps** (formulas: `FORMULAS.md § Break DMG`):
  - *Resolved 2026-11-07 (E4 follow-up):* break hits now carry the tag `break` / `superBreak`, so "Break DMG +X%" is a `dmgBoost` modifier conditioned on that tag. Weakness Break Efficiency and the Super Break DMG multiplier can come from buffs (`breakEfficiency`, `superBreakDmg` stats), added to the step's own values.
  - Break DoTs (the Burn, Bleed, Shock, Wind Shear, Entanglement, Freeze and Imprisonment that a Weakness Break applies) are not modelled.
  - The level multiplier is checked against R1 only at level 80. *Resolved 2026-11-08 (E1, S3 Weakness Break):* break hits ignore Weaken, take Mitigation, and the breaking hit's Break DMG uses the 0.9 unbroken multiplier.
  - Toughness is not simulated: the user states the enemy's max Toughness (displayed units) and each Super Break step's Toughness reduction.
- **Toughness simulation.** Weakness break is a manual toggle (`setBroken`).
- **SPD/AV timeline simulation.** `runRotation` stays manual. The turn order helper (E6, `suggestTurnOrder`) only suggests the order of turns from SPD and **user-entered** advances, delays, "immediately take action" and SPD changes. It knows no kit: ultimates, follow-ups, energy, skill points, Frozen and Toughness Break delay must be entered by the user. It models a single wave; `CHALLENGE_CYCLE_AV` (150 then 100 AV, sourced) restarts each wave in the game (`FORMULAS.md § Action Value`).
- **Energy and skill points.** Neither is tracked or validated, so a rotation can be "illegal" in-game.
- **Standalone True DMG** (based on tallied DMG, Max HP, etc.). Not supported. Only "True DMG equal to X% of this hit" is modelled, via `trueDmg`.
- **Superimposition scaling.** `LightCone.superimposition` is a label only. The values for each S1–S5 level must be entered or supplied by data.
- **Eidolon effects** are gated by `requires.minEidolon`, but the effects themselves (what E1–E6 do) must be entered by the user, because no kit data ships. Eidolons that *replace* an earlier effect, rather than adding to it, need two effects with the same ID: with the default `refresh` stacking, the later one replaces the earlier one when applied. (`noRefresh` keeps the earlier one.)
- **Stat-conversion buffs** *(E7, added 2026-11-07)* are supported through `EffectDef.conversions` and are evaluated at hit time. **Chained** conversions (one conversion reading a stat that another conversion raised) are not: see A9.
- **Debuff application chance.** *(E8, added 2026-11-07)* A DoT hit with `baseChance` is weighted by its application chance, as R1 does. Debuffs applied by `apply` steps (DEF reduction, vulnerability, …) still **always land**: their effect on later hits is not weighted by chance.
- **Attacker level.** Our DEF formula supports any attacker level. R1 always assumes Lv80, so results only match R1 at Lv80.
- **Enemy actions against allies, shields, healing, HP thresholds, and kill or overkill.** Damage isn't capped by enemy HP.
- **Multiple enemies.** Supported for targeting, but there is no blast/AoE helper. Each hit lists its target explicitly.
- **Allies as damage targets.** Not supported.
- **Elation, Joint ATK, and future DMG types.** These are not in `DAMAGE_TAGS`. Add them only with a source.

## Environment notes

- Node.js was not on the system PATH on the development machine. A bundled Node 24 / pnpm 11 was used. The data scripts (`pnpm data:extract`, `pnpm data:crosscheck`) run TypeScript directly and need Node ≥ 22.18. Use Node ≥ 20 and pnpm (the lockfile is `pnpm-lock.yaml`).
