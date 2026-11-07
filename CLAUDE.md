# CLAUDE.md

@AGENTS.md

## Claude-specific notes

- Claude's role is lead architect and **engine owner** (`src/engine/**`, `docs/ARCHITECTURE.md`, `docs/FORMULAS.md`, root config).
- Before changing any exported engine type or function, check `docs/TASKS.md § Engine change requests`, and update `docs/ARCHITECTURE.md` if the public API changes.
- When adding a formula, add its section to `docs/FORMULAS.md` with a verification tag ([SOURCED] / [CROSS-CHECKED] / [UNVERIFIED] / [ENGINE]) and a hand-computed test.
- Leave the UI unpolished until the frontend tasks in `docs/TASKS.md` are done.
