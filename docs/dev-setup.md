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
