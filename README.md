# tiresias-cli
CLI helper focused on validating development environment setup for Tiresias Firmware.

## Install Locally

### Prerequisites

- Bun installed: [https://bun.sh](https://bun.sh)
- On macOS, recommended install method: `brew install bun`
- macOS or Linux shell (`zsh`/`bash`)

### Option 1: One-command install script (recommended)

From the project root:

```bash
bun run install:local
```

This script will:
- install dependencies (`bun install`)
- link the CLI globally (`bun link`)
- remind you to add `~/.bun/bin` to your `PATH` if needed

### Option 2: Manual install

From the project root:

```bash
bun install
bun link
```

If `tiresias` is not found after linking, add this to your shell config (`~/.zshrc` or `~/.bashrc`):

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

Reload shell config:

```bash
source ~/.zshrc  # or source ~/.bashrc
```

Verify:

```bash
tiresias --help
```

## Run

After installation/linking:

```bash
tiresias --help
tiresias init --help
tiresias config show
tiresias doctor
tiresias update
```

Local development (without global link):

```bash
bun run cli --help
bun run cli init --help
bun run cli config show
bun run cli doctor
bun run cli update
```

## Build Binaries

Build all standalone executables:

```bash
bun run build:binaries
```

Generated artifacts:
- `dist/tiresias-macos`
- `dist/tiresias-linux`
- `dist/tiresias-win.exe`

## Versioning and Releases

This project aligns:
- `package.json` version
- git tag (`vX.Y.Z`)
- GitHub release (`vX.Y.Z`)

Version bump only (updates `package.json`):

```bash
bun run version:patch
bun run version:minor
bun run version:major
```

Full release automation (recommended):

```bash
bun run release:patch
bun run release:minor
bun run release:major
```

`release:*` does all steps automatically:
1. Verifies clean git working tree on `main`
2. Increments `package.json` version
3. Commits and tags (`vX.Y.Z`)
4. Builds all 3 binaries
5. Pushes `main` and tag to `origin`
6. Creates GitHub release and uploads binaries

Prerequisite for release publishing:
- GitHub CLI installed and authenticated (`gh auth login`)

## Commands

- `init`: creates the Tiresias west workspace, clones `tiresias-boards` in the same parent directory, and persists both paths in CLI config
- `config`: persists and shows global CLI config (workspace and boards paths)
- `doctor`: checks host tools (including nRF Connect for Desktop and NCS toolchain v3.0.1), west workspace, and boards repository location (offers automatic install/clone prompts when missing)
- `update`: runs `git pull` in `<workspace>/tiresias-fw` and `tiresias-boards`

## Tiresias FW Onboarding

The intended workflow is:

1. Initialize both repositories in one command:

```bash
tiresias init --parent . --workspace-name tiresias-workspace --boards-name tiresias-boards
```

> [!TIP]
> The west workspace download can take a few minutes and use up to ~6 GB of disk space.

This creates:
- `./tiresias-workspace` (west workspace with `tiresias-fw`)
- `./tiresias-boards` (boards repo, outside workspace)

It also automatically saves these paths in `~/.config/tiresias-cli/config.json`.

2. Add the boards path in the **nRF Connect for VS Code** extension UI as an extra board root.

Reference tutorial: [How to add board roots in NCS extension](https://youtu.be/V_dVKgWKILM?si=UypFkBgh_aVOVuQG&t=2629)

3. Run doctor with explicit paths:

```bash
tiresias doctor --workspace ./tiresias-workspace --boards-path ./tiresias-boards
```

Because `init` persists config automatically, you can now run:

```bash
tiresias config show
tiresias doctor
```

You can still set environment variables to override defaults:

```bash
export TIRESIAS_WORKSPACE="$HOME/path/to/tiresias-workspace"
export TIRESIAS_BOARDS_PATH="$HOME/path/to/tiresias-boards"
tiresias doctor
```

Manually persist values globally (only needed to change existing config):

```bash
tiresias config set --workspace ./tiresias-workspace --boards-path ./tiresias-boards
tiresias config show
```

The doctor command expects boards to be outside the west workspace.

Resolution precedence for workspace/boards paths:
1. CLI flags (`--workspace`, `--boards-path`)
2. Environment variables (`TIRESIAS_WORKSPACE`, `TIRESIAS_BOARDS_PATH`)
3. Persisted config file (`~/.config/tiresias-cli/config.json`)
4. Automatic detection/defaults

Update both repositories:

```bash
tiresias update --workspace ./tiresias-workspace --boards-path ./tiresias-boards
```

## Example

```bash
tiresias doctor
```
