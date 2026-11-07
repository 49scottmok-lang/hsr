# Damage Formulas (MVP)

Every formula below maps to one function in `src/engine/formulas.ts`. All percentages are fractions (`0.5` = 50%).

## Verification status legend

| Tag | Meaning |
|---|---|
| **[SOURCED]** | Stated by a public community source that was actually read while writing this doc (cited). |
| **[UNVERIFIED]** | Widely repeated community knowledge, but **no source was read to confirm it**. Must be verified before release. |
| **[ENGINE]** | A modelling decision made by this engine. Not a claim about the game. |

Sources read on 2026-11-07:

- S1: Prydwen damage formula guide (`prydwen.gg/star-rail/guides/damage-formula`). Only the search-result summary was available; the page returned HTTP 403 to automated fetch.
- S2: GenshinTheory, "hsr damage" (`genshintheory.github.io/hsr-damage.html`). Read in full. It is an **early, pre-release** write-up and may be outdated.
- The Fandom wiki Damage page could not be read (bot verification). Verify the [UNVERIFIED] items against it or an equivalent primary-ish source.

---

## Outgoing DMG

```
DMG = BaseDMG
    × CRIT
    × DMGBoost
    × Weaken
    × DEF
    × RES
    × Vulnerability
    × Mitigation
    × Broken
```

The multipliers are independent and multiply together, so their order does not affect the result. Structure: **[SOURCED]** S1 and S2. S1 lists the universal DMG reduction and weaken multipliers, and S2 lists the broken multiplier.

Function: `computeBreakdown` in `src/engine/damage.ts`. It returns every factor separately (`DamageBreakdown`), so the UI can show each one.

## Base DMG

```
BaseDMG = (SkillMultiplier + ExtraMultiplier) × ScalingStat + FlatDMG
```

- `ScalingStat` is the attacker's final ATK, HP or DEF (`HitSpec.scaling`).
- The ExtraMultiplier / FlatDMG terms are **[UNVERIFIED]**.
- Skill multipliers are **always caller-supplied**. The engine contains none.

## Stats

```
FinalATK = (CharacterBaseATK + LightConeBaseATK) × (1 + ΣATK%) + ΣflatATK
```

HP works the same way. SPD uses the character base only. **[UNVERIFIED]** that LC base is summed before applying %, although this is standard community knowledge.

An ally's own DEF uses the same pool as the target DEF formula: `base × max(0, 1 + DEF% − DEFreduction) + flat`.

## Base CRIT

Defaults are CRIT Rate 5% and CRIT DMG 50% for every character, overridable via `CharacterBuild.baseCritRate/baseCritDmg`. **[UNVERIFIED]**

## CRIT

| Mode | Multiplier |
|---|---|
| `expected` | `1 + clamp(CR, 0, 1) × CD` |
| `crit` | `1 + CD` |
| `nonCrit` | `1` |
| `canCrit = false` | `1` |

- Clamping CR at 100% is **[UNVERIFIED]** as a game rule. It is mathematically required for an expected value.
- DoT cannot crit: `canCrit` defaults to `false` when the hit has the `dot` tag. **[UNVERIFIED]**. Callers can override this per hit.

## DMG Boost

```
DMGBoost = 1 + Σ dmgBoost   (all matching modifiers: elemental, all-type, ability-type)
```

All DMG% sources add together. **[UNVERIFIED]** (standard community knowledge).

## Weaken

```
Weaken = max(0, 1 − Σ weaken)   (read from the attacker)
```

The additive sum is **[UNVERIFIED]**. The floor at 0 is **[ENGINE]**.

## DEF

```
EnemyBaseDEF = 200 + 10 × EnemyLevel                         [UNVERIFIED]
TargetDEF    = max(0, BaseDEF × max(0, 1 + DEF% − DEFReduction − DEFIgnore) + flatDEF)
DEF          = 1 − TargetDEF / (TargetDEF + 200 + 10 × AttackerLevel)   [SOURCED: S1]
```

- The DEF floor at 0 is **[SOURCED]** S1.
- Combining DEF reduction (target-held) and DEF ignore (attacker-held) additively in one pool is **[UNVERIFIED]**.
- Example check: a Lv80 attacker against a Lv80 enemy with no modifiers gives `0.5`. This matches S2's statement that equal levels give a DEF multiplier of about 1/2.
- `EnemyConfig.baseDef` overrides the level formula.

## RES

```
RES = clamp(1 − (EnemyRES − ΣresPen − ΣresReduction), 0.1, 2.0)
```

- The linear form is **[SOURCED]** S2.
- Attacker RES PEN and target RES reduction combine additively: **[UNVERIFIED]**.
- **The clamp to [10%, 200%] is [UNVERIFIED].** S2 suggests that RES above 100% could drive the multiplier to 0, which contradicts the 10% floor. The bounds live in `RES_MULTIPLIER_MIN/MAX`, and this must be verified.
- Enemy RES values are **caller-supplied**. Missing elements default to 0 **[ENGINE]**.

## Vulnerability (DMG Taken)

```
Vulnerability = 1 + Σ vulnerability   (read from the target)
```

- Multiplicative with the other factors: **[SOURCED]** S2.
- Additive among sources: **[UNVERIFIED]**.
- **No cap is applied**, and whether the game has one is **[UNVERIFIED]**.

## Mitigation (DMG Reduction)

```
Mitigation = Π (1 − m_i)   (each dmgMitigation modifier on the target)
```

Each source multiplying separately is **[UNVERIFIED]**. This factor does not include the toughness multiplier, which is applied separately below.

## Toughness (Broken)

```
Broken = 1.0 if broken, else 0.9
```

**[SOURCED]** S2. The broken state is set manually via `setBroken` steps or `EnemyConfig.broken`. Toughness bars are not simulated.

## Action Value

```
AV = 10000 / SPD
```

**[UNVERIFIED]**. This is a utility only, and the rotation engine does not use it.

## Rounding

The engine never rounds. Whether the game floors intermediate or final values is **[UNVERIFIED]**. The UI should round only for display.

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
| **Total** | **4385.828571…** |

## Not covered in the MVP

Break DMG, Super Break DMG, and the break level multiplier table are not implemented. Neither are DoT snapshotting rules or stat-conversion buffs. See `KNOWN_LIMITATIONS.md`.
