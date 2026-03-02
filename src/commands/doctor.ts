import type { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";

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

      const workspacePath = await resolveWorkspacePath(options.workspace);
      if (workspacePath) {
        checkWorkspace(workspacePath);
      }

      checkBoardsPath(options.boardsPath, workspacePath);

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

async function resolveWorkspacePath(fromOption?: string) {
  if (fromOption) {
    return resolve(fromOption);
  }

  const fromEnv = process.env.TIRESIAS_WORKSPACE;
  if (fromEnv) {
    return resolve(fromEnv);
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
    return;
  }

  const westDir = resolve(workspacePath, ".west");
  if (!existsSync(westDir)) {
    error(`invalid west workspace (${workspacePath})`);
    return;
  }

  success(`west workspace found (${workspacePath})`);
}

function checkBoardsPath(boardsPathOption: string | undefined, workspacePath: string | null) {
  const boardsPathRaw =
    boardsPathOption ??
    process.env.TIRESIAS_BOARDS_PATH ??
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
    return;
  }

  if (workspacePath && isInsideDirectory(boardsPath, workspacePath)) {
    error("boards repository should be outside the west workspace");
    warn(`Move boards repo to: ${resolve(workspacePath, "..", "tiresias-boards")}`);
    return;
  }

  success(`boards repository found (${boardsPath})`);
  info(
    "Reminder: add this path in the nRF Connect for VS Code extension UI as an extra board root."
  );
}

function isInsideDirectory(candidatePath: string, parentPath: string) {
  const normalizedCandidate = resolve(candidatePath);
  const normalizedParent = resolve(parentPath);
  return (
    normalizedCandidate === normalizedParent ||
    normalizedCandidate.startsWith(`${normalizedParent}/`)
  );
}
