import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { ENV_VARS } from "../src/lib/constants";
import { resolveBoardsPath, resolveWorkspacePath } from "../src/lib/path-resolution";
import { makeTempDir, removeDir } from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env[ENV_VARS.workspacePath];
  delete process.env[ENV_VARS.boardsPath];
  while (tempDirs.length > 0) {
    removeDir(tempDirs.pop() as string);
  }
});

describe("path resolution", () => {
  it("resolves workspace path by precedence (flag > env > config > auto)", async () => {
    const root = makeTempDir("tiresias-path-resolution-");
    tempDirs.push(root);

    const envPath = resolve(root, "env-workspace");
    const configPath = resolve(root, "config-workspace");
    const flagPath = resolve(root, "flag-workspace");
    process.env[ENV_VARS.workspacePath] = envPath;

    const fromFlag = await resolveWorkspacePath({ fromFlag: flagPath, fromConfig: configPath });
    expect(fromFlag.path).toBe(flagPath);
    expect(fromFlag.source).toBe("flag");

    const fromEnv = await resolveWorkspacePath({ fromConfig: configPath });
    expect(fromEnv.path).toBe(envPath);
    expect(fromEnv.source).toBe("env");

    delete process.env[ENV_VARS.workspacePath];
    const fromConfig = await resolveWorkspacePath({ fromConfig: configPath });
    expect(fromConfig.path).toBe(configPath);
    expect(fromConfig.source).toBe("config");
  });

  it("resolves boards path by precedence and default derivation", () => {
    const root = makeTempDir("tiresias-path-resolution-boards-");
    tempDirs.push(root);
    const workspace = resolve(root, "workspace");
    const fromFlag = resolve(root, "flag-boards");
    const fromEnv = resolve(root, "env-boards");
    const fromConfig = resolve(root, "config-boards");

    process.env[ENV_VARS.boardsPath] = fromEnv;
    const flag = resolveBoardsPath({ fromFlag, fromConfig, workspacePath: workspace });
    expect(flag.path).toBe(fromFlag);
    expect(flag.source).toBe("flag");

    const env = resolveBoardsPath({ fromConfig, workspacePath: workspace });
    expect(env.path).toBe(fromEnv);
    expect(env.source).toBe("env");

    delete process.env[ENV_VARS.boardsPath];
    const config = resolveBoardsPath({ fromConfig, workspacePath: workspace });
    expect(config.path).toBe(fromConfig);
    expect(config.source).toBe("config");

    const derived = resolveBoardsPath({ workspacePath: workspace });
    expect(derived.path).toBe(resolve(workspace, "..", "boards"));
    expect(derived.source).toBe("default");
  });
});
