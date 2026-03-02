import type { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { updateConfig } from "../lib/config";
import { runCommand } from "../lib/exec";
import { error, info, success } from "../lib/logger";

const FW_REPO_URL = "https://github.com/felipepimentab/tiresias-fw";
const BOARDS_REPO_URL = "https://github.com/felipepimentab/tiresias-boards";

type InitOptions = {
  parent: string;
  workspaceName: string;
  boardsName: string;
  branch: string;
};

export function registerInit(program: Command) {
  program
    .command("init")
    .description("Initialize Tiresias west workspace and clone tiresias-boards as sibling repo")
    .option("-p, --parent <path>", "Parent directory for both repositories", ".")
    .option("-w, --workspace-name <name>", "West workspace directory name", "tiresias-workspace")
    .option("-b, --boards-name <name>", "Boards repository directory name", "tiresias-boards")
    .option("--branch <name>", "tiresias-fw manifest repository branch", "main")
    .action(async (options: InitOptions) => {
      const parentPath = resolve(options.parent);
      const workspacePath = resolve(parentPath, options.workspaceName);
      const boardsPath = resolve(parentPath, options.boardsName);

      if (!existsSync(parentPath)) {
        error(`parent directory not found (${parentPath})`);
        process.exit(1);
      }

      if (existsSync(workspacePath)) {
        error(`workspace directory already exists (${workspacePath})`);
        process.exit(1);
      }

      if (existsSync(boardsPath)) {
        error(`boards directory already exists (${boardsPath})`);
        process.exit(1);
      }

      try {
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

        info("Updating west modules...");
        await runCommand("west", ["update"], { cwd: workspacePath, quiet: false });

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
