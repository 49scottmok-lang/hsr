# Reliquary Archiver export format (observed)

This page documents the structure of a Reliquary Archiver export as observed on 2026-11-07, from a file the project owner supplied: `source: "reliquary_archiver"`, `build: "0.19.0"`, `version: 4`.

- It describes **structure only**. No values from the owner's account are recorded here, and the real export must never be committed.
- The format is defined by the Reliquary Archiver tool (`github.com/IceDynamix/reliquary-archiver`), not by this project. Re-check this page against the tool whenever `version` changes.

## Top level

| Key | Type | Use in v1 |
|---|---|---|
| `source` | `"reliquary_archiver"` | Must match, or reject the file |
| `build` | tool version string | Show in the import report |
| `version` | number (`4` observed) | Must be a supported version, or reject the file |
| `metadata` | `{ uid, trailblazer }` | **Drop `uid` immediately (personal).** `trailblazer` is a name variant only. |
| `gacha` | `{ stellar_jade, oneric_shards }` | Ignore and drop |
| `materials` | `{ id, name, count }[]` | Ignore and drop |
| `light_cones` | array | See below |
| `relics` | array | See below |
| `characters` | array | See below |

## `characters[]`

| Key | Notes |
|---|---|
| `id` | Game character ID (string). Join key to the D3 tables and to `light_cones[].location` / `relics[].location`. |
| `name`, `path` | Display only. `path` is the 命途 (Path), **not** the element: the element comes from D3. Observed values: Abundance, Destruction, Elation, Erudition, Harmony, Hunt, Nihility, Preservation, Remembrance. |
| `level`, `ascension` | Used to look up base stats in D3. |
| `eidolon` | 0–6, maps to `CharacterBuild.eidolon`. |
| `skills` | `{ basic, skill, ult, talent, elation? }` skill levels. Shown to the user, because v1 kit multipliers are entered manually. |
| `traces` | `{ ability_1..3, stat_1..10, special }` booleans. Unlocked `stat_N` traces map to D3 trace bonuses. |
| `memosprite` | optional `{ skill, talent }` levels. Display only in v1. |
| `ability_version` | Unknown meaning. Ignore. |

## `light_cones[]`

| Key | Notes |
|---|---|
| `id`, `name` | Join to D3 light cone base stats. |
| `level`, `ascension` | Used to look up base stats. |
| `superimposition` | 1–5, maps to `LightCone.superimposition`. |
| `location` | ID of the equipping character, or `""` if not equipped. |
| `lock`, `_uid` | Ignore. |

## `relics[]`

| Key | Notes |
|---|---|
| `set_id`, `name` | Set ID and name. Count the equipped pieces per set to decide 2-piece and 4-piece bonuses. |
| `slot` | `Head` · `Hands` · `Body` · `Feet` · `Planar Sphere` · `Link Rope` |
| `rarity`, `level` | Rarity 4 or 5 was observed. Both are needed to look up the **main stat value** (D3). |
| `mainstat` | **Name only, no value.** Observed values: HP, ATK, DEF, SPD, CRIT Rate, CRIT DMG, Break Effect, Effect Hit Rate, Energy Regeneration Rate, Outgoing Healing Boost, and `<Element> DMG Boost` for all seven elements. |
| `substats[]` | `{ key, value, count, step }`. `value` is the **total** for that substat. |
| `preview_substats` | Optional. Same shape as `substats`. Meaning unconfirmed (possibly pending upgrades). **Ignore in v1.** |
| `location` | ID of the equipping character, or `""`. |
| `lock`, `discard`, `_uid` | Ignore. |

### Substat key map

A trailing `_` means a **percentage expressed in percent units**: `3.456` means 3.456%, so divide by 100 for the engine. A key without `_` is a flat value.

| Export key | Engine `StatModifier.stat` | Conversion |
|---|---|---|
| `HP` | `hpFlat` | as is |
| `HP_` | `hpPct` | ÷ 100 |
| `ATK` | `atkFlat` | as is |
| `ATK_` | `atkPct` | ÷ 100 |
| `DEF` | `defFlat` | as is |
| `DEF_` | `defPct` | ÷ 100 |
| `SPD` | `spdFlat` | as is |
| `CRIT Rate_` | `critRate` | ÷ 100 |
| `CRIT DMG_` | `critDmg` | ÷ 100 |
| `Break Effect_` | `breakEffect` | ÷ 100 |
| `Effect Hit Rate_` | `effectHitRate` | ÷ 100 |
| `Effect RES_` | `effectRes` | ÷ 100 |

### Main stat map

The value always comes from the D3 table, never from the export.

| `mainstat` | Engine stat | Notes |
|---|---|---|
| `HP` / `ATK` | `hpFlat` / `atkFlat` | Head / Hands. Flat. |
| `HP` / `ATK` / `DEF` | `hpPct` / `atkPct` / `defPct` | Body, Feet, Sphere, Rope. **Percentage on these slots.** The slot decides the meaning; confirm against D3. |
| `SPD` | `spdFlat` | |
| `CRIT Rate`, `CRIT DMG`, `Break Effect`, `Effect Hit Rate`, `Energy Regeneration Rate` | the matching stat key | |
| `<Element> DMG Boost` | `dmgBoost` with `condition.elements: [<element>]` | |
| `Outgoing Healing Boost` | (not modelled) | Report it as unsupported. |

> ⚠️ The HP/ATK/DEF flat-vs-percent mapping by slot is an inference from how the game works. It is **not stated by the export**, and must be confirmed against the D3 source before I2 ships.
