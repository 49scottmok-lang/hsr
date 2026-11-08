# Stat-table sources (task D1)

## Decision (SPEC Q5, owner, 2026-11-07)

**A is the source, B is the cross-check.** The owner confirmed the recommendation below.

| Role | Repository | Pinned commit | Version |
|---|---|---|---|
| **Source** of every number in `src/data/generated/` | `DimbreathBot/TurnBasedGameData` (A) | `74a7b96fba32f00cf495a5c00b0311bd02207aaf` (2026-10-19) | Game build `OSPRODWin4.6.0_D16854589_A16781679_L16781679`, recorded as `gameVersion: "4.6.0"` |
| **Cross-check** only (tests, nothing copied into the tables) | `fribbels/hsr-optimizer` (B), MIT | `dd0c4af98ea95ddde2abe38cb9a4443cc8b2f13d` (2026-10-17, "4.7v3") | `src/data/game_data.json`, `src/lib/relics/statCalculator.ts` |
| Export field names (`stat_N` anchors, main-stat names, relic rarity) | `IceDynamix/reliquary-archiver` | `5e50dcbf980afe77463f9ad357001f2afa3c66fb` (2026-09-29) | `src/export/fribbels/converters.rs`, `utils.rs` |

How the decision is applied (D2–D3):

- `scripts/data/extract.ts` fetches only the needed `ExcelOutput/*.json` files from A **at the pinned commit** and writes `src/data/generated/*.ts`. Every record carries `source` (repo, commit, files) and `gameVersion`. Re-running the script at the same commit gives the same output.
- **Released content only.** The generator keeps a record only if A marks it `Release: true` (characters, light cones, relic sets). The cross-check test then fails if B flags any kept record `unreleased: true`. At the pinned commits nothing is dropped and the test passes: B's unreleased entries (character 1511, light cones 22009 and 23065) are not in A.
- **Coverage gap.** B lists four released characters that A's 4.6.0 build does not have: 1014, 1015, 1508, 1509. Importing them reports a table miss until A is re-pinned to a newer build.
- `scripts/data/crosscheck-b.ts` writes `src/data/__tests__/reference-b.json` from B at its pinned commit, and `crosscheck-b.test.ts` compares the tables with it (see "Cross-check performed").
- To update: change the commit constants in `scripts/data/extract.ts` (and B's in `crosscheck-b.ts`), re-run both scripts, run `pnpm check`, and update this table.

The rest of this page is the D1 comparison that led to the decision, kept as the record. It was checked on **2026-11-07** by reading each repository through the GitHub API and raw files.

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

## D3 results (2026-11-07)

The open points from D1 were settled as follows.

- **Main-stat groups.** Slot and rarity map to a group through A's `RelicConfig` (`Type`, `MaxLevel / 3`, `MainAffixGroup`, ordinary `BASIC` relics only). Each slot and rarity has exactly one group (21–26 for 2★ … 51–56 for 5★). The flat-vs-percent question is settled: Head and Hands groups hold only `HPDelta`/`AttackDelta` (flat), and the other slots hold only `…AddedRatio` (percent). Reliquary Archiver writes both as `"HP"`/`"ATK"` (`utils.rs@5e50dcb`), so the slot decides.
- **2-piece sets.** `PropertyList` entries are read by shape (one string = the property, one `{ Value }` = the value), so the obfuscated key names don't matter. 54 sets have a 2-piece `PropertyList`. The 8 sets whose 2-piece is ability-only are not tabulated.
- **Traces.** Export `stat_N` = A skill-tree anchor `Point(N + 8)` with `PointType 1`, per Reliquary Archiver `export_skill_tree` (`converters.rs@5e50dcb`). Every released character has exactly these ten anchors.
- **Commit SHAs** are in `src/data/generated/source.ts` and on every record. The D4 credits list is `DATA_CREDITS` in `src/data/credits.ts`; a test keeps its commits in step with the tables and the reference.

Generated tables: 94 characters, 170 light cones, 112 main-stat rows (24 groups), 54 two-piece bonuses, and 1040 stat traces (94 base trees and 10 enhanced trees). Re-running the generator against GitHub at the pinned commit reproduces them byte for byte.

Cross-check against B (`crosscheck-b.test.ts`, all passing):

| Check | Scope |
|---|---|
| Level-80 HP/ATK/DEF/SPD/CRIT | all 94 characters and 170 light cones |
| Main-stat `base`/`step` pairs | all 112 rows, exact equality with `relic_main_affixes.json` |
| Main stat at max level | 19 stats × rarity 2–5, against `statCalculator.ts` (3 decimals) |
| Trace stat and value | all 1040 traces, against `traceTree` (enhanced trees against B's `…b1` entries) |
| 2-piece value appears in B's set text | all 54 sets |
| Nothing B flags unreleased; known coverage gap | see Decision |
| Ultimate Energy cost (`energyCost`, A `SPNeed` vs B `max_sp`; added 2026-11-08 for D7) | all characters; one known difference: 1407 has `SPNeed` 0 in A (its Ultimate does not use Energy) and 120 in B. The table keeps A's 0, and the auto battle UI does not pre-fill a cost of 0 |

## Names (D5, 2026-11-07)

Display names in Traditional Chinese come from **source A at the same pinned commit**, so they always match the stat tables. They are the game's own 繁體中文 text, not translations of ours.

| Table | A files | Join |
|---|---|---|
| Paths (命途) | `AvatarBaseType` | `BaseTypeText.Hash` → `TextMap/TextMapCHT.json`. The row without an `ID` (通用) is skipped. |
| Characters | `AvatarConfig`, `MultiplePathAvatarConfig` | `AvatarName.Hash`; path from `AvatarBaseType`. |
| Light cones | `EquipmentConfig` | `EquipmentName.Hash`; path from `AvatarBaseType`. |
| Relic sets | `RelicSetConfig` | `SetName.Hash`. |

- **Text hashes are 64-bit integers.** `JSON.parse` would round them, so the generator quotes `"Hash"` values before parsing (`parseExcelJson`).
- **Markup.** The only markup in any name is `<unbreak>…</unbreak>` around "999" in 1506's name (銀狼LV.999). The generator removes that tag and fails on any other markup.
- **Trailblazer.** A's name for 8001–8010 is `{NICKNAME}`, the player's chosen name. The record has `name: null`, and its gender from `MultiplePathAvatarConfig` (`GENDER_MAN` / `GENDER_WOMAN`). The UI supplies its own label.
- **Shared names.** 1001 and 1224 are both 三月七 (存護 and 巡獵). The validator requires name + path to be unique.
- The same `Release: true` filter as the stat tables gives 94 characters, 170 light cones, 62 relic sets and 9 paths. Every stat-table record has a name (`names.test.ts`).

Cross-check against B's `public/locales/zh_TW/gameData.yaml` at `dd0c4af` (`crosscheck-b.test.ts`): every name and path name matches, except for these differences, each of which the test lists explicitly:

| Difference | Count | Which is right |
|---|---|---|
| B prefixes some characters with `⚰️ ` | 10 characters | A. The prefix is B's own marker. |
| B shows the Trailblazer's default names 穹 (male) / 星 (female) | 10 characters | Both. A has the nickname placeholder. The genders agree. |
| B's zh_TW file still has Simplified text | LC 23055 and sets 133 and 134 | A. It has the Traditional text. |

## Break DMG level multiplier (E4, 2026-11-07)

`breakLevelMultipliers` comes from source A's `ExcelOutput/AvatarBreakDamage.json` at the pinned commit: one `BreakBaseDamage` value per attacker level, for levels 1–100 and 120 (101 rows), copied exactly. `breakLevelMultiplier(tables, level)` returns only a listed level. The validator requires ascending levels and values that never decrease.

Cross-check against B (`crosscheck-b.test.ts`). B hard-codes the attacker at level 80:

| Check | Result |
|---|---|
| A's level-80 value against B's `3767.5533` in `damageCalculator.ts` | A has `3767.5535`. They agree to 3 decimals, a difference of 0.0002. |
| Element factors against B's `ElementToBreakScaling` (`calculateContext.ts`) | Equal for all 7 elements |
| Toughness units: B's `0.5 + T / 120` with T stored ×3 (`EnemyConfigurationsDrawer.tsx`, label `toughness / 3`) against the engine's `0.5 + T / 40` with T displayed | Equal |
| B's Super Break base `(3767.5533 / 10) × toughness` | Equal to the engine's `superBreakBaseDmg` |

Levels other than 80 have no second source (**[UNVERIFIED]**, `FORMULAS.md § Break DMG`).

## Artwork (F14, owner, 2026-11-08)

The owner chose to hotlink character portraits and element and path icons from **`Mar-7th/StarRailRes`** (AGPL-3.0), pinned to commit `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` (2026-09-29). The pin is `ARTWORK_COMMIT` in `src/data/credits.ts`, and the footer credits it.

- **Nothing is copied.** The browser loads each image from jsDelivr (`cdn.jsdelivr.net/gh/…@<commit>/`) and falls back to GitHub raw (`raw.githubusercontent.com/…/<commit>/`). This repository holds only URL patterns, so the AGPL concern in § Considerations (bundling C's files) doesn't arise. The images themselves are HoYoverse's, covered by the existing game-data notice.
- **Paths used:** `image/character_preview/<id>.png` (card art), `icon/character/<id>.png` (round avatar), `icon/element/<Element>.png` (Lightning is `Thunder`), `icon/path/<Path>.png`. The element and path file names come from the repo's `index_new/en/elements.json` and `paths.json`.
- **IDs:** artwork is keyed by the game character ID in `CharacterBuild.characterId`, which is display metadata. The account import sets it, and so does the editor's character picker. Builds whose unit ID is a game ID (older imports) also get artwork.
- **Fallback:** an element-coloured card with the name's first character, when a character has no ID or every host fails.
- **Re-pinning:** change `ARTWORK_COMMIT` after checking that a few `character_preview` URLs return 200 on both hosts.

## Skill kits (D8, owner request, 2026-11-08)

`SKILL_TABLES` (`src/data/generated/skillKits.ts`) comes from **source A at the same pinned commit**, generated by `scripts/data/skillsA.ts` as part of `pnpm data:extract`.

| Field | A files | Join |
|---|---|---|
| Slots and variants | `AvatarSkillTreeConfig` | anchors `Point01`–`Point03`, level-1 rows, `LevelUpSkillID`; the enhanced tree's point IDs start with an extra `1` |
| Multipliers, Energy, skill points, element, target shape | `AvatarSkillConfig` | `SkillID`, one row per level; `ParamList`, `SPBase`, `BPAdd`, `BPNeed`, `StanceDamageType`, `SkillEffect` |
| Which parameter is damage | `TextMapCHT` | `SkillDesc.Hash` → description template with `#k[i]` placeholders |
| Eidolon level bonuses | `AvatarConfig.RankIDList`, `AvatarRankConfig` | `SkillAddLevelList`, keyed by base-tree skill ID |

- The generator fails on any surprise: levels that are not 1..N, Energy or skill points that change with level, a normal Basic ATK / Skill / Ultimate with another `AttackType`, or a `#k` missing from `ParamList`.
- Result: 104 kits (94 base trees, 10 enhanced). Re-running the generator reproduces every earlier table byte for byte.
- **Cross-check against B.** B has no skill table; its per-character files hard-code the multipliers. Fourteen values from four characters and their eidolon slot groups are compared in `src/data/__tests__/kits.test.ts`, all equal. Coverage and parser rules: `FORMULAS.md § Skill kit templates`.

## Endgame enemies (D6, owner request, 2026-11-08)

`ENEMY_TABLES` (`src/data/enemies.ts`) comes from **source A at the same pinned commit**. `scripts/data/enemiesA.ts` generates it as part of `pnpm data:extract`.

| Table | A files | Join |
|---|---|---|
| Stages | `Challenge{,Story,Boss}GroupConfig`, `Challenge{,Story,Boss}MazeConfig`, `Challenge{,Story,Boss}MazeTierce`, `ScheduleDataChallenge{Maze,Story,Boss}`, `StageConfig` | group → `ScheduleDataID` (start date) → top floor → `EventIDList1/2` (nodes 1 and 2) and the third-node row → `StageID` (level, `HardLevelGroup`, `EliteGroup`, `MonsterList`) |
| Enemies | `MonsterConfig`, `MonsterTemplateConfig` | `MonsterTemplateID`; name from `MonsterName.Hash` in `TextMapCHT` |
| Scaling | `HardLevelGroup`, `EliteGroup` | the stage's group and level; the stage's and the variant's elite group |

- **Selection.** For Memory of Chaos (`memory`), Pure Fiction (`story`) and Apocalyptic Shadow (`boss`), the generator takes the 3 newest rotations that started on or before **2026-11-08 04:00** (`ENEMY_SELECTION` in `extract.ts`), top floor only, every node. The cutoff is a constant so the output is deterministic. It also drops rotations that the build contains but that had not started: 4.6.0 has AS 3022, an unnamed copy of 3021 starting 2026-11-16. Rotations without a schedule row (MoC 1034 and 1035) are skipped. **When re-pinning, move the cutoff forward.**
- **Third node.** `Challenge*MazeTierce` has obfuscated column names, so the generator reads it by shape: the row that contains both the group's `TierceID` and the top floor's ID, and that row's one list whose entries are all `Challenge` stage IDs. Only the newest rotations have one (here MoC 1033 and 1036, and all three PF and AS rotations).
- **Debuff RES.** The `DebuffResist` keys `STAT_DOT_Bleed`, `STAT_DOT_Burn`, `STAT_DOT_Electric` (Shock) and `STAT_DOT_Poison` map to the engine's DoT types. `STAT_DOT_Poison` is Wind Shear: its icon in `MonsterStatusResistanceType` is `IconImmuneWind.png`. Control and other debuff RES keys are dropped because the engine doesn't model them. An unknown key fails the generator.
- Result: 26 stages (9 rotations), 63 enemy variants, 3 level rows and 13 elite groups. Re-running the generator reproduces every earlier table byte for byte.
- **No second source.** B has no enemy data, and no other source was readable (`FORMULAS.md § Enemy stats`). Only DEF is cross-checked, against the engine's DEF formula.
