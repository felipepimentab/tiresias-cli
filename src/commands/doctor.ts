import type { Command } from "commander";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { readConfig, type TiresiasConfig, updateConfig } from "../lib/config";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";

const BOARDS_REPO_URL = "https://github.com/felipepimentab/tiresias-boards";
const REQUIRED_NCS_TOOLCHAIN_VERSION = "3.0.1";

type ToolCheck = {
  name: string;
  command: string;
  args?: string[];
  brewInstall?: string[];
  officialInstallUrl: string;
};

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Check development environment")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-B, --boards-path <path>", "Path to boards repository (outside workspace)")
    .action(async (options: { workspace?: string; boardsPath?: string }) => {
      info("Checking environment...");
      const config = await readConfig();

      const checks: ToolCheck[] = [
        {
          name: "west",
          command: "west",
          args: ["--version"],
          brewInstall: ["install", "west"],
          officialInstallUrl:
            "https://docs.zephyrproject.org/latest/develop/west/install.html",
        },
        {
          name: "cmake",
          command: "cmake",
          args: ["--version"],
          brewInstall: ["install", "cmake"],
          officialInstallUrl: "https://cmake.org/download/",
        },
        {
          name: "python3",
          command: "python3",
          args: ["--version"],
          officialInstallUrl: "https://www.python.org/downloads/",
        },
        {
          name: "nrfutil",
          command: "nrfutil",
          args: ["--version"],
          brewInstall: ["install", "nrfutil"],
          officialInstallUrl:
            "https://www.nordicsemi.com/Products/Development-tools/nrf-util",
        },
        // SEGGER tools do not provide a consistent version flag across installs.
        {
          name: "segger-jlink",
          command: "JLinkExe",
          brewInstall: ["install", "--cask", "segger-jlink"],
          officialInstallUrl: "https://www.segger.com/downloads/jlink/",
        },
        {
          name: "nordic-nrf-command-line-tools",
          command: "nrfjprog",
          args: ["--version"],
          officialInstallUrl:
            "https://www.nordicsemi.com/Products/Development-tools/nRF-Command-Line-Tools",
        },
      ];

      for (const check of checks) {
        await checkTool(check);
      }

      await checkNrfConnectDesktop();
      await checkNrfToolchainVersion();

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
    await offerInstall(check);
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

async function checkNrfConnectDesktop() {
  const appPaths = [
    "/Applications/nRF Connect for Desktop.app",
    resolve(process.env.HOME ?? "", "Applications", "nRF Connect for Desktop.app"),
  ];
  const installedPath = appPaths.find((path) => existsSync(path));
  if (installedPath) {
    success(`nrf-connect-for-desktop found (${installedPath})`);
    return;
  }

  const check: ToolCheck = {
    name: "nrf-connect-for-desktop",
    command: "nrf-connect",
    brewInstall: ["install", "--cask", "nrf-connect"],
    officialInstallUrl:
      "https://www.nordicsemi.com/Products/Development-tools/nrf-connect-for-desktop/download",
  };

  error("nrf-connect-for-desktop not found");
  await offerInstall(check);
}

async function checkNrfToolchainVersion() {
  if (!Bun.which("nrfutil")) {
    warn(
      `Skipping nRF Connect SDK toolchain check (requires nrfutil and toolchain-manager). Expected version: v${REQUIRED_NCS_TOOLCHAIN_VERSION}`
    );
    return;
  }

  let listOutput = "";
  try {
    listOutput = await runCommand("nrfutil", ["list"], { quiet: true });
  } catch {
    warn("Unable to list nrfutil commands. Skipping toolchain version check.");
    return;
  }

  if (!/\btoolchain-manager\b/.test(listOutput)) {
    error("nrfutil toolchain-manager command not found");
    const shouldInstall = await askYesNo(
      "Do you want to install nrfutil toolchain-manager now? [Y/n] (nrfutil install toolchain-manager) "
    );
    if (shouldInstall) {
      try {
        info("Installing nrfutil toolchain-manager...");
        await runCommand("nrfutil", ["install", "toolchain-manager"], { quiet: false });
        success("nrfutil toolchain-manager installed.");
      } catch (err) {
        error(String(err));
        return;
      }
    } else {
      warn(
        "Install it manually with `nrfutil install toolchain-manager` to verify NCS toolchain versions."
      );
      return;
    }
  }

  try {
    const toolchains = await runCommand("nrfutil", ["toolchain-manager", "list"], {
      quiet: true,
    });

    const hasRequiredVersion = new RegExp(`\\bv?${REQUIRED_NCS_TOOLCHAIN_VERSION}\\b`).test(
      toolchains
    );
    if (hasRequiredVersion) {
      success(`nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} found`);
      return;
    }

    error(`nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} not found`);
    warn(
      `Install it with: nrfutil toolchain-manager install --ncs-version v${REQUIRED_NCS_TOOLCHAIN_VERSION}`
    );
    warn("Reference: https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/installation/install_ncs.html");
  } catch (err) {
    error(`Failed to check toolchains via nrfutil toolchain-manager: ${String(err)}`);
  }
}

async function offerInstall(check: ToolCheck) {
  if (process.platform !== "darwin") {
    warn(
      `Install ${check.name} from the official source: ${check.officialInstallUrl}`
    );
    return;
  }

  if (!Bun.which("brew")) {
    warn("Homebrew is not installed. Install it from https://brew.sh and retry.");
    warn(`Official install guide for ${check.name}: ${check.officialInstallUrl}`);
    return;
  }

  if (!check.brewInstall) {
    warn(`No Homebrew package configured for ${check.name}.`);
    warn(`Official install guide: ${check.officialInstallUrl}`);
    return;
  }

  const installCommand = `brew ${check.brewInstall.join(" ")}`;
  const shouldInstall = await askYesNo(
    `Do you want to install ${check.name} now? [Y/n] (${installCommand}) `
  );
  if (!shouldInstall) {
    return;
  }

  try {
    info(`Installing ${check.name} with Homebrew...`);
    await runCommand("brew", check.brewInstall, { quiet: false });
    success(`${check.name} installed.`);
  } catch (err) {
    error(String(err));
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
    (workspacePath ? resolve(workspacePath, "..", "boards") : undefined);

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
      warn(`Expected location: ${resolve(workspacePath, "..", "boards")}`);
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
    warn(`Move boards repo to: ${resolve(workspacePath, "..", "boards")}`);
    return null;
  }

  success(`boards repository found (${boardsPath})`);
  info(
    "Reminder: add this path in the nRF Connect for VS Code extension UI as an extra board root."
  );
  return boardsPath;
}

async function askYesNo(question: string) {
  if (!input.isTTY || !output.isTTY) {
    warn("Interactive prompt skipped (non-interactive terminal).");
    return false;
  }

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
