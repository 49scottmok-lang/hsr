# Master Specification

## Original text (from the project owner, 2026-11-07, verbatim)

> 我要一個可以比較兩隊星穹鐵道隊伍傷害嘅網站，支援角色 Buff、光錐、星魂及技能循環。

English: *"I want a website that compares the damage of two Honkai: Star Rail teams, supporting character buffs, light cones, eidolons and skill rotations."*

## Requirements → design

| # | Requirement | Where it lives | Status |
|---|---|---|---|
| R1 | Website | Vite + React SPA (`src/ui`) | ✅ Done: F1–F9. Live at `https://49scottmok-lang.github.io/hsr/` (F12). |
| R2 | Compare the damage of two teams | `runRotation` per team plus `compareTeams`. Both teams share the same enemies and critMode (F1). | ✅ Engine done |
| R3 | Character buffs (角色 Buff) | `EffectDef`/`StatModifier` with conditions, durations and stacks. Applied by `apply` steps or as passives. | ✅ Engine done |
| R4 | Light cones (光錐) | `CharacterBuild.lightCone`: base stats, passive `effects`, and `superimposition` 1–5 (metadata). | ✅ Engine done. Effect values per superimposition are user/data-supplied. |
| R5 | Eidolons (星魂) | `CharacterBuild.eidolon` 0–6, plus `requires.minEidolon` on `EffectDef` and on each `ActionStep`. One kit definition and one rotation serve E0–E6. | ✅ Engine done 2026-11-07 |
| R6 | Skill rotation (技能循環) | Manual ordered `RotationEvent`s (`turn` / `extra`) with ordered steps. | ✅ Engine and editor (F5) done |
| R7 | Import the user's own account (decided 2026-11-07, Q1) | `src/import/` turns a Reliquary Archiver export into `CharacterBuild`s, using the stat tables in R8. The file picker is F10. | ✅ Done: I1–I3, F10 |
| R8 | Sourced stat tables (decided 2026-11-07, Q1) | `src/data/`: tabular game numbers only, each with a citation. Source decided in D8. | ✅ D1–D5 done 2026-11-07, including credits (D4, shown by F9) and zh-HK names (D5). Coverage is game build 4.6.0 (`KNOWN_LIMITATIONS.md`). |
| R9 | UI language: Traditional Chinese (Hong Kong) (decided 2026-11-07, Q2) | All UI strings in `zh-HK`, collected in one module so another language can be added later. | ✅ Done: F11 |
| R10 | Reachable and shareable by link (decided 2026-11-07, Q3) | Static deploy at a public URL, and a comparison encoded into the URL so it can be shared. | ✅ Done: F12 (GitHub Pages, D9), F13 |

## Interpretation decisions (until the owner says otherwise)

- **D1. The rotation is manual.** The user lists the order of actions. SPD/AV simulation is not required by the spec. An optional turn order helper (E6, 2026-11-08) can suggest the order of turns; the user still owns the event list. *Extended 2026-11-08 (owner request, D7):* an optional auto battle plays user-entered kits over that turn order and writes the event list, which stays editable.
- **D2. "Damage" means expected damage by default.** Crit and non-crit modes are also available.
- **D3. No game data is invented.** Character kits, light cone values and eidolon effects are user-entered, or come from `src/data` with citations. *Refined by D5.*
- **D4. Superimposition is a label.** The engine doesn't scale light cone values by S1–S5. The UI or data layer supplies the values for the chosen superimposition.

## Owner decisions (2026-11-07)

- **D5 (Q1). Account import plus a sourced stat table; kits are entered manually.** In v1:
  - **Imported** from the user's Reliquary Archiver export: owned characters, level, ascension, eidolon, unlocked traces, equipped light cone and superimposition, and relic set, slot, rarity, level, main stat name and substat values.
  - **Looked up** in sourced tables (R8): character and light cone base stats, relic main stat values, simple stat-only set bonuses, trace stat bonuses, and character element.
  - **Entered manually**, as before: skill multipliers, talents and conditional buffs, eidolon effects, 4-piece and conditional set effects, light cone passives, and enemies.
  - *Amended 2026-11-08 (owner: "do 匯入後自動填技能", D8):* Basic ATK, Skill and Ultimate **damage multipliers, Energy and skill points** may be pre-filled for the auto battle from source A's skill table, at the imported skill levels. Only what a strict parser reads from the game's own description is filled; everything else stays manual and is shown as a gap.
- **D6 (Q2). The UI language is Traditional Chinese (Hong Kong).** Code, docs and engine messages stay in English. The UI translates engine validation messages for display.
- **D7 (Q3). The site is reachable and shareable by link.** It is deployed as a static site at a public URL, and a comparison can be shared as a URL. *Interpretation of "部署 in link", to be confirmed. The hosting platform is not yet chosen; any static host works, because the app has no server.*
  - A shared link contains **only the scenario** (builds, effects, rotations, enemies). It never contains the account export, UID, or unequipped inventory.
- **D8 (Q5). Stat tables come from source A, cross-checked against source B.** A is `DimbreathBot/TurnBasedGameData`, the raw game tables, pinned to a commit (`74a7b96`, game build 4.6.0). B is `fribbels/hsr-optimizer` (MIT), pinned to `dd0c4af`, and is used only in tests to check A's numbers. Released content only. Details and the update procedure: `docs/DATA_SOURCES.md § Decision`.
- **D9 (Q4). Host on GitHub Pages**, deployed by GitHub Actions. The site is served from the repository sub-path, so the build needs Vite `base`. See F12. Repository: `49scottmok-lang/hsr` (decided 2026-11-07), so the site is `https://49scottmok-lang.github.io/hsr/` and `base` is `/hsr/`.

## Open questions

- ~~Q4. Hosting platform.~~ Answered 2026-11-07: see D9.
- ~~Q5. Which stat-table source to use.~~ Answered 2026-11-07: see D8.
