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

- **S1**: Prydwen damage formula guide (`prydwen.gg/star-rail/guides/damage-formula`). Automated fetch returned HTTP 403; the page was read in full in the browser pane on 2026-11-08. It confirms the RES bounds and that DMG Taken (Vulnerability) sources add, states no Vulnerability cap, and offers only a guess about rounding. It adds nothing for the remaining E1 items.
- **S2**: GenshinTheory, "hsr damage" (`genshintheory.github.io/hsr-damage.html`). Read in full. It is an early, pre-release write-up.
- **R1** (also **B** in `DATA_SOURCES.md`): Fribbels HSR Optimizer, `github.com/fribbels/hsr-optimizer`, MIT license, commit `ac5e9d6` (2026-11-04). The file is `src/lib/optimization/engine/damage/damageCalculator.ts`, mainly `computeCommonMultipliers`, `calculateDefMulti`, `getCritMultiplier` and `DotDamageFunction`. It was read on 2026-11-07. No code was copied; only the formulas were compared.
- **R1′**: the same repository at the same commit (`ac5e9d6`), stat and buff pipeline, read on 2026-11-07 for E1: `src/lib/optimization/context/calculateContext.ts` (`sumCharacterBase`), `src/lib/optimization/calculateStats.ts` (`calculateBaseStats`, `sumFlatStat`, `applyPercentStats`) and `src/lib/optimization/engine/container/computedStatsContainer.ts` (`MULTIPLICATIVE_BOOST`). Formulas compared only; no code copied.
- **R2**: Nous StarRailSim (`starrailsim.com`). This is a closed-source cloud simulator that claims ≤0.5% error against the game. It publishes **no formulas**, so it cannot verify anything here. Its APL reference page (`starrailsim.com/apl`, read in the browser pane on 2026-11-08) was the design reference for E9/E6.
- **S4**: KQM Star Rail Library, "Turn Order Mechanics" (`srl.keqingmains.com/combat-mechanics/turn-order/turn-order-mechanics`). Read in full on 2026-11-08. A community theorycrafting page; no licence shown. Only the mechanics are referenced.
- **S5**: GenshinTheory, "hsr speed" (`genshintheory.github.io/hsr-speed.html`). Read in full on 2026-11-08. Its SPD-change formula, as extracted, contradicts its own derivation, so only its start/reset and negative-gauge statements are used.
- **S3**: Honkai: Star Rail Wiki (Fandom), "Damage" (`honkai-star-rail.fandom.com/wiki/Damage`), section "General Damage Formula". Read in full on 2026-11-07, after the user cleared the site's bot check in the browser pane. Text is CC-BY-SA. Only the formulas are referenced; none of the page's game data (hit splits, ability values) is used.
- **S3, more pages** (same wiki, CC-BY-SA), read on 2026-11-08 for E1 after the user cleared one bot check: "Damage RES" and "Vulnerability" (rendered pages), then "Weaken", "Weakness Break" (§ Damage Formula and § Super Break DMG), "Speed" (§ turn order, § Cycles and Breakpoints, § Action Value Modification), "Effect RES", "Debuff RES" and "Effect Hit Rate", as wikitext from the wiki's own `api.php?action=parse` in the same browser session. Only formulas and rules are referenced; no enemy tables or ability values are used.
- The CRIT Rate and DEF sub-pages were not read.

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

HP works the same way. SPD uses the character base only: `SPD = Base SPD × (1 + SPD%) + Flat SPD`, **[SOURCED]** S3 Speed (2026-11-08).

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
- Summing several Weaken sources is **[UNVERIFIED]**, because S3 shows a single value. *(E1, 2026-11-07: still no source. R1 has no Weaken term.)*
- **[SOURCED]** S3 Weaken and Weakness Break (2026-11-08): Break-related DMG is not affected by Weaken. Break and Super Break hits use a Weaken multiplier of 1 (§ Break DMG). *Changed 2026-11-08: the engine used to apply Weaken to them.*
- Summing several sources is still **[UNVERIFIED]** after reading the Weaken page (2026-11-08): it gives only `1 − Weaken`.
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
- **[SOURCED]** S3 Damage RES (read 2026-11-08): Damage RES ranges between −100% and 90%, so the RES multiplier ranges between 10% and 200%. The bounds no longer rest on R1 alone.
- S2's pre-release remark that "RES over 100% could reduce the multiplier to 0" conflicts with this. We follow R1.
- Enemy RES values are **caller-supplied**. Missing elements default to 0 **[ENGINE]**.

## Vulnerability (DMG Taken)

```
Vulnerability = 1 + clamp(Σ vulnerability, 0, 2.5)   (read from the target)
```

- **[CROSS-CHECKED]** R1 uses `1 + min(2.50, max(0, VULNERABILITY))`. The cap is therefore **+250%** (a ×3.5 multiplier). *Changed 2026-11-07: the engine previously had no cap.*
- **[SOURCED]** S3 gives `1 + Type Vulnerability + Elemental Vulnerability + All-Type Vulnerability`, i.e. additive. S3's Damage page states no cap, so the cap rests on R1 alone. *(E1, 2026-11-07: re-read in R1′ `computeCommonMultipliers`, unchanged.)* *(E1, 2026-11-08: the S3 Vulnerability page says different sources stack additively, **[SOURCED]**, and states no cap. The +250% cap still rests on R1 alone.)*
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
         × BreakDMGIncrease × DEF × RES × Vulnerability × Mitigation × Broken × FinalDMG × TrueDMG
```

- **LevelMultiplier** is the attacker's `CharacterBuild.breakLevelMultiplier`. `src/data` tabulates it from source A's `ExcelOutput/AvatarBreakDamage.json` (`BreakBaseDamage` by level, levels 1–100 and 120) and the account import fills it in. **[SOURCED]** A. **[CROSS-CHECKED]** at level 80 only: A's 3767.5535 equals R1's constant 3767.5533 to 3 decimals. R1 fixes the attacker at level 80, so other levels are **[UNVERIFIED]**.
- **ElementFactor** (`formulas.BREAK_ELEMENT_FACTOR`): Physical 2, Fire 2, Wind 1.5, Ice 1, Lightning 1, Quantum 0.5, Imaginary 0.5. **[CROSS-CHECKED]** R1 `ElementToBreakScaling` (`calculateContext.ts@dd0c4af`), compared by `crosscheck-b.test.ts`.
- **MaxToughness** is `EnemyConfig.maxToughness` in **displayed** units (a Basic ATK typically shows 10). **[CROSS-CHECKED]** R1 computes `0.5 + T / 120`, but its enemy form stores Toughness ×3 and labels it `toughness / 3` (`EnemyConfigurationsDrawer.tsx@dd0c4af`), so R1's term is `0.5 + T_displayed / 40`. Source A shows the same ×3 ratio for skills: March 7th's Basic ATK has `ShowStanceList` 30 and `StanceDamageDisplay` 10 (`AvatarSkillConfig`).
- **Multiplier** (`BreakDmgSpec.multiplier`, default 1) is R1's `specialScaling`, for abilities that deal "X% of Break DMG".
- **(1 + BreakEffect)**: **[CROSS-CHECKED]** R1 `beMulti`. The engine folds it into `DamageBreakdown.baseDmg`, so the breakdown keeps the same factors as an ordinary hit. `HitResult.break` lists the parts.
- **No CRIT; only break-specific DMG Boost.** **[CROSS-CHECKED]** R1 uses `dmgBoostMulti = 1 + (hit-level BOOST)` for Break and Super Break (its comment: "no action-level, no elemental boost"). *(Added 2026-11-07, E4 follow-up.)* The engine's equivalent is `DMGBoost = 1 + Σ dmgBoost` over the attacker's modifiers whose condition **names `break`** (for Super Break, see § Super Break DMG for its second factor). Unconditional, element-only and other-tag DMG Boost does not apply. `stats.dmgBoost` and `BreakDetails.breakDmgIncrease` show that sum. `critMultiplier` is 1.
- **DEF, RES, Vulnerability, Broken, Final DMG, True DMG**: the same functions as ordinary hits. **[CROSS-CHECKED]** R1 applies the same common multipliers to Break DMG.
- **[SOURCED]** S3 Weakness Break (2026-11-08) gives `Base DMG × Ability Multiplier × (1 + Break Effect) × DMG Increase Multiplier × DEF × RES × Vulnerability × DMG Mitigation × Broken`, with `DMG Increase Multiplier = 1 + Break DMG Increase`, and says Break-related DMG is not affected by CRIT Rate, CRIT DMG, DMG Boost and Weaken. This matches the engine: `dmgBoostMultiplier` for a break hit **is** S3's Break DMG Increase, since only modifiers naming the `break` tag count (shown as `BreakDMGIncrease` above).
- **Weaken** is 1 for break hits, **[SOURCED]** S3. *Changed 2026-11-08 (E1): it used to be applied.* `stats.weaken` still shows the attacker's Weaken. **Mitigation** is applied, **[SOURCED]** S3.
- **Final DMG and True DMG** are not in S3's break formula. They stay because R1 applies them (**[CROSS-CHECKED]** only).
- **Tags** *(changed 2026-11-07, E4 follow-up; 2026-11-08, E11)*: a Break hit reports the tag `break`, and a Super Break hit `superBreak` (this is what `HitResult.tags` and `damageByTag` use). For **matching modifiers**, a Break hit matches `break`, and a Super Break hit matches both `superBreak` and `break`, because **[SOURCED]** S3 Weakness Break says Super Break DMG is also considered Break DMG. So a target-held `vulnerability` with `damageTags: ['break']` reaches both kinds, while one with `damageTags: ['superBreak']` (e.g. `defIgnore`) reaches Super Break only. Modifiers conditioned on other tags never apply. Element-conditioned ones apply as before. Ordinary `hit` steps may not carry these tags.
- **Broken** uses the target's state at that step. **[SOURCED]** S3 Weakness Break (2026-11-08): the 0.9 multiplier applies while the enemy has Toughness, and the page notes that this affects the Break DMG dealt when Toughness is depleted. So the Break DMG of the breaking hit uses 0.9: put the `break` step **before** `setBroken: true`.

Function: `calculateBreakHit` / `computeBreakBreakdown` in `src/engine/breakDamage.ts`, with `formulas.breakToughnessFactor`, `breakBaseDmg` and `breakEffectMultiplier`.

## Super Break DMG (added 2026-11-07, TASKS E4)

```
Toughness       = (1 + BreakEfficiency) × ToughnessReduction + FixedToughnessReduction
SuperBreakDMG   = LevelMultiplier × Toughness / 10 × Multiplier × (1 + BreakEffect)
                × BreakDMGIncrease × SuperBreakDMGIncrease
                × DEF × RES × Vulnerability × Mitigation × Broken × FinalDMG × TrueDMG
```

- **[CROSS-CHECKED]** R1 `SuperBreakDamageFunction`: `(3767.5533 / 10) × effectiveToughness × beMulti × superBreakModMulti`, with `effectiveToughness = (1 + breakEfficiency) × toughnessDmg + fixedToughnessDmg`. R1's `toughnessDmg` is in displayed units (e.g. March 7th's Basic ATK is `.toughnessDmg(10)` in `March7th.ts@dd0c4af`).
- **ToughnessReduction** and **FixedToughnessReduction** describe the triggering hit and are entered on the step (`SuperBreakDmgSpec`).
- **BreakEfficiency** (Weakness Break Efficiency) is the step's `breakEfficiency` + Σ the attacker's `breakEfficiency` stat *(stat added 2026-11-07, E4 follow-up)*. **[CROSS-CHECKED]** R1 uses `1 + BREAK_EFFICIENCY_BOOST`, one additive term, and scales only `toughnessDmg`, not `fixedToughnessDmg`.
- **Multiplier** (the Super Break DMG multiplier, R1's `SUPER_BREAK_MODIFIER`) is the step's `multiplier` + Σ the attacker's `superBreakDmg` stat *(stat added 2026-11-07)*. **[CROSS-CHECKED]** R1 adds `SUPER_BREAK_MODIFIER + hit.extraSuperBreakModifier`. A step may set `multiplier: 0` and take it all from buffs. The code read does not show whether R1's stat container sums several sources, so summing them is **[ENGINE]**, consistent with R1's single additive term.
- Both stats are read in the Super Break hit's context (tag `superBreak`). They describe the triggering hit, but the engine does not know that hit's tags, so a `breakEfficiency` modifier conditioned on e.g. `ultimate` never applies. **[ENGINE]**
- The other factors follow § Break DMG: no CRIT, **no Weaken** (S3, changed 2026-11-08), Mitigation applied.
- **Break DMG Increase × Super Break DMG Increase** *(E11, changed 2026-11-08)*. **[SOURCED]** S3 Weakness Break says Super Break DMG is also considered Break DMG, and gives `… × (1 + Break DMG Increase) × (1 + Super Break DMG Increase) × …`: two factors that **multiply**. The engine follows S3:
  - `BreakDMGIncrease` = `1 + Σ dmgBoost` over modifiers naming `break` (`BreakDetails.breakDmgIncrease`, also `stats.dmgBoost`).
  - `SuperBreakDMGIncrease` = `1 + Σ dmgBoost` over modifiers naming `superBreak` but **not** `break` (`BreakDetails.superBreakDmgIncrease`).
  - `DamageBreakdown.dmgBoostMultiplier` is their product.
  - A modifier naming both tags counts once, in `BreakDMGIncrease`. **[ENGINE]** This keeps one buff from being applied twice.
  - *Before 2026-11-08* a `break` modifier did not reach Super Break, and `superBreak` DMG Boost was the only factor. Results with `break`-tagged buffs and Super Break steps change.
- **R1 is not contradicted.** R1's `SUPER_BREAK_MODIFIER` is the Super Break **ability multiplier** (S3's "Ability Multiplier" for Super Break), which the engine still sums from the step's `multiplier` and the `superBreakDmg` stat. S3's Super Break DMG Increase is a separate DMG Increase. R1 has no `break`-tagged boost reaching Super Break, so with a Break DMG Increase on a Super Break hit the engine and R1 differ; the engine follows S3.

Hand-computed tests for E11 (`break-buffs.test.ts`, synthetic): Super Break with `break` +30%, `superBreak` +60% and an ignored unconditional +100%: 4000 × 10/10 × 2.5 × (1.3 × 1.6 = 2.08) × 0.8 × 1000/2100 = **7923.809…**. One modifier naming both tags at +50%: factor 1.5 (not 2.25). A target-held Break DMG vulnerability of 25% gives 1.25 on Super Break too.

Function: `calculateBreakHit` with `formulas.superBreakToughness` and `superBreakBaseDmg`.

Hand-computed tests (synthetic numbers, `src/engine/__tests__/break.test.ts`). The attacker has LevelMultiplier 4000 and Break Effect 150%. The target is Lv90 (DEF 1100), Fire RES 20%, max Toughness 120, broken. DEF = 1000/2100, RES = 0.8.

| Hit | Arithmetic | Result |
|---|---|---|
| Break, Fire | 4000 × 2 × (0.5 + 120/40) × 1 × 2.5 × 1000/2100 × 0.8 | 26666.666… |
| Break, Quantum override (no Quantum RES) | 4000 × 0.5 × 3.5 × 2.5 × 1000/2100 | 8333.333… |
| Super Break, reduction 20, efficiency 50%, multiplier 150% | 4000 × (1.5 × 20) / 10 × 1.5 × 2.5 × 1000/2100 × 0.8 | 17142.857… |
| Break, unbroken, target vulnerability 20% | 70000 × 1000/2100 × 0.8 × 1.2 × 0.9 | 28800 |
| Break, `break`-tagged DMG +30% (unconditional DMG +100% ignored) | 70000 × 1.3 × 0.8 × 1000/2100 | 34666.666… |
| Super Break, `break`-tagged DMG +30% and `superBreak`-tagged DMG +60% (E11) | 4000 × 10/10 × 2.5 × (1.3 × 1.6) × 0.8 × 1000/2100 | 7923.809… |
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
Chance  = clamp(BaseChance × (1 + EHR) × (1 − EffectRES + EffectRESPEN) × (1 − DebuffRES), 0, 1)
DoT DMG = (ordinary DMG product) × Chance
```

- Applies only to a `hit` with the `dot` tag that sets `baseChance` (the base chance of the debuff that deals the DoT, which may exceed 1). Without `baseChance` the factor is 1, as before. Validation rejects `baseChance` on a hit without `dot`.
- **[SOURCED]** S3 Effect RES, Debuff RES and Effect Hit Rate (2026-11-08): `Real Chance = Base Chance × (1 + Effect Hit Rate) × (1 − Effect RES) × (1 − Debuff RES)`. The Debuff RES term is modelled since 2026-11-08 (E12). S3 has no Effect RES PEN term, which comes from R1 only.
- **[CROSS-CHECKED]** R1 `DotDamageFunction`: `min(1, dotBaseChance × (1 + EHR) × (1 − enemyEffectRes + EFFECT_RES_PEN))`, applied to DoT only. The floor at 0 is **[ENGINE]**: R1 has none, and it only matters when Effect RES exceeds 1 + PEN.
- **EHR** and **EffectRESPEN** (`effectResPen`, a new stat) are read from the attacker in the hit's context. **EffectRES** is the target's `EnemyConfig.effectRes` (caller-supplied; default 0 is **[ENGINE]**) plus Σ its `effectRes` modifiers, so an "Effect RES −X%" debuff is a negative `effectRes` modifier on the enemy.
- **DebuffRES** *(E12, added 2026-11-08)* is `EnemyConfig.debuffRes[hit.dotType]` (caller-supplied, fractions; a missing type is 0, **[ENGINE]**). `HitSpec.dotType` is one of `DOT_TYPES` (`bleed`, `burn`, `shock`, `windShear`), the DoT debuffs on S3's Debuff RES page, and needs `baseChance`. Without `dotType` the factor is 1. R1 has no such term. Debuff RES is not a stat, so modifiers cannot change it. **[ENGINE]**
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
| Base 60%, EHR 50%, Effect RES 20%, Burn Debuff RES 30%, `dotType: 'burn'` (E12) | 0.6 × 1.5 × 0.8 × 0.7 = 0.504; 936 × 0.504 | 471.744 |
| Same enemy, `dotType: 'shock'` (no Shock Debuff RES), or no `dotType` | 0.6 × 1.5 × 0.8 = 0.72; 936 × 0.72 | 673.92 |

## Action Value

Used only by the turn order helper (E6, `suggestTurnOrder` in `src/engine/timeline.ts`). `runRotation` stays manual (SPEC D1).

```
gauge   = 10000 at battle start and again right after each of the unit's turns
AV      = gauge / SPD                         (full turn: 10000 / SPD)
SPD change:      gauge kept, so AV_new = AV_old × SPD_old / SPD_new
Advance/Delay X: gauge_new = max(0, gauge_old − X × 10000)   (X > 0 advance, X < 0 delay)
Act now:         gauge_new = 0
```

- **[SOURCED]** S3 Speed (2026-11-08): Base AV = 10000 / SPD; each unit starts at its Base AV; the lowest AV acts and all others subtract it; the actor is reset to its Base AV. After a SPD change, `AV_new = AV_old × SPD_old / SPD_new`. Advance and Delay: `AV_new = max(0, AV_old − Base AV × (Advance% − Delay%))`, a percentage of the **full** turn time. This is the gauge formula above, since Base AV × SPD = 10000.
- **[SOURCED]** S4: the gauge starts at 10000 for every unit, a unit acts when it reaches 0, and it refills to 10000 after the unit acts. AV = gauge / SPD. A SPD change scales the current AV by old / new SPD. Advance and Delay add or subtract a percentage **of 10000** (not of the remaining gauge). S5 gives the same start and reset. R2's APL reference also says (in its Chinese page) that the next turn comes a full 10000 / current SPD later.
- **[SOURCED]** S4, ties: characters sort before enemies, and the lower slot acts first. **[UNVERIFIED]** S4 describes this for the battle-start order and a stable sort afterwards. The engine applies the same rule to every tie mid-battle.
- **[SOURCED]** Floor at 0: S3's `max(0, …)`. *Changed 2026-11-08 (E1): the engine used to keep negative gauges, following S5, which says a negative gauge is allowed. S3 is explicit, and S4 gives no floor either way.* Two units advanced to 0 tie, and the tie rule decides.
- **[SOURCED]** "Immediately take action" (`TimelineAdjustment.actNow`): S3 Speed says it sets the AV to 0 whatever it was, so it fully advances even a delayed unit, which a 100% advance does not. Applied after `spd` and `advance` in the same adjustment. If it lands during another unit's turn, that turn finishes first, which the trigger-after-turn rule already gives.
- **[ENGINE]** Ultimates, follow-ups and extra actions are not turns. They do not touch any gauge, and the helper does not list them; the user adds them as `extra` events. R2 says the same of its own AV readings: only turns count. Effects that cancel or insert turns in the game (e.g. Frozen, Toughness Break delay) must be entered as adjustments.
- An adjustment triggered by a turn is applied right after that turn ends, after the actor's gauge refill. One that targets the actor therefore changes its next turn. **[SOURCED]** S3 Speed: post-action Ultimates **can** advance the actor's next action because its AV has been reset, while pre-action Ultimates cannot. A pre-action effect must be entered as an adjustment on the previous turn.
- **[ENGINE]** Turns at exactly `avLimit` are included. Ties are detected with a relative tolerance of 1e-9 (so 3 × 10000/3 ties with 10000). No AV value is rounded.
- **[SOURCED]** Cycles, S3 Speed (2026-11-08): in challenges such as the Forgotten Hall, the first cycle at the start of **each wave** lasts 150 AV and later cycles 100 AV each. Exported as `CHALLENGE_CYCLE_AV`. The helper models one wave and applies cycles only when the caller passes `cycleAv`. A turn at exactly a boundary belongs to the earlier cycle **[ENGINE]**.

Hand-computed tests (`src/engine/__tests__/timeline.test.ts`; synthetic SPD values):

| Case | Arithmetic | Order |
|---|---|---|
| SPD 134 vs enemy SPD 100, limit 200 | 10000/134 = 74.63, 149.25, 223.88 (out); 100, 200 | a1, e1, a2, e2 |
| SPD 100 and 200; a advanced 25% after b's turn 1 | a's gauge at 50: 10000 − 50 × 100 = 5000 − 2500 = 2500 → 50 + 25 = 75 | b@50, a@75, b@100, b@150, a@175, b@200 |
| Same, but a's SPD becomes 125 instead | 5000 / 125 = 40 → 90, then 90 + 80 = 170 | b@50, a@90, b@100, b@150, a@170, b@200 |
| Enemy delayed 25% at start | 12500 / 100 = 125 | a@100, e@125, a@200 |
| Advance 150% and 100% at start | max(0, −5000) = 0 and 0: both act at 0, tie by slot | b@0, a@0, b@100, a@100 |
| Enemy delayed 50%, then advanced 100% | 15000 − 10000 = 5000 → 50 | e@50, a@100, e@150, a@200 |
| Enemy delayed 50%, then `actNow` | gauge 0 → 0, then 100 (tie, ally first) | e@0, a@100, e@100, a@200, e@200 |
| Cycles first 150, later 100 | 50, 100, 150 → 1; 200, 250 → 2; 300 → 3 | |

Function: `formulas.actionValue` (a full gauge, 10000 / SPD), used by `suggestTurnOrder`.

## Rounding

- The engine never rounds. R1 doesn't round damage either (**[CROSS-CHECKED]**, as an optimizer convention).
- Whether the game itself floors values remains **[UNVERIFIED]**. The UI should round only for display. *(E1, 2026-11-07: no authoritative source found. A Prydwen worked example (search snippet only) differs from the game by under 1 point and blames rounded displayed stats, as a guess.)* *(2026-11-08: S1 read in full; it still only guesses.)*

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

- DoT snapshotting rules and R1's multi-stack DoT weighting. See § DoT application chance.
- Chained stat conversions. See § Stat conversion.
- *Done 2026-11-07:* break-specific DMG boosts and the Weakness Break Efficiency / Super Break DMG stats (E4 follow-up), DoT application chance (E8), and stat conversions (E7).
- *Done 2026-11-08:* Super Break as Break DMG (E11) and Debuff RES (E12).

See `KNOWN_LIMITATIONS.md`.
