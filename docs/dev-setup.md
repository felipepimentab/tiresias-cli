# Development Setup

## 1. Install dependencies
```bash
bun install
```

## 2. Run locally (without global install)
Use local execution to avoid conflicts with Homebrew-installed binaries:
```bash
bun run cli --help
bun run cli doctor
```

## 3. Typical local workflow
1. Implement change under `src/`.
2. Run targeted tests first:
```bash
bun run test:file tests/<target>.test.ts
```
3. Run full validation:
```bash
bun run lint
bun run typecheck
bun run test
```
4. Update docs if command behavior changed.

## 4. Build binaries
```bash
bun run build:binaries
```

## 5. Versioning and releases
Version bump only:
```bash
bun run version:patch
```
Automated release:
```bash
bun run release:patch
```

Detailed release steps are in `docs/release-playbook.md`.

## 6. Common Failure Modes (and exact fixes)
1. `brew: command not found` on macOS
- Fix:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
Then restart shell and re-run `tiresias init`.

2. `west is required to continue but is still missing`
- Fix:
```bash
brew install west
```
Or use the official west install guide on non-macOS.

3. `nRF Connect SDK toolchain v3.0.1 not found`
- Fix:
```bash
nrfutil install toolchain-manager
nrfutil toolchain-manager install --ncs-version v3.0.1
```

4. `invalid west workspace (...)`
- Cause: missing `.west` directory.
- Fix: recreate workspace with `tiresias init` or run from the correct workspace root.

5. `tiresias-fw repository not found at <workspace>/tiresias-fw`
- Fix:
```bash
tiresias init --parent <parent-dir>
```
Or verify your `--workspace` path points to west root.

6. `boards path is not a git repository (...)`
- Fix:
```bash
git -C <boards-path> status
```
If it fails, re-clone boards:
```bash
git clone https://github.com/felipepimentab/tiresias-boards <boards-path>
```

7. `boards repository should be outside the west workspace`
- Fix: move boards to a sibling folder (for example `../boards`) and update config:
```bash
tiresias config set --boards-path ../boards
```

8. `Homebrew installation completed but brew is not yet available in PATH`
- Fix: restart your terminal session and run:
```bash
which brew
```
Then retry `tiresias init`.

9. `Failed to parse settings file (...)` during editor board-root integration
- Fix: validate your editor `settings.json` syntax (VS Code/Trae), then rerun `tiresias doctor`.
- Manual fallback tutorial:
`https://youtu.be/V_dVKgWKILM?si=UypFkBgh_aVOVuQG&t=2629`

10. `Working tree is not clean` when running release
- Fix:
```bash
git status
git add -A && git commit -m "..."
```
Then rerun `bun run release:patch`.
