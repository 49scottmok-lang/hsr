# HSR Team Damage Comparator

This app compares the damage of two Honkai: Star Rail teams. Each team runs a user-defined manual rotation against the same enemy setup.

The calculation engine lives in `src/engine`. It is pure TypeScript and fully unit-tested. The UI in `src/ui` is still a placeholder.

```
pnpm install
pnpm check
pnpm dev
```

Docs:

- [Master specification](docs/SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Formulas](docs/FORMULAS.md)
- [Tasks](docs/TASKS.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Agent conventions](AGENTS.md)

The repository contains **no game data**. Every number is entered by the user.
