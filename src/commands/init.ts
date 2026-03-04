import type { Command } from "commander";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { readConfig, updateConfig } from "../lib/config";
import { configureEditorBoardRoots, detectPreferredEditorCommand } from "../lib/editor-settings";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";

const FW_REPO_URL = "https://github.com/felipepimentab/tiresias-fw";
const BOARDS_REPO_URL = "https://github.com/felipepimentab/tiresias-boards";
const HOMEBREW_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh";
const REQUIRED_NCS_TOOLCHAIN_VERSION = "3.0.1";

type Requirement = {
  name: string;
  command: string;
  args?: string[];
  brewInstall?: string[];
  officialInstallUrl: string;
  requiredForInit?: boolean;
};

const INIT_REQUIREMENTS: Requirement[] = [
  {
    name: "git",
    command: "git",
    args: ["--version"],
    brewInstall: ["install", "git"],
    officialInstallUrl: "https://git-scm.com/downloads",
    requiredForInit: true,
  },
  {
    name: "west",
    command: "west",
    args: ["--version"],
    brewInstall: ["install", "west"],
    officialInstallUrl: "https://docs.zephyrproject.org/latest/develop/west/install.html",
    requiredForInit: true,
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
    brewInstall: ["install", "python"],
    officialInstallUrl: "https://www.python.org/downloads/",
  },
  {
    name: "nrfutil",
    command: "nrfutil",
    args: ["--version"],
    brewInstall: ["install", "nrfutil"],
    officialInstallUrl: "https://www.nordicsemi.com/Products/Development-tools/nrf-util",
  },
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
    brewInstall: ["install", "--cask", "nrf-command-line-tools"],
    officialInstallUrl:
      "https://www.nordicsemi.com/Products/Development-tools/nRF-Command-Line-Tools",
  },
];

type InitOptions = {
  parent: string;
  workspaceName: string;
  boardsName: string;
  branch: string;
  force: boolean;
  skipWestUpdate: boolean;
};

let cachedBrewPath: string | null | undefined;

export function registerInit(program: Command) {
  program
    .command("init")
    .description("Initialize Tiresias west workspace and clone tiresias-boards as sibling repo")
    .option("-p, --parent <path>", "Parent directory for both repositories", ".")
    .option("-w, --workspace-name <name>", "West workspace directory name", "tiresias-workspace")
    .option("-b, --boards-name <name>", "Boards repository directory name", "boards")
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

        await ensureInitDependencies();

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
        await configureEditorBoardRoots({
          boardsPath,
          askYesNo,
          logger: { info, success, warn, error },
        });

        success("Initialization complete.");
        info(`Workspace: ${workspacePath}`);
        info(`Boards: ${boardsPath}`);
        info("Persisted workspace and boards paths in CLI config.");
        info("Next steps:");
        info(`1. Open your workspace in your editor: ${workspacePath}`);
        info("2. In the NCS extension, add the application if it is not already added.");
        info("3. Build with board target: tiresias_dk/nrf5340/cpuapp");
        await promptToOpenWorkspaceInEditor(workspacePath);
      } catch (err) {
        error(String(err));
        process.exit(1);
      }
    });
}

async function ensureInitDependencies() {
  info("Checking required dependencies for initialization...");

  for (const requirement of INIT_REQUIREMENTS) {
    await checkAndInstallRequirement(requirement);
  }

  await checkAndInstallNrfConnectDesktop();
  await checkAndInstallNrfToolchain();

  if (!Bun.which("git")) {
    error("git is required to continue but is still missing.");
    process.exit(1);
  }

  if (!Bun.which("west")) {
    error("west is required to continue but is still missing.");
    process.exit(1);
  }

  success("Dependency bootstrap checks finished.");
}

async function checkAndInstallRequirement(requirement: Requirement) {
  const installedPath = Bun.which(requirement.command);
  if (installedPath) {
    if (!requirement.args || requirement.args.length === 0) {
      success(`${requirement.name} found (${installedPath})`);
      return;
    }

    try {
      const output = await runCommand(requirement.command, requirement.args, { quiet: true });
      const firstLine = output.split("\n")[0] ?? "version output unavailable";
      success(`${requirement.name} found (${firstLine})`);
      return;
    } catch {
      success(`${requirement.name} found (${installedPath})`);
      return;
    }
  }

  error(`${requirement.name} not found`);
  await offerRequirementInstall(requirement);

  if (requirement.requiredForInit && !Bun.which(requirement.command)) {
    error(`${requirement.name} is required for init.`);
    process.exit(1);
  }
}

async function checkAndInstallNrfConnectDesktop() {
  const appPaths = [
    "/Applications/nRF Connect for Desktop.app",
    resolve(process.env.HOME ?? "", "Applications", "nRF Connect for Desktop.app"),
  ];
  const installedPath = appPaths.find((path) => existsSync(path));
  if (installedPath) {
    success(`nrf-connect-for-desktop found (${installedPath})`);
    return;
  }

  error("nrf-connect-for-desktop not found");
  await offerInstall(
    "nrf-connect-for-desktop",
    ["install", "--cask", "nrf-connect"],
    "https://www.nordicsemi.com/Products/Development-tools/nrf-connect-for-desktop/download"
  );
}

async function checkAndInstallNrfToolchain() {
  if (!Bun.which("nrfutil")) {
    warn(
      `Skipping nRF Connect SDK toolchain check because nrfutil is missing. Expected version: v${REQUIRED_NCS_TOOLCHAIN_VERSION}`
    );
    return;
  }

  let listOutput = "";
  try {
    listOutput = await runCommand("nrfutil", ["list"], { quiet: true });
  } catch {
    warn("Unable to list nrfutil commands. Skipping toolchain check.");
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
        "Install it manually with `nrfutil install toolchain-manager` to manage NCS toolchains."
      );
      return;
    }
  }

  let toolchains = "";
  try {
    toolchains = await runCommand("nrfutil", ["toolchain-manager", "list"], { quiet: true });
  } catch {
    warn("Failed to query installed NCS toolchains.");
    return;
  }

  const hasRequiredVersion = new RegExp(`\\bv?${REQUIRED_NCS_TOOLCHAIN_VERSION}\\b`).test(
    toolchains
  );
  if (hasRequiredVersion) {
    success(`nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} found`);
    return;
  }

  error(`nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} not found`);
  const shouldInstall = await askYesNo(
    `Do you want to install nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} now? [Y/n] (nrfutil toolchain-manager install --ncs-version v${REQUIRED_NCS_TOOLCHAIN_VERSION}) `
  );
  if (shouldInstall) {
    try {
      info(`Installing NCS toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION}...`);
      await runCommand(
        "nrfutil",
        [
          "toolchain-manager",
          "install",
          "--ncs-version",
          `v${REQUIRED_NCS_TOOLCHAIN_VERSION}`,
        ],
        { quiet: false }
      );
      success(`nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} installed.`);
    } catch (err) {
      error(String(err));
      warn("Reference: https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/installation/install_ncs.html");
    }
  } else {
    warn(
      `Install it manually with: nrfutil toolchain-manager install --ncs-version v${REQUIRED_NCS_TOOLCHAIN_VERSION}`
    );
  }
}

async function offerRequirementInstall(requirement: Requirement) {
  if (process.platform !== "darwin") {
    warn(`Install ${requirement.name} from the official source: ${requirement.officialInstallUrl}`);
    return;
  }

  if (!requirement.brewInstall) {
    warn(`No Homebrew package configured for ${requirement.name}.`);
    warn(`Official install guide: ${requirement.officialInstallUrl}`);
    return;
  }

  await offerInstall(requirement.name, requirement.brewInstall, requirement.officialInstallUrl);
}

async function offerInstall(
  toolName: string,
  brewInstall: string[],
  officialInstallUrl: string
) {
  if (process.platform !== "darwin") {
    warn(`Install ${toolName} from the official source: ${officialInstallUrl}`);
    return;
  }

  const brewPath = await ensureHomebrewAvailable();
  if (!brewPath) {
    warn(`Official install guide for ${toolName}: ${officialInstallUrl}`);
    return;
  }

  const installCommand = `brew ${brewInstall.join(" ")}`;
  const shouldInstall = await askYesNo(
    `Do you want to install ${toolName} now? [Y/n] (${installCommand}) `
  );
  if (!shouldInstall) {
    return;
  }

  try {
    info(`Installing ${toolName} with Homebrew...`);
    await runCommand(brewPath, brewInstall, { quiet: false });
    success(`${toolName} installed.`);
  } catch (err) {
    error(String(err));
    warn(`Official install guide for ${toolName}: ${officialInstallUrl}`);
  }
}

async function ensureHomebrewAvailable() {
  if (process.platform !== "darwin") {
    return null;
  }

  if (cachedBrewPath !== undefined) {
    return cachedBrewPath;
  }

  const existing = detectBrewPath();
  if (existing) {
    cachedBrewPath = existing;
    return existing;
  }

  error("Homebrew is not installed.");
  const shouldInstall = await askYesNo(
    "Do you want to install Homebrew now? [Y/n] "
  );
  if (!shouldInstall) {
    warn("Homebrew is required for automatic dependency installation on macOS.");
    warn("Install it from: https://brew.sh");
    cachedBrewPath = null;
    return null;
  }

  try {
    info("Installing Homebrew...");
    await runCommand("/bin/bash", [
      "-c",
      `NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL ${HOMEBREW_INSTALL_SCRIPT_URL})"`,
    ], { quiet: false });
  } catch (err) {
    error(String(err));
    warn("Install Homebrew manually from: https://brew.sh");
    cachedBrewPath = null;
    return null;
  }

  const installed = detectBrewPath();
  if (installed) {
    success(`Homebrew installed (${installed})`);
    cachedBrewPath = installed;
    return installed;
  }

  warn("Homebrew installation completed but `brew` is not yet available in PATH.");
  warn("Restart your shell and rerun `tiresias init`.");
  cachedBrewPath = null;
  return null;
}

function detectBrewPath() {
  return (
    Bun.which("brew") ??
    (existsSync("/opt/homebrew/bin/brew") ? "/opt/homebrew/bin/brew" : null) ??
    (existsSync("/usr/local/bin/brew") ? "/usr/local/bin/brew" : null)
  );
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

async function promptToOpenWorkspaceInEditor(workspacePath: string) {
  const detectedEditor = detectPreferredEditorCommand();
  const destination = `${detectedEditor?.editor ?? "detected editor"} (${workspacePath})`;
  const shouldOpen = await askYesNo(
    `Do you want to open ${destination} now? [Y/n] `
  );
  if (!shouldOpen) {
    return;
  }

  if (!detectedEditor) {
    warn("Could not auto-detect VS Code or Trae CLI command.");
    warn(`Open this folder manually in your editor: ${workspacePath}`);
    return;
  }

  try {
    info(`Opening ${detectedEditor.editor} at ${workspacePath}...`);
    await runCommand(detectedEditor.command, [workspacePath], { quiet: false });
    success(`${detectedEditor.editor} opened.`);
  } catch (err) {
    error(`Failed to open ${detectedEditor.editor}: ${String(err)}`);
    warn(`Open this folder manually in your editor: ${workspacePath}`);
  }
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
