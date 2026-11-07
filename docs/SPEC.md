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

## Interpretation decisions (until the owner says otherwise)

- **D1. The rotation is manual.** The user lists the order of actions. SPD/AV simulation is not required by the spec (backlog E6/E9).
- **D2. "Damage" means expected damage by default.** Crit and non-crit modes are also available.
- **D3. No game data is invented.** Character kits, light cone values and eidolon effects are user-entered, or come from `src/data` with citations. *See open question Q1.*
- **D4. Superimposition is a label.** The engine doesn't scale light cone values by S1–S5. The UI or data layer supplies the values for the chosen superimposition.

## Open questions for the owner

- **Q1. Built-in game data.** Should the site ship a character, light cone and eidolon database, so that users pick from lists? The alternative is that users type every value in manually (the current design). A database needs a sourced data pipeline, for example datamined or MIT-licensed community data with attribution.
- **Q2. UI language.** Traditional Chinese (Hong Kong), English, or both?
- **Q3. Hosting.** Where will the site be deployed (e.g. GitHub Pages, Vercel)? Do comparisons need shareable links?
