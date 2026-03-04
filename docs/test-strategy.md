# Test Strategy

## Goals
- keep command behavior deterministic
- validate path precedence and edge cases
- avoid real host/environment dependencies

## Test Layout
- `tests/config.command.test.ts`
- `tests/init.command.test.ts`
- `tests/doctor.command.test.ts`
- `tests/update.command.test.ts`
- `tests/path-resolution.lib.test.ts`
- `tests/editor-settings.lib.test.ts`
- `tests/help.snapshot.test.ts`

Command tests mirror `src/commands/*.ts`.

## Running Specific Tests
Run one file:
```bash
bun run test:file tests/doctor.command.test.ts
```

Run all:
```bash
bun run test
```

## Mocking Strategy
Use fake executables written into a temporary `bin` directory and prepend it to `PATH`.

Pattern:
1. Create temp dir.
2. Write shell scripts for `git`, `west`, `nrfutil`, etc.
3. Capture invocation logs in temp files.
4. Assert behavior from logs + CLI output.

No external network calls are required during tests.

## Non-interactive Prompt Behavior
Prompt behavior is intentionally deterministic:
- if terminal is non-interactive, prompts are skipped and default to `No`.
- commands must continue safely with clear warning messages.

Tests should assert this message and resulting control flow.

## Snapshot Coverage
`tests/help.snapshot.test.ts` compares CLI help output to fixture snapshots in `tests/snapshots/`.
Update snapshots intentionally when command surface changes.

## Table-driven Tests
Use table-driven tests for:
- path precedence resolution
- editor settings path detection by OS
