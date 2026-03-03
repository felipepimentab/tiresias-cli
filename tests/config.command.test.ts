import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { makeTempDir, readText, removeDir, runCli } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    removeDir(tempDirs.pop() as string);
  }
});

describe("config command", () => {
  it("shows warning when config is empty", () => {
    const xdgConfigHome = makeTempDir("tiresias-config-empty-");
    tempDirs.push(xdgConfigHome);

    const result = runCli(["config", "show"], {
      env: { XDG_CONFIG_HOME: xdgConfigHome },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Config file:");
    expect(result.output).toContain("No persisted paths configured yet.");
  });

  it("persists workspace and boards paths with config set", () => {
    const xdgConfigHome = makeTempDir("tiresias-config-set-");
    tempDirs.push(xdgConfigHome);

    const workspacePath = "/tmp/workspace-a";
    const boardsPath = "/tmp/boards-a";
    const setResult = runCli(
      ["config", "set", "--workspace", workspacePath, "--boards-path", boardsPath],
      { env: { XDG_CONFIG_HOME: xdgConfigHome } }
    );
    expect(setResult.exitCode).toBe(0);
    expect(setResult.output).toContain("Configuration saved.");

    const showResult = runCli(["config", "show"], {
      env: { XDG_CONFIG_HOME: xdgConfigHome },
    });
    expect(showResult.exitCode).toBe(0);
    expect(showResult.output).toContain(`workspacePath=${workspacePath}`);
    expect(showResult.output).toContain(`boardsPath=${boardsPath}`);

    const configFile = resolve(xdgConfigHome, "tiresias-cli", "config.json");
    const fileContent = JSON.parse(readText(configFile)) as {
      workspacePath: string;
      boardsPath: string;
    };
    expect(fileContent.workspacePath).toBe(workspacePath);
    expect(fileContent.boardsPath).toBe(boardsPath);
  });

  it("fails when config set is called without values", () => {
    const xdgConfigHome = makeTempDir("tiresias-config-invalid-");
    tempDirs.push(xdgConfigHome);

    const result = runCli(["config", "set"], {
      env: { XDG_CONFIG_HOME: xdgConfigHome },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("No values provided");
  });
});
