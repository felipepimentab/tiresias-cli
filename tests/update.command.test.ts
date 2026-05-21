import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
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

  it("can update only the firmware repository", () => {
    const root = makeTempDir("tiresias-update-fw-only-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const boards = resolve(root, "boards");
    ensureDir(resolve(workspace, "tiresias-fw", ".git"));
    ensureDir(resolve(boards, ".git"));

    const { binDir, gitLog } = setupFakeGit(root);
    const result = runCli(
      ["update", "--workspace", workspace, "--boards-path", boards, "--target", "firmware"],
      {
        env: {
          XDG_CONFIG_HOME: xdgConfigHome,
          GIT_LOG: gitLog,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    const calls = readText(gitLog);
    expect(calls).toContain(`${resolve(workspace, "tiresias-fw")} :: pull`);
    expect(calls).not.toContain(`${boards} :: pull`);
  });

  it("can update only the boards repository", () => {
    const root = makeTempDir("tiresias-update-boards-only-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const boards = resolve(root, "boards");
    ensureDir(resolve(workspace, "tiresias-fw", ".git"));
    ensureDir(resolve(boards, ".git"));

    const { binDir, gitLog } = setupFakeGit(root);
    const result = runCli(
      ["update", "--workspace", workspace, "--boards-path", boards, "--target", "boards"],
      {
        env: {
          XDG_CONFIG_HOME: xdgConfigHome,
          GIT_LOG: gitLog,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    const calls = readText(gitLog);
    expect(calls).not.toContain(`${resolve(workspace, "tiresias-fw")} :: pull`);
    expect(calls).toContain(`${boards} :: pull`);
  });

  it("checks both repositories in dry-run mode without pulling", () => {
    const root = makeTempDir("tiresias-update-dry-run-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const boards = resolve(root, "boards");
    const fwRepo = resolve(workspace, "tiresias-fw");
    ensureDir(resolve(fwRepo, ".git"));
    ensureDir(resolve(boards, ".git"));

    const { binDir, gitLog } = setupFakeGit(root);
    const result = runCli(
      ["update", "--workspace", workspace, "--boards-path", boards, "--dry-run"],
      {
        env: {
          XDG_CONFIG_HOME: xdgConfigHome,
          GIT_LOG: gitLog,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("tiresias-fw is up to date.");
    expect(result.output).toContain("boards is up to date.");
    const calls = readText(gitLog);
    expect(calls).toContain(`${fwRepo} :: fetch`);
    expect(calls).toContain(`${fwRepo} :: rev-list --count HEAD..@{u}`);
    expect(calls).toContain(`${boards} :: fetch`);
    expect(calls).toContain(`${boards} :: rev-list --count HEAD..@{u}`);
    expect(calls).not.toContain(":: pull");
  });

  it("copies SigmaStudio export files without mutating generated files", () => {
    const root = makeTempDir("tiresias-update-sigma-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const sigma = resolve(root, "sigma-studio-export");
    const sigmaHeader = resolve(sigma, "adau_1787_IC_1_SIGMA.h");
    const sigmaExtra = resolve(sigma, "extra.inc");
    const targetDir = resolve(workspace, "tiresias-fw", "src", "SigmaStudioFiles");
    const targetHeader = resolve(targetDir, "adau_1787_IC_1_SIGMA.h");
    const staleFile = resolve(targetDir, "stale.txt");
    const staleContent = "stale";

    ensureDir(resolve(workspace, "tiresias-fw", ".git"));
    ensureDir(sigma);
    ensureDir(targetDir);
    writeFileSync(staleFile, staleContent, "utf8");
    writeFileSync(
      sigmaHeader,
      ["#ifndef ADAU_SIGMA", "#define ADAU_SIGMA", "#endif"].join("\n"),
      "utf8",
    );
    writeFileSync(sigmaExtra, "EXTRA=1\n", "utf8");

    const result = runCli(["update", "sigma", "--workspace", workspace, "--sigma-path", sigma], {
      env: {
        XDG_CONFIG_HOME: xdgConfigHome,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("SigmaStudio export files copied.");

    const updatedHeader = readText(targetHeader);
    expect(updatedHeader).toBe(["#ifndef ADAU_SIGMA", "#define ADAU_SIGMA", "#endif"].join("\n"));
    expect(readText(resolve(targetDir, "extra.inc"))).toContain("EXTRA=1");
    expect(existsSync(resolve(targetDir, ".git"))).toBe(false);

    // Existing files are preserved unless overwritten by source.
    expect(readText(staleFile)).toBe(staleContent);
  });

  it("uses persisted config for update sigma when flags are omitted", () => {
    const root = makeTempDir("tiresias-update-sigma-config-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const workspace = resolve(root, "workspace");
    const sigma = resolve(root, "sigma-studio-export");

    ensureDir(resolve(workspace, "tiresias-fw", ".git"));
    ensureDir(sigma);
    writeFileSync(resolve(sigma, "export.txt"), "exported\n", "utf8");

    writeJson(resolve(xdgConfigHome, "tiresias-cli", "config.json"), {
      workspacePath: workspace,
      sigmaPath: sigma,
    });

    const result = runCli(["update", "sigma"], {
      env: {
        XDG_CONFIG_HOME: xdgConfigHome,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("sigma path:");
    expect(result.output).toContain("source: persisted config");
    expect(result.output).toContain("SigmaStudio export files copied.");
  });
});
