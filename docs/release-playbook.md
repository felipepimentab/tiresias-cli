# Release Playbook

## Preconditions
- clean working tree
- current branch is `main`
- `gh` authenticated (`gh auth login`)

## Automated Flow
Recommended:
```bash
bun run release:patch
```

Equivalent options:
- `bun run release:minor`
- `bun run release:major`

## What the Script Does
`scripts/release.ts` (mode `release`) performs:
1. verify required commands (`git`, `gh`)
2. assert clean git tree
3. assert branch is `main`
4. increment `package.json` semver
5. commit `package.json` as `chore(release): vX.Y.Z`
6. create git tag `vX.Y.Z`
7. build binaries:
   - `dist/tiresias-macos`
   - `dist/tiresias-linux`
   - `dist/tiresias-win.exe`
8. push `main` and tag
9. create GitHub release and upload artifacts

## Version-only Flow
To update `package.json` version without tag/release:
```bash
bun run version:patch
```

## Recovery Notes
- If release fails after version bump, reset only the unintended change before retrying.
- Re-run from a clean tree.
