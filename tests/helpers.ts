import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const REPO_ROOT = resolve(import.meta.dir, "..");

type RunCliOptions = {
  cwd?: string;
  env?: Record<string, string>;
};

export type RunCliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
};

export function runCli(args: string[], options: RunCliOptions = {}): RunCliResult {
  const proc = Bun.spawnSync({
    cmd: [process.execPath, "run", "src/index.ts", ...args],
    cwd: options.cwd ?? REPO_ROOT,
    env: {
      ...process.env,
      NO_COLOR: "1",
      ...options.env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = proc.stdout.toString();
  const stderr = proc.stderr.toString();
  return {
    exitCode: proc.exitCode,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
  };
}

export function makeTempDir(prefix = "tiresias-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeDir(path: string) {
  rmSync(path, { recursive: true, force: true });
}

export function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export function writeExecutable(path: string, content: string) {
  ensureDir(dirname(path));
  writeFileSync(path, content, { encoding: "utf8", mode: 0o755 });
}

export function readText(path: string) {
  return readFileSync(path, "utf8");
}

export function writeJson(path: string, value: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
