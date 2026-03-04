import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { readConfig, updateConfig } from "../lib/config";
import { DEFAULT_BOARDS_DIRECTORY_NAME, FW_REPOSITORY_NAME } from "../lib/constants";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";
import {
  describeResolvedPath,
  resolveBoardsPath,
  resolveWorkspacePath,
} from "../lib/path-resolution";

type UpdateOptions = {
  workspace?: string;
  boardsPath?: string;
};

/**
 * Registers `tiresias update`, which pulls latest changes from both
 * `<workspace>/tiresias-fw` and the sibling `boards` repository.
 */
export function registerUpdate(program: Command) {
  program
    .command("update")
    .description("Pull latest changes for tiresias-fw and boards")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-B, --boards-path <path>", "Path to boards repository (outside workspace)")
    .action(async (options: UpdateOptions) => {
      const config = await readConfig();
      const workspaceResolution = await resolveWorkspacePath({
        fromFlag: options.workspace,
        fromConfig: config.workspacePath,
      });
      const boardsResolution = resolveBoardsPath({
        fromFlag: options.boardsPath,
        fromConfig: config.boardsPath,
        workspacePath: workspaceResolution.path,
      });

      info(describeResolvedPath("workspace path", workspaceResolution));
      info(describeResolvedPath("boards path", boardsResolution));

      if (!workspaceResolution.path) {
        warn(
          "Could not determine west workspace automatically. Use --workspace or set TIRESIAS_WORKSPACE.",
        );
        process.exit(1);
      }
      if (!boardsResolution.path) {
        warn(
          "Boards repository path could not be determined. Use --boards-path or set TIRESIAS_BOARDS_PATH.",
        );
        process.exit(1);
      }

      const workspacePath = workspaceResolution.path;
      const boardsPath = boardsResolution.path;
      const fwRepoPath = resolve(workspacePath, FW_REPOSITORY_NAME);

      if (!isGitRepo(fwRepoPath)) {
        error(`tiresias-fw repository not found at ${fwRepoPath}`);
        warn(`Expected layout: <workspace>/${FW_REPOSITORY_NAME}`);
        process.exit(1);
      }

      if (!isGitRepo(boardsPath)) {
        error(`boards path is not a git repository (${boardsPath})`);
        warn(`Expected boards directory path (for example: ../${DEFAULT_BOARDS_DIRECTORY_NAME}).`);
        process.exit(1);
      }

      try {
        info(`Updating tiresias-fw in ${fwRepoPath}...`);
        await runCommand("git", ["pull"], { cwd: fwRepoPath, quiet: false });
        success("tiresias-fw updated.");

        info(`Updating boards in ${boardsPath}...`);
        await runCommand("git", ["pull"], { cwd: boardsPath, quiet: false });
        success("boards updated.");

        await updateConfig({ workspacePath, boardsPath });
      } catch (err) {
        error(String(err));
        process.exit(1);
      }
    });
}

/**
 * Returns true when a directory contains a `.git` marker.
 */
function isGitRepo(path: string) {
  return existsSync(path) && existsSync(resolve(path, ".git"));
}
