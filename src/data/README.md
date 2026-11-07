# src/data — curated game data

**This directory is intentionally empty.** The project ships no character, light cone, relic or enemy data yet.

Policy for adding data (owner: data curator, see `docs/ARCHITECTURE.md`):

1. Every record must have a `source` field: a URL or document reference, plus the game version and the date it was checked.
2. Only numbers that appear in the source can be entered. Do not interpolate, estimate, or "fill in" missing levels.
3. Records must use engine types (`CharacterBuild` parts, `EffectDef`, `EnemyConfig`) imported from `src/engine`.
4. Conditional or situational passives must say in `EffectDef.name` what condition the user is asserting is active.
5. Never move test fixtures from `src/engine/__tests__/fixtures.ts` into this directory. They are synthetic.
