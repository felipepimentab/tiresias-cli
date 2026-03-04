#!/usr/bin/env bun

import { existsSync } from "node:fs";

type BumpType = "patch" | "minor" | "major";
type Mode = "version" | "release";

type PackageJson = {
  version: string;
  [key: string]: unknown;
};

const ARTIFACTS = ["dist/tiresias-macos", "dist/tiresias-linux", "dist/tiresias-win.exe"];

async function main() {
  const [, , modeArg, bumpArg] = Bun.argv;
  const mode = parseMode(modeArg);
  const bump = parseBump(bumpArg);

  ensureCommand("git");
  if (mode === "release") {
    ensureCommand("gh");
  }

  assertCleanWorkingTree();
  assertOnMainBranch();

  const pkg = await readPackageJson();
  const nextVersion = incrementVersion(pkg.version, bump);

  pkg.version = nextVersion;
  await Bun.write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  log(`Version updated: ${nextVersion}`);

  if (mode === "version") {
    return;
  }

  const tag = `v${nextVersion}`;

  run("git", ["add", "package.json"]);
  run("git", ["commit", "-m", `chore(release): ${tag}`]);
  run("git", ["tag", tag]);

  run("bun", ["run", "build:binaries"]);
  assertArtifactsExist();

  run("git", ["push", "origin", "main"]);
  run("git", ["push", "origin", tag]);

  run("gh", ["release", "create", tag, ...ARTIFACTS, "--title", tag, "--generate-notes"]);

  log(`Release published: ${tag}`);
}

function parseMode(value: string | undefined): Mode {
  if (value === "version" || value === "release") {
    return value;
  }

  fail("Usage: bun run scripts/release.ts <version|release> <patch|minor|major>");
}

function parseBump(value: string | undefined): BumpType {
  if (value === "patch" || value === "minor" || value === "major") {
    return value;
  }

  fail("Usage: bun run scripts/release.ts <version|release> <patch|minor|major>");
}

function ensureCommand(command: string) {
  if (!Bun.which(command)) {
    fail(`Required command not found in PATH: ${command}`);
  }
}

function assertCleanWorkingTree() {
  const status = run("git", ["status", "--porcelain"], { quiet: true });
  if (status.length > 0) {
    fail("Working tree is not clean. Commit or stash changes before releasing.");
  }
}

function assertOnMainBranch() {
  const branch = run("git", ["branch", "--show-current"], { quiet: true }).trim();
  if (branch !== "main") {
    fail(`Release must run on main branch. Current branch: ${branch || "<detached>"}`);
  }
}

async function readPackageJson(): Promise<PackageJson> {
  const text = await Bun.file("package.json").text();
  return JSON.parse(text) as PackageJson;
}

function incrementVersion(version: string, bump: BumpType): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    fail(`Invalid semver version in package.json: ${version}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (bump === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function assertArtifactsExist() {
  for (const artifact of ARTIFACTS) {
    if (!existsSync(artifact)) {
      fail(`Expected build artifact not found: ${artifact}`);
    }
  }
}

function run(command: string, args: string[], options: { quiet?: boolean } = {}): string {
  const proc = Bun.spawnSync({
    cmd: [command, ...args],
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  const stdout = proc.stdout.toString();
  const stderr = proc.stderr.toString();

  if (!options.quiet) {
    if (stdout.trim().length > 0) {
      process.stdout.write(stdout);
    }
    if (stderr.trim().length > 0) {
      process.stderr.write(stderr);
    }
  }

  if (proc.exitCode !== 0) {
    fail(
      `Command failed (${proc.exitCode}): ${command} ${args.join(" ")}${
        stderr.trim() ? `\n${stderr.trim()}` : ""
      }`,
    );
  }

  return stdout;
}

function log(message: string) {
  console.log(`[release] ${message}`);
}

function fail(message: string): never {
  console.error(`[release] ${message}`);
  process.exit(1);
}

await main();
