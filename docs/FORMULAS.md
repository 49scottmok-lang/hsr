# Damage Formulas (MVP)

Every formula below maps to one function in `src/engine/formulas.ts`. All percentages are fractions (`0.5` = 50%).

## Verification status legend

| Tag | Meaning |
|---|---|
| **[SOURCED]** | Stated by a public community source that was actually read (cited). |
| **[CROSS-CHECKED]** | Matches the source code of an independent, widely used reference implementation (R1). This is strong evidence, but it is not the game itself. |
| **[UNVERIFIED]** | Common community knowledge that **no read source or reference code confirms**. Must be verified before release. |
| **[ENGINE]** | A modelling decision made by this engine. Not a claim about the game. |

### Sources and references

- **S1**: Prydwen damage formula guide (`prydwen.gg/star-rail/guides/damage-formula`). Only the search-result summary was available; the page returned HTTP 403 to automated fetch.
- **S2**: GenshinTheory, "hsr damage" (`genshintheory.github.io/hsr-damage.html`). Read in full. It is an early, pre-release write-up.
- **R1** (also **B** in `DATA_SOURCES.md`): Fribbels HSR Optimizer, `github.com/fribbels/hsr-optimizer`, MIT license, commit `ac5e9d6` (2026-11-04). The file is `src/lib/optimization/engine/damage/damageCalculator.ts`, mainly `computeCommonMultipliers`, `calculateDefMulti`, `getCritMultiplier` and `DotDamageFunction`. It was read on 2026-11-07. No code was copied; only the formulas were compared.
- **R1′**: the same repository at the same commit (`ac5e9d6`), stat and buff pipeline, read on 2026-11-07 for E1: `src/lib/optimization/context/calculateContext.ts` (`sumCharacterBase`), `src/lib/optimization/calculateStats.ts` (`calculateBaseStats`, `sumFlatStat`, `applyPercentStats`) and `src/lib/optimization/engine/container/computedStatsContainer.ts` (`MULTIPLICATIVE_BOOST`). Formulas compared only; no code copied.
- **R2**: Nous StarRailSim (`starrailsim.com`). This is a closed-source cloud simulator that claims ≤0.5% error against the game. It publishes **no formulas**, so it cannot verify anything here. It is a design reference for a future AV/APL simulator (TASKS E6).
- **S3**: Honkai: Star Rail Wiki (Fandom), "Damage" (`honkai-star-rail.fandom.com/wiki/Damage`), section "General Damage Formula". Read in full on 2026-11-07, after the user cleared the site's bot check in the browser pane. Text is CC-BY-SA. Only the formulas are referenced; none of the page's game data (hit splits, ability values) is used.
- The sub-pages (Damage RES, Vulnerability, CRIT Rate, DEF) were **not** read, because each one triggered a new bot check.

---

## Outgoing DMG

```
DMG = BaseDMG × CRIT × DMGBoost × Weaken × DEF × RES × Vulnerability
    × Mitigation × Broken × FinalDMG × TrueDMG
```

The multipliers are independent and multiply together, so their order does not affect the result.

- **[SOURCED]** S3 gives `Base × Original DMG × CRIT × DMG Boost × Weaken × DEF × RES × Vulnerability × DMG Mitigation × Broken`, and says this applies to skills, DoT and Additional DMG. S1 and S2 agree.
- **[CROSS-CHECKED]** R1 has the same product for CRIT, DMG Boost, DEF, RES, Vulnerability, Broken, Final DMG and True DMG.
- Our `FinalDMG` corresponds to S3's "Original DMG Multiplier" (see below). `TrueDMG` comes from R1 and is not in S3's general formula.

Function: `computeBreakdown` in `src/engine/damage.ts`. It returns every factor separately (`DamageBreakdown`).

## Base DMG

```
BaseDMG = (SkillMultiplier + ExtraMultiplier) × ScalingStat + FlatDMG
```

- **[SOURCED]** S3 gives `Base DMG = Stat × Ability Multiplier + Extra DMG`, with `Ability Multiplier = Base Ability Multiplier + DMG Multiplier Increase`. Our `ExtraMultiplier` is S3's "DMG Multiplier Increase", and our `FlatDMG` is S3's "Extra DMG".
- **[CROSS-CHECKED]** R1 computes `atkScaling × ATK + hpScaling × HP + defScaling × DEF`.
- Skill multipliers are **always caller-supplied**. The engine contains none.

## Stats

```
FinalATK = (CharacterBaseATK + LightConeBaseATK) × (1 + ΣATK%) + ΣflatATK
```

HP works the same way. SPD uses the character base only.

- **[CROSS-CHECKED]** *(2026-11-07, E1)* R1′: `sumCharacterBase` takes character base + light cone base for HP, ATK, DEF and SPD; `sumFlatStat` computes `base × (1 + Σ%) + Σflat`, and later % buffs add `% × base` (`applyPercentStats`), which is the same sum. R1′ multiplies SPD% by character + light cone base, but light cones have no SPD, so it equals ours.
- No game-side source was read for this, so it rests on R1 alone.

An ally's own DEF uses the same pool as the target DEF formula: `base × max(0, 1 + DEF% − DEFreduction) + flat`.

## Base CRIT

Defaults are CRIT Rate 5% and CRIT DMG 50% for every character, overridable via `CharacterBuild.baseCritRate/baseCritDmg`.

- **[SOURCED]** *(2026-11-07)* Source A (`DimbreathBot/TurnBasedGameData@74a7b96`, `AvatarPromotionConfig`) has `CriticalChance 0.05` and `CriticalDamage 0.5` for every character at every ascension. The stat tables carry them per ascension (`CharacterAscension.critRate/critDmg`).
- **[CROSS-CHECKED]** B (`fribbels/hsr-optimizer@dd0c4af`, `game_data.json`) lists the same `CRIT Rate`/`CRIT DMG` for every character (`crosscheck-b.test.ts`).
- Previously **[UNVERIFIED]**: the constants were not located in R1's damage code.

## CRIT

| Mode | Multiplier |
|---|---|
| `expected` | `1 + clamp(CR, 0, 1) × CD` |
| `crit` | `1 + CD` |
| `nonCrit` | `1` |
| `canCrit = false` | `1` |

- **[CROSS-CHECKED]** R1 uses `cr × (1 + cd) + (1 − cr)` with `cr = min(1, CR)`. This is algebraically identical to the expected mode.
- Flooring CR at 0 is **[ENGINE]**.
- **[SOURCED]** S3: CRIT multiplier is `1 + CRIT DMG` on a crit, otherwise 1; "Unless an effect says otherwise, DoT damage cannot CRIT". S3 also says each hit of a multi-hit attack rolls CRIT separately, which the expected mode already accounts for.
- **[CROSS-CHECKED]** DoT cannot crit: R1's `DotDamageFunction` has no CRIT factor. `canCrit` defaults to `false` for the `dot` tag and can be overridden per hit.
- R1 additionally weights DoT by its chance to apply (EHR vs effect RES). This is modelled when a DoT hit states its `baseChance` (§ DoT application chance, E8).

## DMG Boost

```
DMGBoost = 1 + Σ dmgBoost   (all matching modifiers: elemental, all-type, ability-type)
```

- **[SOURCED]** S3 gives `1 + Type DMG Boost + Elemental DMG Boost + All DMG Boost`.
- **[CROSS-CHECKED]** R1 uses `1 + genericBoost + elementalBoost`.

## Weaken

```
Weaken = max(0, 1 − Σ weaken)   (read from the attacker)
```

- **[SOURCED]** S3 gives `1 − Weaken` (read from the attacker). It is not in R1.
- Summing several Weaken sources is **[UNVERIFIED]**, because S3 shows a single value. *(E1, 2026-11-07: still no source. R1 has no Weaken term; the Fandom Weaken page returned HTTP 402.)*
- The floor at 0 is **[ENGINE]**.

## DEF

```
EnemyBaseDEF = 200 + 10 × EnemyLevel
TargetDEF    = max(0, BaseDEF × max(0, 1 + DEF% − DEFReduction − DEFIgnore) + flatDEF)
DEF          = 1 − TargetDEF / (TargetDEF + 200 + 10 × AttackerLevel)
```

- **[SOURCED]** S3 gives the DEF multiplier `1 − DEF / (DEF + 200 + 10 × Level_attacker)` and enemy DEF `200 + 10 × Level`. Its combined form is `(L_atk + 20) / ((L_enemy + 20) × max{0, 1 + %DEF Bonus − %DEF Reduction − %DEF Ignore} + L_atk + 20)`, which is identical to ours, **including the enemy DEF% bonus**. S1 agrees on the DEF floor at 0.
- **[CROSS-CHECKED]** R1 uses `100 / ((EnemyLevel + 20) × max(0, 1 − DEF_PEN) + 100)`. This is the same formula, with enemy base DEF `200 + 10 × level` and attacker level fixed at 80, since `100 = 80 + 20`. R1 puts DEF reduction and DEF ignore in **one** pool (`DEF_PEN`), floored at 0, which is identical to ours.
- The enemy flat DEF term (`defFlat`) is **[ENGINE]**: neither S3 nor R1 has it. It defaults to 0 and only matters if a caller sets it.
- Example check: a Lv80 attacker against a Lv80 enemy with no modifiers gives `0.5`, which matches S2.
- `EnemyConfig.baseDef` overrides the level formula.

## RES

```
RES = 1 − clamp(EnemyRES − ΣresPen − ΣresReduction, −1.0, 0.9)
    = clamp(1 − (EnemyRES − ΣresPen − ΣresReduction), 0.1, 2.0)
```

- The linear form `1 − (RES − RES PEN)` is **[SOURCED]** S3 and S2. S3's Damage page states no clamp.
- **[CROSS-CHECKED]** R1 uses `1 − min(0.90, max(−1.00, RES − RES_PEN))`, which gives the same [10%, 200%] bounds. R1 puts RES PEN and RES reduction in one pool (`RES_PEN`).
- *E1, 2026-11-07:* search-result snippets of the Fandom Damage RES page and Prydwen also give RES between −100% and 90%, but neither page could be read (HTTP 402 / 403), so the bounds still rest on R1 alone.
- S2's pre-release remark that "RES over 100% could reduce the multiplier to 0" conflicts with this. We follow R1.
- Enemy RES values are **caller-supplied**. Missing elements default to 0 **[ENGINE]**.

## Vulnerability (DMG Taken)

```
Vulnerability = 1 + clamp(Σ vulnerability, 0, 2.5)   (read from the target)
```

- **[CROSS-CHECKED]** R1 uses `1 + min(2.50, max(0, VULNERABILITY))`. The cap is therefore **+250%** (a ×3.5 multiplier). *Changed 2026-11-07: the engine previously had no cap.*
- **[SOURCED]** S3 gives `1 + Type Vulnerability + Elemental Vulnerability + All-Type Vulnerability`, i.e. additive. S3's Damage page states no cap, so the cap rests on R1 alone. *(E1, 2026-11-07: re-read in R1′ `computeCommonMultipliers`, unchanged. No other source states the cap; the Fandom Vulnerability page returned HTTP 402.)*
- Constants: `VULNERABILITY_MIN/MAX`.

## Mitigation (DMG Reduction)

```
Mitigation = Π (1 − m_i)   (each dmgMitigation modifier on the target)
```

- **[SOURCED]** S3 gives `(1 − Mitigation₁) × (1 − Mitigation₂) × (1 − Mitigation₃) × …`.
- R1 does not model enemy DMG reduction for outgoing damage. It does compose *ally* DMG reduction multiplicatively.
- This factor does not include the toughness multiplier.

## Toughness (Broken)

```
Broken = 1.0 if broken, else 0.9
```

- **[SOURCED]** S3 and S2. **[CROSS-CHECKED]** R1 uses `enemyWeaknessBroken ? 1 : 0.9`.
- The broken state is set manually via `setBroken` or `EnemyConfig.broken`.

## Final DMG (added 2026-11-07)

```
FinalDMG = Π (1 + f_i)   (each finalDmgBoost modifier on the attacker)
```

- **[SOURCED]** S3 has an "Original DMG Multiplier": "a multiplier such as the one from The Abyss that directly increases damage", which is omitted when there isn't one. R1 implements The Abyss through `FINAL_DMG_BOOST`, so the two are the same zone. S3 does not say how several sources stack.
- **[CROSS-CHECKED]** R1 uses `1 + FINAL_DMG_BOOST`, where every source applies through `(1 + current) × (1 + new) − 1`, i.e. multiplicatively. *(Re-checked 2026-11-07, E1: every write goes through R1′'s `MULTIPLICATIVE_BOOST` operator, `a = (1 + a)(1 + v) − 1`.)* No other source states how several sources stack, so this rests on R1 alone.
- R1 uses this zone for some newer abilities that state a separate DMG multiplier. Which abilities belong here is caller-supplied data, so the engine encodes none.

## True DMG (added 2026-11-07)

```
TrueDMG = 1 + Σ trueDmg   (read from the attacker)
```

- **[CROSS-CHECKED]** R1 uses `1 + TRUE_DMG_MODIFIER + hit.trueDmgModifier`, which is additive.
- S3 describes True DMG as damage dealt directly, "without being modified by any damage calculation multipliers". So this multiplier only models effects of the form "additionally deals True DMG equal to X% of this hit's DMG". True DMG based on other values (tallied DMG, Max HP) is **not supported**; enter it as a separate figure outside the engine.
- Whether a given True DMG effect applies to DoT or Break DMG is ability-specific. Restrict it with modifier conditions.

## Level scaling (stat tables, added 2026-11-07)

The stat tables (`src/data`, TASKS D3) store each ascension's starting value and a per-level increment, exactly as source A gives them. Values for a given level are computed by these two functions, never stored.

```
BaseStat(level) = Base[ascension] + Add[ascension] × (level − 1)    character / light cone HP, ATK, DEF
MainStat(level) = BaseValue[group, stat] + LevelAdd[group, stat] × level    relic main stat, level +0 … +max
```

- Functions: `formulas.promotedBaseStat` and `formulas.relicMainStatValue`, used by `characterBase`, `lightConeBase` and `relicMainStat` in `src/data/lookup.ts`. The lookups reject a level that the ascension can't reach (ascension *a* covers levels `cap[a−1]` … `cap[a]`, with ascension 0 starting at 1).
- SPD and base CRIT do not scale with level: the source has no increment for them.
- Relic rarity is `MaxLevel / 3` (2★ +6 … 5★ +15), the same rule Reliquary Archiver uses (`converters.rs@5e50dcb`). The main-stat group is chosen by slot and rarity from A's `RelicConfig`.

Verification:

- **[CROSS-CHECKED] at level 80 only.** `BaseStat(80)` at the last ascension equals B's level-80 values for all 94 characters and 170 light cones (`src/data/__tests__/crosscheck-b.test.ts`). B stores level 80 only, so no source checks other levels: **[UNVERIFIED] below level 80.**
- **[CROSS-CHECKED] at each rarity's max level.** `MainStat(max)` equals B's `maxedMainStats` (`src/lib/relics/statCalculator.ts@dd0c4af`, 3 decimals) for all 19 stats × 4 rarities. This also settles `× level` over `× (level − 1)`: for a 5★ Head (flat HP), A's group-51 pair gives `705.6` with `× 15`, which is B's value, but `666.086` with `× 14`. **[UNVERIFIED] at intermediate levels.**
- B's `relic_main_affixes.json` has the same `base`/`step` pairs as A for every group (exact equality in the same test).

Hand-computed tests (synthetic numbers):

| Call | Arithmetic | Result |
|---|---|---|
| `promotedBaseStat(100, 5, 20)` | 100 + 5 × 19 | 195 |
| `promotedBaseStat(100, 5, 1)` | 100 + 5 × 0 | 100 |
| `relicMainStatValue(10, 2, 15)` | 10 + 2 × 15 | 40 |
| `characterBase` fixture, Lv20 at ascension 0 / 1 | 100 + 5 × 19 / 140 + 5 × 19 | HP 195 / 235 |

Covered by `src/engine/__tests__/formulas.test.ts` and `src/data/__tests__/lookup.test.ts`.

## Break DMG (added 2026-11-07, TASKS E4)

```
BreakDMG = LevelMultiplier × ElementFactor × (0.5 + MaxToughness / 40) × Multiplier × (1 + BreakEffect)
         × Weaken × DEF × RES × Vulnerability × Mitigation × Broken × FinalDMG × TrueDMG
```

- **LevelMultiplier** is the attacker's `CharacterBuild.breakLevelMultiplier`. `src/data` tabulates it from source A's `ExcelOutput/AvatarBreakDamage.json` (`BreakBaseDamage` by level, levels 1–100 and 120) and the account import fills it in. **[SOURCED]** A. **[CROSS-CHECKED]** at level 80 only: A's 3767.5535 equals R1's constant 3767.5533 to 3 decimals. R1 fixes the attacker at level 80, so other levels are **[UNVERIFIED]**.
- **ElementFactor** (`formulas.BREAK_ELEMENT_FACTOR`): Physical 2, Fire 2, Wind 1.5, Ice 1, Lightning 1, Quantum 0.5, Imaginary 0.5. **[CROSS-CHECKED]** R1 `ElementToBreakScaling` (`calculateContext.ts@dd0c4af`), compared by `crosscheck-b.test.ts`.
- **MaxToughness** is `EnemyConfig.maxToughness` in **displayed** units (a Basic ATK typically shows 10). **[CROSS-CHECKED]** R1 computes `0.5 + T / 120`, but its enemy form stores Toughness ×3 and labels it `toughness / 3` (`EnemyConfigurationsDrawer.tsx@dd0c4af`), so R1's term is `0.5 + T_displayed / 40`. Source A shows the same ×3 ratio for skills: March 7th's Basic ATK has `ShowStanceList` 30 and `StanceDamageDisplay` 10 (`AvatarSkillConfig`).
- **Multiplier** (`BreakDmgSpec.multiplier`, default 1) is R1's `specialScaling`, for abilities that deal "X% of Break DMG".
- **(1 + BreakEffect)**: **[CROSS-CHECKED]** R1 `beMulti`. The engine folds it into `DamageBreakdown.baseDmg`, so the breakdown keeps the same factors as an ordinary hit. `HitResult.break` lists the parts.
- **No CRIT; only break-specific DMG Boost.** **[CROSS-CHECKED]** R1 uses `dmgBoostMulti = 1 + (hit-level BOOST)` for Break and Super Break (its comment: "no action-level, no elemental boost"). *(Added 2026-11-07, E4 follow-up.)* The engine's equivalent is `DMGBoost = 1 + Σ dmgBoost` over the attacker's modifiers whose condition **names the hit's tag** (`damageTags` includes `break`, or `superBreak` for Super Break). Unconditional, element-only and other-tag DMG Boost does not apply. `stats.dmgBoost` shows that sum. `critMultiplier` is 1.
- **DEF, RES, Vulnerability, Broken, Final DMG, True DMG**: the same functions as ordinary hits. **[CROSS-CHECKED]** R1 applies the same common multipliers to Break DMG.
- **Weaken and Mitigation** are applied as for ordinary hits. **[UNVERIFIED]** R1 models neither, for any damage type.
- **Tags** *(changed 2026-11-07, E4 follow-up)*: a Break hit carries exactly the tag `break`, and a Super Break hit exactly `superBreak`. Every modifier conditioned on that tag applies (e.g. `defIgnore` with `damageTags: ['superBreak']`, or a target-held `vulnerability` with `damageTags: ['break']`). Modifiers conditioned on other tags never do. Element-conditioned ones apply as before. The two tags are separate: an effect that boosts both must list both. Ordinary `hit` steps may not carry them. **[ENGINE]** Whether the game counts Super Break DMG as Break DMG for some effects is ability-specific and not modelled.
- **Broken** uses the target's state at that step. Whether the game's Break DMG uses 0.9 or 1.0 is **[UNVERIFIED]** (R1 uses its global broken toggle). Put a `setBroken` step before or after the `break` step to choose.

Function: `calculateBreakHit` / `computeBreakBreakdown` in `src/engine/breakDamage.ts`, with `formulas.breakToughnessFactor`, `breakBaseDmg` and `breakEffectMultiplier`.

## Super Break DMG (added 2026-11-07, TASKS E4)

```
Toughness       = (1 + BreakEfficiency) × ToughnessReduction + FixedToughnessReduction
SuperBreakDMG   = LevelMultiplier × Toughness / 10 × Multiplier × (1 + BreakEffect)
                × Weaken × DEF × RES × Vulnerability × Mitigation × Broken × FinalDMG × TrueDMG
```

- **[CROSS-CHECKED]** R1 `SuperBreakDamageFunction`: `(3767.5533 / 10) × effectiveToughness × beMulti × superBreakModMulti`, with `effectiveToughness = (1 + breakEfficiency) × toughnessDmg + fixedToughnessDmg`. R1's `toughnessDmg` is in displayed units (e.g. March 7th's Basic ATK is `.toughnessDmg(10)` in `March7th.ts@dd0c4af`).
- **ToughnessReduction** and **FixedToughnessReduction** describe the triggering hit and are entered on the step (`SuperBreakDmgSpec`).
- **BreakEfficiency** (Weakness Break Efficiency) is the step's `breakEfficiency` + Σ the attacker's `breakEfficiency` stat *(stat added 2026-11-07, E4 follow-up)*. **[CROSS-CHECKED]** R1 uses `1 + BREAK_EFFICIENCY_BOOST`, one additive term, and scales only `toughnessDmg`, not `fixedToughnessDmg`.
- **Multiplier** (the Super Break DMG multiplier, R1's `SUPER_BREAK_MODIFIER`) is the step's `multiplier` + Σ the attacker's `superBreakDmg` stat *(stat added 2026-11-07)*. **[CROSS-CHECKED]** R1 adds `SUPER_BREAK_MODIFIER + hit.extraSuperBreakModifier`. A step may set `multiplier: 0` and take it all from buffs. The code read does not show whether R1's stat container sums several sources, so summing them is **[ENGINE]**, consistent with R1's single additive term.
- Both stats are read in the Super Break hit's context (tag `superBreak`). They describe the triggering hit, but the engine does not know that hit's tags, so a `breakEfficiency` modifier conditioned on e.g. `ultimate` never applies. **[ENGINE]**
- The other factors follow § Break DMG, including the unverified Weaken and Mitigation.

Function: `calculateBreakHit` with `formulas.superBreakToughness` and `superBreakBaseDmg`.

Hand-computed tests (synthetic numbers, `src/engine/__tests__/break.test.ts`). The attacker has LevelMultiplier 4000 and Break Effect 150%. The target is Lv90 (DEF 1100), Fire RES 20%, max Toughness 120, broken. DEF = 1000/2100, RES = 0.8.

| Hit | Arithmetic | Result |
|---|---|---|
| Break, Fire | 4000 × 2 × (0.5 + 120/40) × 1 × 2.5 × 1000/2100 × 0.8 | 26666.666… |
| Break, Quantum override (no Quantum RES) | 4000 × 0.5 × 3.5 × 2.5 × 1000/2100 | 8333.333… |
| Super Break, reduction 20, efficiency 50%, multiplier 150% | 4000 × (1.5 × 20) / 10 × 1.5 × 2.5 × 1000/2100 × 0.8 | 17142.857… |
| Break, unbroken, target vulnerability 20% | 70000 × 1000/2100 × 0.8 × 1.2 × 0.9 | 28800 |
| Break, `break`-tagged DMG +30% (unconditional DMG +100% ignored) | 70000 × 1.3 × 0.8 × 1000/2100 | 34666.666… |
| Super Break, `superBreak`-tagged DMG +60% | 4000 × 10/10 × 2.5 × 1.6 × 0.8 × 1000/2100 | 6095.238… |
| Super Break, step efficiency 50% + stat 25%, step multiplier 100% + `superBreakDmg` 50% | 4000 × (1.75 × 20)/10 × 1.5 × 2.5 × 0.8 × 1000/2100 | 20000 |

The last three are in `src/engine/__tests__/break-buffs.test.ts`.

## Stat conversion (added 2026-11-07, TASKS E7)

```
contribution = min(cap, ratio × stacks × max(0, From − threshold))
```

An `EffectDef` may carry `conversions` (`StatConversion[]`): "`to` increases by `ratio` of `from`", e.g. ATK +50% of HP, or CRIT DMG +X% for every point of ATK above 1800, up to Y. The contribution is added to `to` like a modifier of that value. It is its own entry, so for `finalDmgBoost` and `dmgMitigation` it is its own factor.

- **Evaluated at hit time** from the current state, so it follows changes to `from` during the rotation. **[ENGINE]**
- **From** is a final stat (`CONVERSION_SOURCES`: HP, ATK, DEF, SPD, CRIT Rate, CRIT DMG, Break Effect, EHR, Effect RES, ERR), computed by the § Stats formulas **without any conversion contributions**. Conversions therefore never chain or loop: an "ATK from HP" and an "HP from ATK" conversion both read the unconverted values. **[ENGINE]** R1 evaluates its conversions on final stats in a dependency order instead, so chained conversions can differ from R1.
- **fromUnit**: `holder` (default) reads the holder's stat with the current hit's conditional modifiers. `source` reads the stat of the unit that applied the effect, context-free (as on its character sheet), e.g. a support's buff based on the support's own ATK. **[ENGINE]**
- **threshold** (default 0) and **cap** (default none) model "exceeding X" and "up to Y". The cap applies after stacks. **[ENGINE]**
- **condition** gates the conversion like a modifier condition, matched against the holder's hit context.
- Ratios, thresholds and caps are caller-supplied kit data. The engine encodes none.

Function: `collectStat` in `src/engine/stats.ts` (conversion entries follow modifier entries).

Hand-computed tests (`src/engine/__tests__/conversion.test.ts`, synthetic numbers; the fixture has HP 1000 and ATK 1950):

| Case | Arithmetic | Result |
|---|---|---|
| ATK + 50% of HP | 1950 + 0.5 × 1000 | ATK 2450 |
| CRIT DMG + 0.04% per ATK above 1450, uncapped / capped at 10% | 1.5 + (1950 − 1450) × 0.0004 / 1.5 + min(0.1, 0.2) | 1.7 / 1.6 |
| 2 stacks of ATK + 25% of HP, cap 400 | 1950 + min(400, 2 × 0.25 × 1000) | ATK 2350 |
| From the source unit (HP 2000) | 1950 + 0.1 × 2000 | ATK 2150 |
| ATK from HP and HP from ATK (no chaining) | 1950 + 0.5 × 1000; 1000 + 1 × 1950 | ATK 2450, HP 2950 |

## DoT application chance (added 2026-11-07, TASKS E8)

```
Chance  = clamp(BaseChance × (1 + EHR) × (1 − EffectRES + EffectRESPEN), 0, 1)
DoT DMG = (ordinary DMG product) × Chance
```

- Applies only to a `hit` with the `dot` tag that sets `baseChance` (the base chance of the debuff that deals the DoT, which may exceed 1). Without `baseChance` the factor is 1, as before. Validation rejects `baseChance` on a hit without `dot`.
- **[CROSS-CHECKED]** R1 `DotDamageFunction`: `min(1, dotBaseChance × (1 + EHR) × (1 − enemyEffectRes + EFFECT_RES_PEN))`, applied to DoT only. The floor at 0 is **[ENGINE]**: R1 has none, and it only matters when Effect RES exceeds 1 + PEN.
- **EHR** and **EffectRESPEN** (`effectResPen`, a new stat) are read from the attacker in the hit's context. **EffectRES** is the target's `EnemyConfig.effectRes` (caller-supplied; default 0 is **[ENGINE]**) plus Σ its `effectRes` modifiers, so an "Effect RES −X%" debuff is a negative `effectRes` modifier on the enemy.
- The game's real-chance formula also has a debuff-specific RES factor `(1 − Debuff RES)`. Its form comes only from search snippets of the Fandom Effect RES and Debuff RES pages, which were not read (HTTP 402). R1 has no such term, and **it is not modelled**.
- R1's extra weighting for multi-stack DoTs (`dotSplit`, `dotStacks`) is **not modelled**: each DoT hit is weighted by its own chance.
- Applies in every crit mode. Crit mode only decides CRIT; a DoT that should be assumed to land simply omits `baseChance`.
- The factor is `DamageBreakdown.dotChanceMultiplier`, and `ResolvedHitStats` shows `effectHitRate`, `effectResPen` and `targetEffectRes`. Break hits always have 1.
- Only DoT damage is weighted. Debuffs applied by `apply` steps still always land (KNOWN_LIMITATIONS).

Function: `formulas.dotApplicationChance`, used by `computeBreakdown`.

Hand-computed tests (`src/engine/__tests__/dot-chance.test.ts`; the unweighted DoT is 1950 × 1.4 × 1000/2100 × 0.8 × 0.9 = 936):

| Case | Arithmetic | Result |
|---|---|---|
| Base 60%, EHR 50%, Effect RES 20% − 10% debuff | 0.6 × 1.5 × 0.9 = 0.81; 936 × 0.81 | 758.16 |
| Same, plus Effect RES PEN 10% | 0.6 × 1.5 × (1 − 0.1 + 0.1) | 0.9 |
| Base 100%, EHR 50%, RES 40%, PEN 10% | min(1, 1 × 1.5 × 0.7) | 1 |
| Base 100%, RES 150% | max(0, 1 × 1 × −0.5) | 0 |

## Action Value

```
AV = 10000 / SPD
```

**[UNVERIFIED]**. This is a utility only, and the rotation engine does not use it.

## Rounding

- The engine never rounds. R1 doesn't round damage either (**[CROSS-CHECKED]**, as an optimizer convention).
- Whether the game itself floors values remains **[UNVERIFIED]**. The UI should round only for display. *(E1, 2026-11-07: no authoritative source found. A Prydwen worked example (search snippet only) differs from the game by under 1 point and blames rounded displayed stats, as a guess.)*

---

## Worked example (covered by `damage.test.ts`)

The inputs are synthetic test values, not game data.

| Input | Value |
|---|---|
| Attacker level | 80 |
| ATK | (600 + 500) × 1.5 + 300 = **1950** |
| CRIT Rate / CRIT DMG | 0.70 / 1.50 |
| DMG Boost | Fire DMG +40% (relic), Skill DMG +20% (buff) |
| Enemy | Lv90 (DEF 1100), Fire RES 20%, unbroken |
| Hit | Skill, Fire, 200% ATK |

| Factor | Value |
|---|---|
| Base | 2.0 × 1950 = 3900 |
| CRIT (expected) | 1 + 0.7 × 1.5 = 2.05 |
| DMG Boost | 1 + 0.4 + 0.2 = 1.6 |
| DEF | 1 − 1100 / (1100 + 1000) = 0.47619… |
| RES | 1 − 0.2 = 0.8 |
| Broken | 0.9 |
| Others | 1 |
| **Total** | **4385.828571…** |

Cross-check against R1's DEF form: `100 / ((90 + 20) × 1 + 100) = 100/210 = 0.47619…` ✓

## Not covered in the MVP

- DoT snapshotting rules, R1's multi-stack DoT weighting, and debuff-specific RES. See § DoT application chance.
- Chained stat conversions. See § Stat conversion.
- *Done 2026-11-07:* break-specific DMG boosts and the Weakness Break Efficiency / Super Break DMG stats (E4 follow-up), DoT application chance (E8), and stat conversions (E7).

See `KNOWN_LIMITATIONS.md`.
