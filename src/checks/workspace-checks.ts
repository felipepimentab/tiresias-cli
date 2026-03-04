import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readConfig } from "../lib/config";
import { DEFAULT_BOARDS_DIRECTORY_NAME, FW_REPOSITORY_NAME } from "../lib/constants";

type InitConflictParams = {
  parentPath: string;
  workspacePath: string;
  fwRepoPath: string;
  boardsPath: string;
};

/**
 * Expected local boards directory for a given workspace path.
 */
export function expectedBoardsPath(workspacePath: string) {
  return resolve(workspacePath, "..", DEFAULT_BOARDS_DIRECTORY_NAME);
}

/**
 * Returns true when a directory contains a `.git` marker.
 */
export function isGitRepo(path: string) {
  return existsSync(path) && existsSync(resolve(path, ".git"));
}

/**
 * Returns true when a west workspace contains the firmware repository.
 */
export function hasFwRepo(workspacePath: string) {
  return isGitRepo(resolve(workspacePath, FW_REPOSITORY_NAME));
}

/**
 * Checks whether `candidatePath` is equal to or nested under `parentPath`.
 */
export function isInsideDirectory(candidatePath: string, parentPath: string) {
  const normalizedCandidate = resolve(candidatePath);
  const normalizedParent = resolve(parentPath);
  return (
    normalizedCandidate === normalizedParent ||
    normalizedCandidate.startsWith(`${normalizedParent}/`)
  );
}

/**
 * Validates west workspace structure by checking for `.west`.
 */
export function validateWestWorkspace(workspacePath: string) {
  if (!existsSync(workspacePath)) {
    return { ok: false, error: `workspace not found (${workspacePath})` };
  }

  const westDir = resolve(workspacePath, ".west");
  if (!existsSync(westDir)) {
    return { ok: false, error: `invalid west workspace (${workspacePath})` };
  }

  return { ok: true as const };
}

/**
 * Boards must remain outside the west workspace to avoid board-definition
 * duplication conflicts between workspace overlays and external board roots.
 */
export function validateBoardsOutsideWorkspace(boardsPath: string, workspacePath: string | null) {
  if (!workspacePath) {
    return { ok: true as const };
  }

  if (isInsideDirectory(boardsPath, workspacePath)) {
    return {
      ok: false,
      error: "boards repository should be outside the west workspace",
      moveTarget: expectedBoardsPath(workspacePath),
    };
  }

  return { ok: true as const };
}

/**
 * Collects all potential init conflicts before mutating local directories.
 */
export async function collectInitConflicts(params: InitConflictParams) {
  const conflicts: string[] = [];
  const config = await readConfig();

  if (config.workspacePath) {
    const configuredWorkspace = resolve(config.workspacePath);
    if (configuredWorkspace !== params.workspacePath && hasFwRepo(configuredWorkspace)) {
      conflicts.push(
        `Configured workspace already contains ${FW_REPOSITORY_NAME} at ${configuredWorkspace}`,
      );
    }
  }

  if (config.boardsPath) {
    const configuredBoards = resolve(config.boardsPath);
    if (configuredBoards !== params.boardsPath && isGitRepo(configuredBoards)) {
      conflicts.push(`Configured boards repository already exists at ${configuredBoards}`);
    }
  }

  const siblingFwRepo = resolve(params.parentPath, FW_REPOSITORY_NAME);
  if (isGitRepo(siblingFwRepo)) {
    conflicts.push(
      `Found ${FW_REPOSITORY_NAME} repository at ${siblingFwRepo}. Expected west workspace root instead.`,
    );
  }

  if (hasFwRepo(params.workspacePath)) {
    conflicts.push(`Found existing ${FW_REPOSITORY_NAME} repository at ${params.fwRepoPath}`);
  }

  if (isGitRepo(params.boardsPath)) {
    conflicts.push(`Found existing boards repository at ${params.boardsPath}`);
  }

  return conflicts;
}
