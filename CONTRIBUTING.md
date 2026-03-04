# Contributing

## Prerequisites
- Bun `>=1.3.x`
- Git

## Local Setup
```bash
bun install
bun run typecheck
bun run test
```

## Development Checklist
1. Implement change in `src/`.
2. Add/adjust tests in `tests/`.
3. Update docs (`README.md` and `docs/*`) for behavior or UX changes.
4. Run:
```bash
bun run lint
bun run typecheck
bun run test
```
5. Commit with a clear conventional message.

## Commit Granularity Policy
Prefer one concern per commit so review and revert are safe.

Good examples:
- `feat(doctor): add --json report output`
- `test(doctor): add golden fixture for --json`
- `docs(cli): document path precedence`

Anti-patterns:
- mixing unrelated refactors + features + docs in one commit
- committing generated artifacts with behavior changes unless required
- renaming/moving files and changing logic in the same commit without clear reason

Rule of thumb:
- if a reviewer cannot summarize the commit in one sentence, split it.

## How To Add a Command
1. Create `src/commands/<name>.ts`.
2. Register it in `src/index.ts`.
3. Use shared libs:
   - `src/lib/constants.ts` for URLs/names/defaults.
   - `src/lib/path-resolution.ts` for workspace/boards resolution.
   - `src/lib/prompts.ts` for deterministic `[Y/n]` prompts.
   - `src/lib/config.ts` for persisted config access.
4. Add tests in `tests/<name>.command.test.ts`.
5. Add help snapshot updates in `tests/help.snapshot.test.ts` fixtures if output changed.
6. Update `docs/cli-spec.md` command contract.

## Testing Guidelines
- Prefer deterministic tests with fake executables in temp `bin` directories.
- Avoid external network/tool dependencies in tests.
- Validate both success and failure modes.
- Validate non-interactive prompt behavior.

## Optional Pre-commit Hooks
To run `lint` and `typecheck` before each local commit:

```bash
bun run hooks:install
```

To disable:

```bash
bun run hooks:uninstall
```

## Release
See `docs/release-playbook.md`.
