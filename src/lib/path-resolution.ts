import { resolve } from "node:path";
import { DEFAULT_BOARDS_DIRECTORY_NAME, ENV_VARS } from "./constants";
import { runCommand } from "./exec";

export type PathSource = "flag" | "env" | "config" | "auto" | "default";

export type ResolvedPath = {
  path: string | null;
  source: PathSource | null;
};

type WorkspaceResolutionInput = {
  fromFlag?: string;
  fromConfig?: string;
};

type BoardsResolutionInput = {
  fromFlag?: string;
  fromConfig?: string;
  workspacePath: string | null;
};

export async function resolveWorkspacePath(input: WorkspaceResolutionInput): Promise<ResolvedPath> {
  if (input.fromFlag) {
    return { path: resolve(input.fromFlag), source: "flag" };
  }

  const fromEnv = process.env[ENV_VARS.workspacePath];
  if (fromEnv) {
    return { path: resolve(fromEnv), source: "env" };
  }

  if (input.fromConfig) {
    return { path: resolve(input.fromConfig), source: "config" };
  }

  try {
    const topdir = await runCommand("west", ["topdir"], { quiet: true });
    return { path: resolve(topdir), source: "auto" };
  } catch {
    return { path: null, source: null };
  }
}

export function resolveBoardsPath(input: BoardsResolutionInput): ResolvedPath {
  if (input.fromFlag) {
    return { path: resolve(input.fromFlag), source: "flag" };
  }

  const fromEnv = process.env[ENV_VARS.boardsPath];
  if (fromEnv) {
    return { path: resolve(fromEnv), source: "env" };
  }

  if (input.fromConfig) {
    return { path: resolve(input.fromConfig), source: "config" };
  }

  if (input.workspacePath) {
    return {
      path: resolve(input.workspacePath, "..", DEFAULT_BOARDS_DIRECTORY_NAME),
      source: "default",
    };
  }

  return { path: null, source: null };
}

export function describeResolvedPath(label: string, resolved: ResolvedPath) {
  if (!resolved.path || !resolved.source) {
    return `${label}: unresolved`;
  }

  const sourceLabel = {
    flag: "CLI flag",
    env: "environment variable",
    config: "persisted config",
    auto: "auto-detection",
    default: "derived default",
  }[resolved.source];

  return `${label}: ${resolved.path} (source: ${sourceLabel})`;
}
