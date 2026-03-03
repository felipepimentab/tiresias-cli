import type { Command } from "commander";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { readConfig, updateConfig } from "../lib/config";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";

const FW_REPO_URL = "https://github.com/felipepimentab/tiresias-fw";
const BOARDS_REPO_URL = "https://github.com/felipepimentab/tiresias-boards";

type InitOptions = {
  parent: string;
  workspaceName: string;
  boardsName: string;
  branch: string;
  force: boolean;
  skipWestUpdate: boolean;
};

export function registerInit(program: Command) {
  program
    .command("init")
    .description("Initialize Tiresias west workspace and clone tiresias-boards as sibling repo")
    .option("-p, --parent <path>", "Parent directory for both repositories", ".")
    .option("-w, --workspace-name <name>", "West workspace directory name", "tiresias-workspace")
    .option("-b, --boards-name <name>", "Boards repository directory name", "tiresias-boards")
    .option("--branch <name>", "tiresias-fw manifest repository branch", "main")
    .option("-f, --force", "Overwrite existing workspace/boards directories if they exist", false)
    .option("--skip-west-update", "Skip `west update` during initialization", false)
    .action(async (options: InitOptions) => {
      const parentPath = resolve(options.parent);
      const workspacePath = resolve(parentPath, options.workspaceName);
      const boardsPath = resolve(parentPath, options.boardsName);
      const fwRepoPath = resolve(workspacePath, "tiresias-fw");

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

        await handleExistingDirectory(workspacePath, "workspace", options.force);
        await handleExistingDirectory(boardsPath, "boards", options.force);

        info(`Initializing west workspace in ${workspacePath}...`);
        await runCommand(
          "west",
          [
            "init",
            "-m",
            FW_REPO_URL,
            "--mr",
            options.branch,
            options.workspaceName,
          ],
          { cwd: parentPath, quiet: false }
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

        success("Initialization complete.");
        info(`Workspace: ${workspacePath}`);
        info(`Boards: ${boardsPath}`);
        info("Persisted workspace and boards paths in CLI config.");
        info("Next: open nRF Connect for VS Code and add the boards path as an extra board root.");
      } catch (err) {
        error(String(err));
        process.exit(1);
      }
    });
}

async function runPreflightSafeguards(params: {
  parentPath: string;
  workspacePath: string;
  fwRepoPath: string;
  boardsPath: string;
  force: boolean;
}) {
  const config = await readConfig();

  if (config.workspacePath) {
    const configuredWorkspace = resolve(config.workspacePath);
    if (configuredWorkspace !== params.workspacePath && hasFwRepo(configuredWorkspace)) {
      handleConflict(
        `Configured workspace already contains tiresias-fw at ${configuredWorkspace}`,
        params.force
      );
    }
  }

  if (config.boardsPath) {
    const configuredBoards = resolve(config.boardsPath);
    if (configuredBoards !== params.boardsPath && isGitRepo(configuredBoards)) {
      handleConflict(
        `Configured boards repository already exists at ${configuredBoards}`,
        params.force
      );
    }
  }

  const siblingFwRepo = resolve(params.parentPath, "tiresias-fw");
  if (isGitRepo(siblingFwRepo)) {
    handleConflict(
      `Found tiresias-fw repository at ${siblingFwRepo}. Expected west workspace root instead.`,
      params.force
    );
  }

  if (hasFwRepo(params.workspacePath)) {
    handleConflict(`Found existing tiresias-fw repository at ${params.fwRepoPath}`, params.force);
  }

  if (isGitRepo(params.boardsPath)) {
    handleConflict(`Found existing tiresias-boards repository at ${params.boardsPath}`, params.force);
  }
}

function handleConflict(message: string, force: boolean) {
  if (!force) {
    error(message);
    error("Use --force to proceed and overwrite existing target directories when applicable.");
    process.exit(1);
  }
  warn(`${message} -- continuing due to --force.`);
}

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

function hasFwRepo(workspacePath: string) {
  return isGitRepo(resolve(workspacePath, "tiresias-fw"));
}

function isGitRepo(path: string) {
  return existsSync(path) && existsSync(resolve(path, ".git"));
}
