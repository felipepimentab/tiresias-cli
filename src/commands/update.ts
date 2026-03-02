import type { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readConfig, type TiresiasConfig, updateConfig } from "../lib/config";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";

type UpdateOptions = {
  workspace?: string;
  boardsPath?: string;
};

export function registerUpdate(program: Command) {
  program
    .command("update")
    .description("Pull latest changes for tiresias-fw and tiresias-boards")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-B, --boards-path <path>", "Path to tiresias-boards repository (outside workspace)")
    .action(async (options: UpdateOptions) => {
      const config = await readConfig();
      const workspacePath = await resolveWorkspacePath(options.workspace, config);
      const boardsPath = resolveBoardsPath(options.boardsPath, workspacePath, config);
      const fwRepoPath = workspacePath ? resolve(workspacePath, "tiresias-fw") : null;

      if (!workspacePath || !boardsPath || !fwRepoPath) {
        process.exit(1);
      }

      if (!isGitRepo(fwRepoPath)) {
        error(`tiresias-fw repository not found at ${fwRepoPath}`);
        warn("Expected layout: <workspace>/tiresias-fw");
        process.exit(1);
      }

      if (!isGitRepo(boardsPath)) {
        error(`boards path is not a git repository (${boardsPath})`);
        process.exit(1);
      }

      try {
        info(`Updating tiresias-fw in ${fwRepoPath}...`);
        await runCommand("git", ["pull"], { cwd: fwRepoPath, quiet: false });
        success("tiresias-fw updated.");

        info(`Updating tiresias-boards in ${boardsPath}...`);
        await runCommand("git", ["pull"], { cwd: boardsPath, quiet: false });
        success("tiresias-boards updated.");

        await updateConfig({ workspacePath, boardsPath });
      } catch (err) {
        error(String(err));
        process.exit(1);
      }
    });
}

async function resolveWorkspacePath(fromOption: string | undefined, config: TiresiasConfig) {
  if (fromOption) {
    return resolve(fromOption);
  }

  if (process.env.TIRESIAS_WORKSPACE) {
    return resolve(process.env.TIRESIAS_WORKSPACE);
  }

  if (config.workspacePath) {
    return resolve(config.workspacePath);
  }

  try {
    const workspace = await runCommand("west", ["topdir"], { quiet: true });
    return resolve(workspace);
  } catch {
    warn(
      "Could not determine west workspace automatically. Use --workspace or set TIRESIAS_WORKSPACE."
    );
    return null;
  }
}

function resolveBoardsPath(
  fromOption: string | undefined,
  workspacePath: string | null,
  config: TiresiasConfig
) {
  const boardsPath =
    fromOption ??
    process.env.TIRESIAS_BOARDS_PATH ??
    config.boardsPath ??
    (workspacePath ? resolve(workspacePath, "..", "tiresias-boards") : null);

  if (!boardsPath) {
    warn(
      "Boards repository path could not be determined. Use --boards-path or set TIRESIAS_BOARDS_PATH."
    );
    return null;
  }

  return resolve(boardsPath);
}

function isGitRepo(path: string) {
  return existsSync(path) && existsSync(resolve(path, ".git"));
}
