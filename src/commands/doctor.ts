import type { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { readConfig, type TiresiasConfig, updateConfig } from "../lib/config";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";

const BOARDS_REPO_URL = "https://github.com/felipepimentab/tiresias-boards";

type ToolCheck = {
  name: string;
  command: string;
  args?: string[];
};

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Check development environment")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-B, --boards-path <path>", "Path to tiresias-boards repository (outside workspace)")
    .action(async (options: { workspace?: string; boardsPath?: string }) => {
      info("Checking environment...");
      const config = await readConfig();

      const checks: ToolCheck[] = [
        { name: "west", command: "west", args: ["--version"] },
        { name: "cmake", command: "cmake", args: ["--version"] },
        { name: "python3", command: "python3", args: ["--version"] },
        { name: "nrfutil", command: "nrfutil", args: ["--version"] },
        // SEGGER tools do not provide a consistent version flag across installs.
        { name: "segger-jlink", command: "JLinkExe" },
        {
          name: "nordic-nrf-command-line-tools",
          command: "nrfjprog",
          args: ["--version"],
        },
      ];

      for (const check of checks) {
        await checkTool(check);
      }

      const workspacePath = await resolveWorkspacePath(options.workspace, config);
      const workspaceIsValid = workspacePath ? checkWorkspace(workspacePath) : false;
      if (workspacePath && workspaceIsValid) {
        await updateConfig({ workspacePath });
      }

      const boardsPath = await checkBoardsPath(options.boardsPath, workspacePath, config);
      if (boardsPath) {
        await updateConfig({ boardsPath });
      }

      info("Done.");
    });
}

async function checkTool(check: ToolCheck) {
  const installedPath = Bun.which(check.command);
  if (!installedPath) {
    error(`${check.name} not found`);
    return;
  }

  if (!check.args || check.args.length === 0) {
    success(`${check.name} found (${installedPath})`);
    return;
  }

  try {
    const output = await runCommand(check.command, check.args, { quiet: true });
    const firstLine = output.split("\n")[0] ?? "version output unavailable";
    success(`${check.name} found (${firstLine})`);
  } catch {
    success(`${check.name} found (${installedPath})`);
  }
}

async function resolveWorkspacePath(fromOption: string | undefined, config: TiresiasConfig) {
  if (fromOption) {
    return resolve(fromOption);
  }

  const fromEnv = process.env.TIRESIAS_WORKSPACE;
  if (fromEnv) {
    return resolve(fromEnv);
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

function checkWorkspace(workspacePath: string) {
  if (!existsSync(workspacePath)) {
    error(`workspace not found (${workspacePath})`);
    return false;
  }

  const westDir = resolve(workspacePath, ".west");
  if (!existsSync(westDir)) {
    error(`invalid west workspace (${workspacePath})`);
    return false;
  }

  success(`west workspace found (${workspacePath})`);
  return true;
}

async function checkBoardsPath(
  boardsPathOption: string | undefined,
  workspacePath: string | null,
  config: TiresiasConfig
) {
  const boardsPathRaw =
    boardsPathOption ??
    process.env.TIRESIAS_BOARDS_PATH ??
    config.boardsPath ??
    (workspacePath ? resolve(workspacePath, "..", "tiresias-boards") : undefined);

  if (!boardsPathRaw) {
    warn(
      "Boards repository path could not be determined. Use --boards-path or set TIRESIAS_BOARDS_PATH."
    );
    return;
  }

  const boardsPath = resolve(boardsPathRaw);
  if (!existsSync(boardsPath)) {
    error(`boards repository not found (${boardsPath})`);
    if (workspacePath) {
      warn(`Expected location: ${resolve(workspacePath, "..", "tiresias-boards")}`);
    }
    const shouldClone = await askYesNo(
      "Do you want to clone tiresias-boards automatically now? [Y/n] "
    );
    if (shouldClone) {
      const cloned = await cloneBoardsRepository(boardsPath);
      if (cloned) {
        return boardsPath;
      }
    }
    return null;
  }

  if (workspacePath && isInsideDirectory(boardsPath, workspacePath)) {
    error("boards repository should be outside the west workspace");
    warn(`Move boards repo to: ${resolve(workspacePath, "..", "tiresias-boards")}`);
    return null;
  }

  success(`boards repository found (${boardsPath})`);
  info(
    "Reminder: add this path in the nRF Connect for VS Code extension UI as an extra board root."
  );
  return boardsPath;
}

async function askYesNo(question: string) {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function cloneBoardsRepository(boardsPath: string) {
  try {
    info(`Cloning tiresias-boards into ${boardsPath}...`);
    await runCommand("git", ["clone", BOARDS_REPO_URL, boardsPath], { quiet: false });
    success("tiresias-boards cloned successfully.");
    info(
      "Reminder: add this path in the nRF Connect for VS Code extension UI as an extra board root."
    );
    return true;
  } catch (err) {
    error(String(err));
    return false;
  }
}

function isInsideDirectory(candidatePath: string, parentPath: string) {
  const normalizedCandidate = resolve(candidatePath);
  const normalizedParent = resolve(parentPath);
  return (
    normalizedCandidate === normalizedParent ||
    normalizedCandidate.startsWith(`${normalizedParent}/`)
  );
}
