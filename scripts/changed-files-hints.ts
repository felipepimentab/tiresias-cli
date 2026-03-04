#!/usr/bin/env bun

type Hint = {
  pattern: RegExp;
  tests: string[];
};

const HINTS: Hint[] = [
  { pattern: /^src\/commands\/doctor\.ts$/, tests: ["bun test tests/doctor.command.test.ts"] },
  { pattern: /^src\/commands\/init\.ts$/, tests: ["bun test tests/init.command.test.ts"] },
  { pattern: /^src\/commands\/update\.ts$/, tests: ["bun test tests/update.command.test.ts"] },
  { pattern: /^src\/commands\/config\.ts$/, tests: ["bun test tests/config.command.test.ts"] },
  {
    pattern: /^src\/lib\/editor-settings\.ts$/,
    tests: ["bun test tests/editor-settings.lib.test.ts"],
  },
  {
    pattern: /^src\/lib\/path-resolution\.ts$/,
    tests: ["bun test tests/path-resolution.lib.test.ts"],
  },
  { pattern: /^src\/index\.ts$/, tests: ["bun test tests/help.snapshot.test.ts"] },
  { pattern: /^README\.md$/, tests: ["bun run lint"] },
];

/**
 * Executes a command and returns trimmed stdout on success.
 * Returns empty string on failure because hints are best-effort only.
 */
function run(command: string, args: string[]) {
  const result = Bun.spawnSync({
    cmd: [command, ...args],
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  if (result.exitCode !== 0) {
    return "";
  }
  return result.stdout.toString().trim();
}

/**
 * Collects changed files relative to PR base when available, otherwise falls
 * back to the latest commit diff.
 */
function getChangedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    const diff = run("git", ["diff", "--name-only", `origin/${baseRef}...HEAD`]);
    if (diff) {
      return diff.split("\n").filter(Boolean);
    }
  }

  const fallback = run("git", ["diff", "--name-only", "HEAD~1...HEAD"]);
  if (!fallback) {
    return [];
  }
  return fallback.split("\n").filter(Boolean);
}

/**
 * Prints targeted test/lint suggestions for the currently changed files.
 */
function main() {
  const changedFiles = getChangedFiles();
  if (changedFiles.length === 0) {
    console.log("[ci-hints] No changed files detected.");
    return;
  }

  const suggested = new Set<string>();
  for (const file of changedFiles) {
    for (const hint of HINTS) {
      if (hint.pattern.test(file)) {
        for (const test of hint.tests) {
          suggested.add(test);
        }
      }
    }
  }

  if (suggested.size === 0) {
    console.log("[ci-hints] No targeted test hints. Run full suite: bun run test");
    return;
  }

  console.log("[ci-hints] Suggested targeted checks for changed files:");
  for (const command of suggested) {
    console.log(`- ${command}`);
  }
}

main();
