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
- The Fandom wiki Damage page could not be read (bot verification).

---

## Outgoing DMG

```
DMG = BaseDMG × CRIT × DMGBoost × Weaken × DEF × RES × Vulnerability
    × Mitigation × Broken × FinalDMG × TrueDMG
```

The multipliers are independent and multiply together, so their order does not affect the result.

- The overall structure is **[SOURCED]** S1 and S2.
- **[CROSS-CHECKED]** R1 has the same product for CRIT, DMG Boost, DEF, RES, Vulnerability, Broken, Final DMG and True DMG.
- R1 has **no** Weaken or enemy-side Mitigation factor, so those two stay **[UNVERIFIED]**.

Function: `computeBreakdown` in `src/engine/damage.ts`. It returns every factor separately (`DamageBreakdown`).

## Base DMG

```
BaseDMG = (SkillMultiplier + ExtraMultiplier) × ScalingStat + FlatDMG
```

- **[CROSS-CHECKED]** R1 computes `atkScaling × ATK + hpScaling × HP + defScaling × DEF`. An extra scaling term adds to the ATK multiplier.
- R1 has no flat DMG term, so `FlatDMG` is **[UNVERIFIED]**.
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
- **[CROSS-CHECKED]** DoT cannot crit: R1's `DotDamageFunction` has no CRIT factor. `canCrit` defaults to `false` for the `dot` tag and can be overridden per hit.
- R1 additionally weights DoT by its chance to apply (EHR vs effect RES). **That is not modelled here** (see KNOWN_LIMITATIONS).

## DMG Boost

```
DMGBoost = 1 + Σ dmgBoost   (all matching modifiers: elemental, all-type, ability-type)
```

**[CROSS-CHECKED]** R1 uses `1 + genericBoost + elementalBoost`.

## Weaken

```
Weaken = max(0, 1 − Σ weaken)   (read from the attacker)
```

- **[UNVERIFIED]**: not present in R1.
- The floor at 0 is **[ENGINE]**.

## DEF

```
EnemyBaseDEF = 200 + 10 × EnemyLevel
TargetDEF    = max(0, BaseDEF × max(0, 1 + DEF% − DEFReduction − DEFIgnore) + flatDEF)
DEF          = 1 − TargetDEF / (TargetDEF + 200 + 10 × AttackerLevel)
```

- **[SOURCED]** S1 (DEF formula, DEF floor at 0).
- **[CROSS-CHECKED]** R1 uses `100 / ((EnemyLevel + 20) × max(0, 1 − DEF_PEN) + 100)`. This is the same formula, with enemy base DEF `200 + 10 × level` and attacker level fixed at 80, since `100 = 80 + 20`. R1 puts DEF reduction and DEF ignore in **one** pool (`DEF_PEN`), floored at 0, which is identical to ours.
- The enemy DEF% bonus (`defPct` on the enemy) and `flatDEF` are **[UNVERIFIED]**, because R1 does not model them.
- Example check: a Lv80 attacker against a Lv80 enemy with no modifiers gives `0.5`, which matches S2.
- `EnemyConfig.baseDef` overrides the level formula.

## RES

```
RES = 1 − clamp(EnemyRES − ΣresPen − ΣresReduction, −1.0, 0.9)
    = clamp(1 − (EnemyRES − ΣresPen − ΣresReduction), 0.1, 2.0)
```

- The linear form is **[SOURCED]** S2.
- **[CROSS-CHECKED]** R1 uses `1 − min(0.90, max(−1.00, RES − RES_PEN))`, which gives the same [10%, 200%] bounds. R1 puts RES PEN and RES reduction in one pool (`RES_PEN`).
- S2's pre-release remark that "RES over 100% could reduce the multiplier to 0" conflicts with this. We follow R1.
- Enemy RES values are **caller-supplied**. Missing elements default to 0 **[ENGINE]**.

## Vulnerability (DMG Taken)

```
Vulnerability = 1 + clamp(Σ vulnerability, 0, 2.5)   (read from the target)
```

- **[CROSS-CHECKED]** R1 uses `1 + min(2.50, max(0, VULNERABILITY))`. The cap is therefore **+250%** (a ×3.5 multiplier). *Changed 2026-11-07: the engine previously had no cap.*
- Multiplicative with the other factors: **[SOURCED]** S2.
- Constants: `VULNERABILITY_MIN/MAX`.

## Mitigation (DMG Reduction)

```
Mitigation = Π (1 − m_i)   (each dmgMitigation modifier on the target)
```

- **[UNVERIFIED]** for outgoing damage, because R1 does not model enemy DMG reduction.
- R1 does compose *ally* DMG reduction (used for EHP) multiplicatively as `1 − (1 − a)(1 − b)`. This is consistent with our approach, but it is not proof.
- This factor does not include the toughness multiplier.

## Toughness (Broken)

```
Broken = 1.0 if broken, else 0.9
```

- **[SOURCED]** S2. **[CROSS-CHECKED]** R1 uses `enemyWeaknessBroken ? 1 : 0.9`.
- The broken state is set manually via `setBroken` or `EnemyConfig.broken`.

## Final DMG (added 2026-11-07)

```
FinalDMG = Π (1 + f_i)   (each finalDmgBoost modifier on the attacker)
```

- **[CROSS-CHECKED]** R1 uses `1 + FINAL_DMG_BOOST`, where every source applies through `(1 + current) × (1 + new) − 1`, i.e. multiplicatively.
- R1 uses this zone for some newer abilities that state a separate DMG multiplier. Which abilities belong here is caller-supplied data, so the engine encodes none.

## True DMG (added 2026-11-07)

```
TrueDMG = 1 + Σ trueDmg   (read from the attacker)
```

- **[CROSS-CHECKED]** R1 uses `1 + TRUE_DMG_MODIFIER + hit.trueDmgModifier`, which is additive.
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
