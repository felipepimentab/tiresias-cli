# AGENTS: Tiresias CLI

## Project Purpose
`tiresias-cli` is a Bun + TypeScript command-line helper for onboarding and validating development environments used by the Tiresias firmware project (`tiresias-fw`) and its custom board definitions (`tiresias-boards` repository cloned locally as `boards`).

Main goals:
- initialize local workspace layout quickly (`init`)
- validate toolchain and repository layout (`doctor`)
- persist and inspect path configuration (`config`)
- update both repositories (`update`)

## Architecture Map
Source layout:
- `src/index.ts`: CLI entrypoint, command registration.
- `src/commands/*.ts`: user-facing command implementations.
- `src/checks/*.ts`: extracted check flows (tool checks, workspace checks, editor integration).
- `src/lib/constants.ts`: centralized URLs, names, environment variable names, defaults.
- `src/lib/config.ts`: config file read/write with Zod schema validation.
- `src/lib/path-resolution.ts`: workspace/boards precedence resolution and source reporting.
- `src/lib/prompts.ts`: deterministic shared yes/no prompts and non-interactive fallback behavior.
- `src/lib/editor-settings.ts`: VS Code/Trae detection and board roots settings updates.
- `src/lib/exec.ts`: subprocess execution helper.
- `src/lib/logger.ts`: user-facing logging primitives.

## Key Commands
Development:
- `bun install`
- `bun run cli --help`
- `bun run cli doctor`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run test:file tests/doctor.command.test.ts`

Build/release:
- `bun run build:binaries`
- `bun run version:patch|minor|major`
- `bun run release:patch|minor|major`

## Config Location
Persisted config file:
- default: `~/.config/tiresias-cli/config.json`
- override config root with `XDG_CONFIG_HOME`

Config keys:
- `workspacePath`
- `boardsPath`

Path resolution precedence:
1. CLI flags
2. environment variables
3. persisted config
4. command-specific default/auto-detection

## Commit and Release Conventions
- Branches: use `main` for releases and stable history.
- Conventional commit style is preferred (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Release tags: `vX.Y.Z`.
- Release source of truth: `package.json` version.
- `bun run release:*` performs:
  1. clean tree + `main` checks
  2. version bump
  3. release commit + tag
  4. binary builds (macOS/Linux/Windows)
  5. push branch + tag
  6. GitHub release creation with artifacts

## Safe To Edit
- `src/commands/*.ts` for behavior changes.
- `src/lib/*.ts` for shared logic.
- `tests/*.ts` for regression coverage.
- `README.md`, `docs/*.md`, `CONTRIBUTING.md`, this file.
- `.github/workflows/ci.yml` for CI checks.

## High Risk Files
- `scripts/release.ts`: affects tags/releases/publishing.
- `src/lib/config.ts`: config schema and compatibility.
- `src/lib/path-resolution.ts`: path precedence behavior across commands.
- `src/lib/editor-settings.ts`: user editor settings mutation logic.
- `package.json` scripts and version fields.

When editing high-risk files, always run:
- `bun run typecheck`
- `bun run test`
