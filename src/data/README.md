# src/data — curated game data

**This directory is intentionally empty for now.** Stat tables arrive with tasks D1–D4 in `docs/TASKS.md`, and only after the source has been chosen (D1). Kit logic never goes here: see SPEC D5.

Policy for adding data (owner: engine owner, see `docs/ARCHITECTURE.md`):

1. Every record must have a `source` field: a URL or document reference, plus the game version and the date it was checked.
2. Only numbers that appear in the source can be entered. Do not interpolate, estimate, or "fill in" missing levels.
3. Records must use engine types (`CharacterBuild` parts, `EffectDef`, `EnemyConfig`) imported from `src/engine`.
4. Conditional or situational passives must say in `EffectDef.name` what condition the user is asserting is active.
5. Never commit a real account export (Reliquary Archiver or any other tool). They contain the player's UID and inventory.
6. Never move test fixtures from `src/engine/__tests__/fixtures.ts` into this directory. They are synthetic.
