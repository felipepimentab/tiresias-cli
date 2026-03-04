import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import {
  configureBoardRootsIntegration,
  promptToOpenWorkspaceInEditor,
} from "../checks/editor-integration";
import { ensureInitDependencies } from "../checks/init-tool-checks";
import { collectInitConflicts } from "../checks/workspace-checks";
import { updateConfig } from "../lib/config";
import {
  BOARDS_REPO_URL,
  DEFAULT_BOARDS_DIRECTORY_NAME,
  DEFAULT_WORKSPACE_NAME,
  FW_REPO_URL,
  FW_REPOSITORY_NAME,
  NCS_BUILD_BOARD_TARGET,
} from "../lib/constants";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";
import { createAskYesNo } from "../lib/prompts";

type InitOptions = {
  parent: string;
  workspaceName: string;
  boardsName: string;
  branch: string;
  force: boolean;
  skipWestUpdate: boolean;
};

const askYesNo = createAskYesNo({ warn });

/**
 * Registers `tiresias init`, which bootstraps dependencies, initializes the
 * west workspace, clones `tiresias-boards` as local `boards`, and persists paths.
 */
export function registerInit(program: Command) {
  program
    .command("init")
    .description("Initialize Tiresias west workspace and clone tiresias-boards as sibling repo")
    .option("-p, --parent <path>", "Parent directory for both repositories", ".")
    .option("-w, --workspace-name <name>", "West workspace directory name", DEFAULT_WORKSPACE_NAME)
    .option("-b, --boards-name <name>", "Boards directory name", DEFAULT_BOARDS_DIRECTORY_NAME)
    .option("--branch <name>", "tiresias-fw manifest repository branch", "main")
    .option("-f, --force", "Overwrite existing workspace/boards directories if they exist", false)
    .option("--skip-west-update", "Skip `west update` during initialization", false)
    .action(async (options: InitOptions) => {
      const parentPath = resolve(options.parent);
      const workspacePath = resolve(parentPath, options.workspaceName);
      const boardsPath = resolve(parentPath, options.boardsName);
      const fwRepoPath = resolve(workspacePath, FW_REPOSITORY_NAME);

      if (!existsSync(parentPath)) {
        error(`parent directory not found (${parentPath})`);
        process.exit(1);
      }

      try {
        await runPreflightSafeguards({
          parentPath,
          workspacePath,
          fwRepoPath,
          boardsPath,
          force: options.force,
        });

        await ensureInitDependencies({
          askYesNo,
          logger: { info, success, warn, error },
        });

        await handleExistingDirectory(workspacePath, "workspace", options.force);
        await handleExistingDirectory(boardsPath, "boards", options.force);

        info(`Initializing west workspace in ${workspacePath}...`);
        await runCommand(
          "west",
          ["init", "-m", FW_REPO_URL, "--mr", options.branch, options.workspaceName],
          { cwd: parentPath, quiet: false },
        );

        if (options.skipWestUpdate) {
          warn("Skipping `west update` as requested.");
          warn("Run `west update` inside the workspace before building.");
        } else {
          info("Updating west modules...");
          await runCommand("west", ["update"], { cwd: workspacePath, quiet: false });
        }

        info(`Cloning tiresias-boards to ${boardsPath}...`);
        await runCommand("git", ["clone", BOARDS_REPO_URL, options.boardsName], {
          cwd: parentPath,
          quiet: false,
        });

        await updateConfig({ workspacePath, boardsPath });
        await configureBoardRootsIntegration(boardsPath, askYesNo, {
          info,
          success,
          warn,
          error,
        });

        success("Initialization complete.");
        info(`Workspace: ${workspacePath}`);
        info(`Boards: ${boardsPath}`);
        info("Persisted workspace and boards paths in CLI config.");
        info("Next steps:");
        info(`1. Open your workspace in your editor: ${workspacePath}`);
        info("2. In the NCS extension, add the application if it is not already added.");
        info(`3. Build with board target: ${NCS_BUILD_BOARD_TARGET}`);
        await promptToOpenWorkspaceInEditor(workspacePath, askYesNo, {
          info,
          success,
          warn,
          error,
        });
      } catch (err) {
        error(String(err));
        process.exit(1);
      }
    });
}

/**
 * Prevents accidental conflicts by checking configured and on-disk repository
 * locations before `init` writes anything.
 */
async function runPreflightSafeguards(params: {
  parentPath: string;
  workspacePath: string;
  fwRepoPath: string;
  boardsPath: string;
  force: boolean;
}) {
  const conflicts = await collectInitConflicts({
    parentPath: params.parentPath,
    workspacePath: params.workspacePath,
    fwRepoPath: params.fwRepoPath,
    boardsPath: params.boardsPath,
  });

  for (const conflict of conflicts) {
    handleConflict(conflict, params.force);
  }
}

/**
 * Applies conflict policy (`--force` or stop with exit code 1).
 */
function handleConflict(message: string, force: boolean) {
  if (!force) {
    error(message);
    error("Use --force to proceed and overwrite existing target directories when applicable.");
    process.exit(1);
  }
  warn(`${message} -- continuing due to --force.`);
}

/**
 * Removes an existing directory only when force mode is enabled.
 */
async function handleExistingDirectory(path: string, label: string, force: boolean) {
  if (!existsSync(path)) {
    return;
  }

  if (!force) {
    error(`${label} directory already exists (${path})`);
    error("Use --force to overwrite existing directories.");
    process.exit(1);
  }

  warn(`Removing existing ${label} directory: ${path}`);
  await rm(path, { recursive: true, force: true });
}
