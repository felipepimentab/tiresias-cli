import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import {
  ensureDir,
  makeTempDir,
  readText,
  removeDir,
  runCli,
  writeExecutable,
  writeJson,
} from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    removeDir(tempDirs.pop() as string);
  }
});

function setupFakeGit(baseDir: string) {
  const binDir = resolve(baseDir, "bin");
  const gitLog = resolve(baseDir, "git.log");
  ensureDir(binDir);

  writeExecutable(
    resolve(binDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "$PWD :: $*" >> "\${GIT_LOG:?}"
exit 0
`,
  );

  return { binDir, gitLog };
}

describe("update command", () => {
  it("fails when <workspace>/tiresias-fw does not exist", () => {
    const root = makeTempDir("tiresias-update-missing-fw-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const boards = resolve(root, "boards");
    ensureDir(workspace);
    ensureDir(resolve(boards, ".git"));

    const result = runCli(["update", "--workspace", workspace, "--boards-path", boards], {
      env: { XDG_CONFIG_HOME: xdgConfigHome },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("tiresias-fw repository not found");
    expect(result.output).toContain("<workspace>/tiresias-fw");
  });

  it("fails when boards path is not a git repository", () => {
    const root = makeTempDir("tiresias-update-missing-boards-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const boards = resolve(root, "boards");
    ensureDir(resolve(workspace, "tiresias-fw", ".git"));
    ensureDir(boards);

    const result = runCli(["update", "--workspace", workspace, "--boards-path", boards], {
      env: { XDG_CONFIG_HOME: xdgConfigHome },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("boards path is not a git repository");
  });

  it("pulls both repositories in the expected directories", () => {
    const root = makeTempDir("tiresias-update-success-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const boards = resolve(root, "boards");
    ensureDir(resolve(workspace, "tiresias-fw", ".git"));
    ensureDir(resolve(boards, ".git"));

    const { binDir, gitLog } = setupFakeGit(root);
    const result = runCli(["update", "--workspace", workspace, "--boards-path", boards], {
      env: {
        XDG_CONFIG_HOME: xdgConfigHome,
        GIT_LOG: gitLog,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.exitCode).toBe(0);
    const calls = readText(gitLog);
    expect(calls).toContain(`${resolve(workspace, "tiresias-fw")} :: pull`);
    expect(calls).toContain(`${boards} :: pull`);
  });

  it("uses persisted config when flags are omitted", () => {
    const root = makeTempDir("tiresias-update-config-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const boards = resolve(root, "boards");
    ensureDir(resolve(workspace, "tiresias-fw", ".git"));
    ensureDir(resolve(boards, ".git"));
    writeJson(resolve(xdgConfigHome, "tiresias-cli", "config.json"), {
      workspacePath: workspace,
      boardsPath: boards,
    });

    const { binDir, gitLog } = setupFakeGit(root);
    const result = runCli(["update"], {
      env: {
        XDG_CONFIG_HOME: xdgConfigHome,
        GIT_LOG: gitLog,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("workspace path:");
    expect(result.output).toContain("source: persisted config");
    const calls = readText(gitLog);
    expect(calls).toContain(`${resolve(workspace, "tiresias-fw")} :: pull`);
    expect(calls).toContain(`${boards} :: pull`);
  });
});
