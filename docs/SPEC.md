# Master Specification

## Original text (from the project owner, 2026-11-07, verbatim)

> 我要一個可以比較兩隊星穹鐵道隊伍傷害嘅網站，支援角色 Buff、光錐、星魂及技能循環。

English: *"I want a website that compares the damage of two Honkai: Star Rail teams, supporting character buffs, light cones, eidolons and skill rotations."*

## Requirements → design

| # | Requirement | Where it lives | Status |
|---|---|---|---|
| R1 | Website | Vite + React SPA (`src/ui`) | Scaffolded. UI tasks F1–F9 are in `TASKS.md`. |
| R2 | Compare the damage of two teams | `runRotation` per team plus `compareTeams`. Both teams share the same enemies and critMode (F1). | ✅ Engine done |
| R3 | Character buffs (角色 Buff) | `EffectDef`/`StatModifier` with conditions, durations and stacks. Applied by `apply` steps or as passives. | ✅ Engine done |
| R4 | Light cones (光錐) | `CharacterBuild.lightCone`: base stats, passive `effects`, and `superimposition` 1–5 (metadata). | ✅ Engine done. Effect values per superimposition are user/data-supplied. |
| R5 | Eidolons (星魂) | `CharacterBuild.eidolon` 0–6, plus `requires.minEidolon` on `EffectDef` and on each `ActionStep`. One kit definition and one rotation serve E0–E6. | ✅ Engine done 2026-11-07 |
| R6 | Skill rotation (技能循環) | Manual ordered `RotationEvent`s (`turn` / `extra`) with ordered steps. | ✅ Engine done. Editor is F5. |
| R7 | Import the user's own account (decided 2026-11-07, Q1) | `src/import/` turns a Reliquary Archiver export into `CharacterBuild`s, using the stat tables in R8. The file picker is F10. | ⬜ Planned: I1–I3, F10 |
| R8 | Sourced stat tables (decided 2026-11-07, Q1) | `src/data/`: tabular game numbers only, each with a citation. | ⬜ Planned: D1–D4 |
| R9 | UI language: Traditional Chinese (Hong Kong) (decided 2026-11-07, Q2) | All UI strings in `zh-HK`, collected in one module so another language can be added later. | ⬜ Planned: F11 |
| R10 | Reachable and shareable by link (decided 2026-11-07, Q3) | Static deploy at a public URL, and a comparison encoded into the URL so it can be shared. | ⬜ Planned: F12, F13 |

## Interpretation decisions (until the owner says otherwise)

- **D1. The rotation is manual.** The user lists the order of actions. SPD/AV simulation is not required by the spec (backlog E6/E9).
- **D2. "Damage" means expected damage by default.** Crit and non-crit modes are also available.
- **D3. No game data is invented.** Character kits, light cone values and eidolon effects are user-entered, or come from `src/data` with citations. *Refined by D5.*
- **D4. Superimposition is a label.** The engine doesn't scale light cone values by S1–S5. The UI or data layer supplies the values for the chosen superimposition.

## Owner decisions (2026-11-07)

- **D5 (Q1). Account import plus a sourced stat table; kits are entered manually.** In v1:
  - **Imported** from the user's Reliquary Archiver export: owned characters, level, ascension, eidolon, unlocked traces, equipped light cone and superimposition, and relic set, slot, rarity, level, main stat name and substat values.
  - **Looked up** in sourced tables (R8): character and light cone base stats, relic main stat values, simple stat-only set bonuses, trace stat bonuses, and character element.
  - **Entered manually**, as before: skill multipliers, talents and conditional buffs, eidolon effects, 4-piece and conditional set effects, light cone passives, and enemies.
- **D6 (Q2). The UI language is Traditional Chinese (Hong Kong).** Code, docs and engine messages stay in English. The UI translates engine validation messages for display.
- **D7 (Q3). The site is reachable and shareable by link.** It is deployed as a static site at a public URL, and a comparison can be shared as a URL. *Interpretation of "部署 in link", to be confirmed. The hosting platform is not yet chosen; any static host works, because the app has no server.*
  - A shared link contains **only the scenario** (builds, effects, rotations, enemies). It never contains the account export, UID, or unequipped inventory.

## Open questions

- **Q4. Hosting platform**, e.g. GitHub Pages, Vercel or Cloudflare Pages. This only matters for F12.
- **Q5. Which stat-table source to use**, once D1 has listed the candidates and their licences.
