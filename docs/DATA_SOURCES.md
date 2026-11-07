# Stat-table source candidates (task D1)

This page answers TASKS D1 and gives the owner what they need to decide **SPEC Q5**. It lists candidate sources for the `src/data` stat tables (D3), with their licences and how often they update. Everything was checked on **2026-11-07** by reading each repository through the GitHub API and raw files. **No game numbers are added to `src/data` until Q5 is decided.** The few numbers on this page are only there as evidence when comparing sources.

## What D3 needs

| Table | Needed for |
|---|---|
| Character element and base HP/ATK/DEF/SPD for every level and ascension | I2 builds from an account export (any level, not just 80) |
| Light cone base HP/ATK/DEF for every level and ascension | I2 |
| Relic main stat value by slot, stat, rarity and level | I2 (the export gives the main stat name but not its value) |
| Unconditional 2-piece set stat bonuses | I2 `setEffects` |
| Trace stat bonuses (`stat_1`–`stat_10`) | I2 `traces` |

## Candidates

| | **A. DimbreathBot/TurnBasedGameData** | **B. fribbels/hsr-optimizer** `src/data/*.json` | **C. Mar-7th/StarRailRes** `index_new/` | **D. EnkaNetwork/API-docs** `store/hsr/honker_meta.json` |
|---|---|---|---|---|
| What it is | Raw datamined game tables (`ExcelOutput/*.json`) | Processed data files bundled with the optimizer | Processed index files for bots | Processed metadata for Enka profile cards |
| Licence | **No licence file.** The README asks for credit: "a thanks in some credits page would be heavily appreciated". | **MIT** (whole repo) | **AGPL-3.0** | **No licence file** |
| Upstream | The game client | The README credits "Dim - for providing the data files", i.e. A's maintainer | The README names `Dimbreath/StarRailData`, A's predecessor | Not stated |
| Update cadence | One commit per game build. Last commit `74a7b96` on 2026-10-19 (`OSPRODWin4.6.0_…`). | Every patch. `game_data.json` was last changed by `dd0c4af` on 2026-10-17 ("4.7v3"). It includes beta content flagged `unreleased` (1 character and 2 light cones). | Last push 2026-09-29 | **Stale.** The last commit, `671049b` (2025-12-17), is titled "HSR 3.8 [deprecated]". |
| Character base stats | ✅ `AvatarPromotionConfig`: per ascension, `Base` + `Add` | ⚠️ **Level 80 only** (`stats.HP` etc.), not per level | ✅ `character_promotions.json`: per ascension, `base` + `step` | ✅ per ascension (stale) |
| Light cone base stats | ✅ `EquipmentPromotionConfig` | ⚠️ Level 80 only | ✅ `light_cone_promotions.json` | ✅ (stale) |
| Relic main stats | ✅ `RelicMainAffixConfig`: `BaseValue` + `LevelAdd` per group | ✅ `relic_main_affixes.json`, the same `base`/`step` values | ✅ `relic_main_affixs.json` | ✅ (stale) |
| 2-piece set bonuses | ✅ `RelicSetSkillConfig.PropertyList`, but its field names are **obfuscated** (e.g. `FODBMMCKAEN`) and may change between builds | ❌ Description text only | ✅ `relic_sets.json` | ✅ `relic.setSkill` (stale) |
| Trace stat bonuses | ✅ `AvatarSkillTreeConfig`, which is 4.4 MB | ✅ `traceTree` with stat and value | ✅ `character_skill_trees.json` | ✅ `tree` (stale) |
| Format stability | Low. These are raw dumps, and some keys are obfuscated. | High. It uses readable keys. | High | — |

Other sources were looked at and set aside:

- `Dimbreath/StarRailData`: the GitHub API returns "Repository access blocked", so it can't be used or cited. A is its successor.
- Web APIs and sites such as Hakush.in, Project Yatta and starrailstation.com: they don't offer a citable versioned repository or a licence, and the app has no server and makes no runtime requests. `henriquenakagawa/hsr-data`, a starrailstation scrape, was last pushed in 2023.

## Cross-check performed

The per-level formula `stat(level) = Base[ascension] + Add × (level − 1)`, applied to source A's last ascension, reproduces source B's level-80 values exactly:

| Item | A: Base + Add × 79 | B: level 80 |
|---|---|---|
| Character 1001, HP / ATK / DEF | 1058.4 / 511.56 / 573.3 | 1058.4 / 511.56 / 573.3 |
| Light cone 20000, HP / ATK / DEF | 846.72 / 317.52 / 264.6 | 846.72 / 317.52 / 264.6 |

Source C stores the same `base`/`step` pairs as A (character 1001, ascension 0: HP 144 / 7.2, ATK 69.6 / 3.48). The relic main-stat `BaseValue`/`LevelAdd` pairs are identical in A, B and D (e.g. group 21, `HPDelta`: 45.1584 / 15.80544).

This means the `(level − 1)` form is **[CROSS-CHECKED]** against R1 (Fribbels) for level 80 only. Relic main stats use `BaseValue + LevelAdd × level`, which is still **[UNVERIFIED]** until D3 checks it against B's formula code.

## Considerations for the owner

1. **Who owns the numbers.** In every candidate, the underlying numbers are HoYoverse game data. A repository's licence covers the repository's own work (code, structure); it cannot grant rights to the game data itself. Using datamined stats with a credit line is common practice for fan tools, but **this is not legal advice**.
2. **AGPL-3.0 (C).** Bundling C's files into a publicly deployed app (R10) would likely bring AGPL obligations with it. This repository has no `LICENSE` file yet. Using C only as a cross-check reference, without copying from it, avoids this.
3. **"No interpolation" (TASKS D3).** None of the sources lists a value for every level. They all store each ascension's base and a per-level increment. Computing the value for a given level from those two numbers is how the data is meant to be read; it isn't interpolating between listed values. The formula has been cross-checked at level 80 (see above). D3 should record it in `FORMULAS.md` and test it at more levels against B's code.
4. **Beta data.** B includes unreleased content. D3 must drop `unreleased: true` entries so the app only cites released data.

## Recommendation

**Primary source: A (`DimbreathBot/TurnBasedGameData`), pinned to a commit.** It is the only candidate that is raw, current, has per-level data for every D3 table, and is the shared upstream of B and C. A small, pure generator script would pull only the D3 tables into `src/data`. Each record would cite the file, the commit SHA and the game build string (`OSPRODWin4.6.0_…`). The app would credit Dimbreath, as the README asks (D4).

**Cross-check reference: B (Fribbels, MIT).** D3's tests would assert that the level-80 values and relic `base`/`step` values match B at a recorded commit. This is the same R1 that FORMULAS.md already uses.

**Not recommended:** C, because of the AGPL issue (it may still be read for comparison), and D, because it is deprecated and stale.

**Fallback, if the owner prefers a source with a licence over a raw dump:** B as the primary source, with character and light cone base stats rebuilt per level from A. B alone only covers level 80, which isn't enough for I2.

## Still open for D3 (after Q5)

- Confirm which `RelicMainAffixConfig` `GroupID` maps to which rarity and slot, and check the flat-vs-percent warning in `IMPORT_FORMAT.md` against it.
- Map the obfuscated `RelicSetSkillConfig.PropertyList` keys, or take 2-piece stat values from B's or A's set skill text, whichever can be cited reliably.
- Record the exact commit SHAs in `src/data` and in the D4 credits.
