# AGENTS.md — shared conventions (all coding agents)

HSR Team Damage Comparator: a React + TypeScript app that compares two teams' damage over manual rotations.

Start by reading `docs/SPEC.md` (the owner's requirements and open questions), `docs/ARCHITECTURE.md` (layers, module ownership), `docs/FORMULAS.md` and `docs/TASKS.md`.

## Commands (pnpm, Node ≥ 20)

```
pnpm install
pnpm test        # vitest run
pnpm typecheck   # tsc -b (engine is compiled WITHOUT DOM types)
pnpm lint        # oxlint
pnpm build       # tsc -b && vite build
pnpm check       # typecheck + test + lint — must pass before every commit
```

## Hard rules

1. **Do not edit files you don't own** (see ARCHITECTURE.md § Module ownership). Request engine changes in `docs/TASKS.md`.
2. **`src/engine` is framework-free.** It must not use React, DOM/browser globals, I/O, `Date.now()` or randomness. UI code imports the engine only via `src/engine/index.ts`.
3. **Do not invent game data or abilities.** No character stats, skill multipliers, light cone or relic values, or enemy RES from memory. Every game number comes from user input, or from `src/data` with a `source` citation.
4. **Document every unverified mechanic.** Tag it in `docs/FORMULAS.md` or `docs/KNOWN_LIMITATIONS.md`.
5. **The UI never re-implements formulas.** Display engine output only.
6. **Never commit a real game-account export**, or any UID or inventory data. Tests use hand-written synthetic fixtures.
7. **UI text is Traditional Chinese (Hong Kong)** and goes through `t()` (F11). Code, comments and docs stay in English.
8. Report actual command output. Never claim tests or the build passed without running them.

## Code conventions

- TypeScript `strict` with `noUncheckedIndexedAccess`. No `any`. Use `readonly` arrays in public types.
- Percentages are stored as fractions (`0.5` = 50%). Convert only at the UI boundary.
- Engine functions are pure and never mutate inputs. Return new objects.
- Never round inside the engine. Round only for display.
- Use named exports. React components are the exception and may be default-exported.
- Keep files small and focused. Comment the *why*, not the *what*.

## Testing conventions

- Use Vitest. Put engine tests in `src/engine/__tests__/*.test.ts` (node environment).
- UI tests go next to components or in `src/ui/__tests__`, with `// @vitest-environment jsdom`.
- Formula tests assert against **hand-computed** expected values. Show the arithmetic in a comment or constant.
- Test fixtures are synthetic and labelled `TEST FIXTURE — NOT GAME DATA`.
- Use `toBeCloseTo(x, 6+)` for floating-point results, and exact equality only when the result is exact.
- Every bug fix comes with a regression test.

## Git

- Use small commits with imperative subjects, e.g. `engine: add break damage formula`.
- Don't commit `dist/` or `node_modules/`.
