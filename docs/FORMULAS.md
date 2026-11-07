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
- **R1**: Fribbels HSR Optimizer, `github.com/fribbels/hsr-optimizer`, MIT license, commit `ac5e9d6` (2026-11-04). The file is `src/lib/optimization/engine/damage/damageCalculator.ts`, mainly `computeCommonMultipliers`, `calculateDefMulti`, `getCritMultiplier` and `DotDamageFunction`. It was read on 2026-11-07. No code was copied; only the formulas were compared.
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

HP works the same way. SPD uses the character base only. **[UNVERIFIED]** (standard community knowledge; R1's stat pipeline was not reviewed).

An ally's own DEF uses the same pool as the target DEF formula: `base × max(0, 1 + DEF% − DEFreduction) + flat`.

## Base CRIT

Defaults are CRIT Rate 5% and CRIT DMG 50% for every character, overridable via `CharacterBuild.baseCritRate/baseCritDmg`. **[UNVERIFIED]**: these constants were not located in R1.

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
- R1 additionally weights DoT by its chance to apply (EHR vs effect RES). **That is not modelled here** (see KNOWN_LIMITATIONS).

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
- Summing several Weaken sources is **[UNVERIFIED]**, because S3 shows a single value.
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
- S2's pre-release remark that "RES over 100% could reduce the multiplier to 0" conflicts with this. We follow R1.
- Enemy RES values are **caller-supplied**. Missing elements default to 0 **[ENGINE]**.

## Vulnerability (DMG Taken)

```
Vulnerability = 1 + clamp(Σ vulnerability, 0, 2.5)   (read from the target)
```

- **[CROSS-CHECKED]** R1 uses `1 + min(2.50, max(0, VULNERABILITY))`. The cap is therefore **+250%** (a ×3.5 multiplier). *Changed 2026-11-07: the engine previously had no cap.*
- **[SOURCED]** S3 gives `1 + Type Vulnerability + Elemental Vulnerability + All-Type Vulnerability`, i.e. additive. S3's Damage page states no cap, so the cap rests on R1 alone.
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
- **[CROSS-CHECKED]** R1 uses `1 + FINAL_DMG_BOOST`, where every source applies through `(1 + current) × (1 + new) − 1`, i.e. multiplicatively.
- R1 uses this zone for some newer abilities that state a separate DMG multiplier. Which abilities belong here is caller-supplied data, so the engine encodes none.

## True DMG (added 2026-11-07)

```
TrueDMG = 1 + Σ trueDmg   (read from the attacker)
```

- **[CROSS-CHECKED]** R1 uses `1 + TRUE_DMG_MODIFIER + hit.trueDmgModifier`, which is additive.
- S3 describes True DMG as damage dealt directly, "without being modified by any damage calculation multipliers". So this multiplier only models effects of the form "additionally deals True DMG equal to X% of this hit's DMG". True DMG based on other values (tallied DMG, Max HP) is **not supported**; enter it as a separate figure outside the engine.
- Whether a given True DMG effect applies to DoT or Break DMG is ability-specific. Restrict it with modifier conditions.

## Action Value

```
AV = 10000 / SPD
```

**[UNVERIFIED]**. This is a utility only, and the rotation engine does not use it.

## Rounding

- The engine never rounds. R1 doesn't round damage either (**[CROSS-CHECKED]**, as an optimizer convention).
- Whether the game itself floors values remains **[UNVERIFIED]**. The UI should round only for display.

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

- Break DMG, Super Break DMG, and the break level multiplier table. R1 has a break formula, but it depends on game constants, so it waits for TASKS E4 with sourcing.
- DoT application-chance weighting and DoT snapshotting rules.
- Stat-conversion buffs.

See `KNOWN_LIMITATIONS.md`.
