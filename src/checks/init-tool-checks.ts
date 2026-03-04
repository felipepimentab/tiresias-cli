import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  HOMEBREW_INSTALL_SCRIPT_URL,
  INIT_TOOL_REQUIREMENTS,
  NORDIC_APP_DISPLAY_NAME,
  REQUIRED_NCS_TOOLCHAIN_VERSION,
  TOOL_INSTALL_URLS,
  type ToolRequirement,
} from "../lib/constants";
import { runCommand } from "../lib/exec";
import type { AskYesNo } from "../lib/prompts";
import { yesNoQuestion } from "../lib/prompts";

type InitToolLogger = {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type InitToolCheckContext = {
  askYesNo: AskYesNo;
  logger: InitToolLogger;
};

let cachedBrewPath: string | null | undefined;

/**
 * Runs dependency checks/install prompts required before `tiresias init`.
 */
export async function ensureInitDependencies(context: InitToolCheckContext) {
  context.logger.info("Checking required dependencies for initialization...");

  for (const requirement of INIT_TOOL_REQUIREMENTS) {
    await checkAndInstallRequirement(requirement, context);
  }

  await checkAndInstallNrfConnectDesktop(context);
  await checkAndInstallNrfToolchain(context);

  if (!Bun.which("git")) {
    throw new Error("git is required to continue but is still missing.");
  }

  if (!Bun.which("west")) {
    throw new Error("west is required to continue but is still missing.");
  }

  context.logger.success("Dependency bootstrap checks finished.");
}

async function checkAndInstallRequirement(
  requirement: ToolRequirement,
  context: InitToolCheckContext,
) {
  const installedPath = Bun.which(requirement.command);
  if (installedPath) {
    if (!requirement.args || requirement.args.length === 0) {
      context.logger.success(`${requirement.name} found (${installedPath})`);
      return;
    }

    try {
      const output = await runCommand(requirement.command, requirement.args, { quiet: true });
      const firstLine = output.split("\n")[0] ?? "version output unavailable";
      context.logger.success(`${requirement.name} found (${firstLine})`);
      return;
    } catch {
      context.logger.success(`${requirement.name} found (${installedPath})`);
      return;
    }
  }

  context.logger.error(`${requirement.name} not found`);
  await offerRequirementInstall(requirement, context);

  if (requirement.requiredForInit && !Bun.which(requirement.command)) {
    throw new Error(`${requirement.name} is required for init.`);
  }
}

async function checkAndInstallNrfConnectDesktop(context: InitToolCheckContext) {
  const appPaths = [
    "/Applications/nRF Connect for Desktop.app",
    resolve(process.env.HOME ?? "", "Applications", "nRF Connect for Desktop.app"),
  ];
  const installedPath = appPaths.find((path) => existsSync(path));
  if (installedPath) {
    context.logger.success(`${NORDIC_APP_DISPLAY_NAME} found (${installedPath})`);
    return;
  }

  context.logger.error(`${NORDIC_APP_DISPLAY_NAME} not found`);
  await offerInstall(
    NORDIC_APP_DISPLAY_NAME,
    ["install", "--cask", "nrf-connect"],
    TOOL_INSTALL_URLS.nrfConnectDesktop,
    context,
  );
}

async function checkAndInstallNrfToolchain(context: InitToolCheckContext) {
  if (!Bun.which("nrfutil")) {
    context.logger.warn(
      `Skipping nRF Connect SDK toolchain check because nrfutil is missing. Expected version: v${REQUIRED_NCS_TOOLCHAIN_VERSION}`,
    );
    return;
  }

  let listOutput = "";
  try {
    listOutput = await runCommand("nrfutil", ["list"], { quiet: true });
  } catch {
    context.logger.warn("Unable to list nrfutil commands. Skipping toolchain check.");
    return;
  }

  if (!/\btoolchain-manager\b/.test(listOutput)) {
    context.logger.error("nrfutil toolchain-manager command not found");
    const shouldInstall = await context.askYesNo(
      yesNoQuestion(
        "Do you want to install nrfutil toolchain-manager now?",
        "nrfutil install toolchain-manager",
      ),
    );
    if (shouldInstall) {
      try {
        context.logger.info("Installing nrfutil toolchain-manager...");
        await runCommand("nrfutil", ["install", "toolchain-manager"], { quiet: false });
        context.logger.success("nrfutil toolchain-manager installed.");
      } catch (err) {
        context.logger.error(String(err));
        return;
      }
    } else {
      context.logger.warn(
        "Install it manually with `nrfutil install toolchain-manager` to manage NCS toolchains.",
      );
      return;
    }
  }

  let toolchains = "";
  try {
    toolchains = await runCommand("nrfutil", ["toolchain-manager", "list"], { quiet: true });
  } catch {
    context.logger.warn("Failed to query installed NCS toolchains.");
    return;
  }

  const hasRequiredVersion = new RegExp(`\\bv?${REQUIRED_NCS_TOOLCHAIN_VERSION}\\b`).test(
    toolchains,
  );
  if (hasRequiredVersion) {
    context.logger.success(`nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} found`);
    return;
  }

  context.logger.error(`nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} not found`);
  const shouldInstall = await context.askYesNo(
    yesNoQuestion(
      `Do you want to install nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} now?`,
      `nrfutil toolchain-manager install --ncs-version v${REQUIRED_NCS_TOOLCHAIN_VERSION}`,
    ),
  );
  if (shouldInstall) {
    try {
      context.logger.info(`Installing NCS toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION}...`);
      await runCommand(
        "nrfutil",
        ["toolchain-manager", "install", "--ncs-version", `v${REQUIRED_NCS_TOOLCHAIN_VERSION}`],
        { quiet: false },
      );
      context.logger.success(
        `nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} installed.`,
      );
    } catch (err) {
      context.logger.error(String(err));
      context.logger.warn(`Reference: ${TOOL_INSTALL_URLS.ncsToolchainInstall}`);
    }
  } else {
    context.logger.warn(
      `Install it manually with: nrfutil toolchain-manager install --ncs-version v${REQUIRED_NCS_TOOLCHAIN_VERSION}`,
    );
  }
}

async function offerRequirementInstall(
  requirement: ToolRequirement,
  context: InitToolCheckContext,
) {
  if (process.platform !== "darwin") {
    context.logger.warn(
      `Install ${requirement.name} from the official source: ${requirement.officialInstallUrl}`,
    );
    return;
  }

  if (!requirement.brewInstall) {
    context.logger.warn(`No Homebrew package configured for ${requirement.name}.`);
    context.logger.warn(`Official install guide: ${requirement.officialInstallUrl}`);
    return;
  }

  await offerInstall(
    requirement.name,
    requirement.brewInstall,
    requirement.officialInstallUrl,
    context,
  );
}

async function offerInstall(
  toolName: string,
  brewInstall: string[],
  officialInstallUrl: string,
  context: InitToolCheckContext,
) {
  if (process.platform !== "darwin") {
    context.logger.warn(`Install ${toolName} from the official source: ${officialInstallUrl}`);
    return;
  }

  const brewPath = await ensureHomebrewAvailable(context);
  if (!brewPath) {
    context.logger.warn(`Official install guide for ${toolName}: ${officialInstallUrl}`);
    return;
  }

  const installCommand = `brew ${brewInstall.join(" ")}`;
  const shouldInstall = await context.askYesNo(
    yesNoQuestion(`Do you want to install ${toolName} now?`, installCommand),
  );
  if (!shouldInstall) {
    return;
  }

  try {
    context.logger.info(`Installing ${toolName} with Homebrew...`);
    await runCommand(brewPath, brewInstall, { quiet: false });
    context.logger.success(`${toolName} installed.`);
  } catch (err) {
    context.logger.error(String(err));
    context.logger.warn(`Official install guide for ${toolName}: ${officialInstallUrl}`);
  }
}

async function ensureHomebrewAvailable(context: InitToolCheckContext) {
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

  context.logger.error("Homebrew is not installed.");
  const shouldInstall = await context.askYesNo(
    yesNoQuestion("Do you want to install Homebrew now?"),
  );
  if (!shouldInstall) {
    context.logger.warn("Homebrew is required for automatic dependency installation on macOS.");
    context.logger.warn(`Install it from: ${TOOL_INSTALL_URLS.homebrew}`);
    cachedBrewPath = null;
    return null;
  }

  try {
    context.logger.info("Installing Homebrew...");
    await runCommand(
      "/bin/bash",
      ["-c", `NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL ${HOMEBREW_INSTALL_SCRIPT_URL})"`],
      { quiet: false },
    );
  } catch (err) {
    context.logger.error(String(err));
    context.logger.warn(`Install Homebrew manually from: ${TOOL_INSTALL_URLS.homebrew}`);
    cachedBrewPath = null;
    return null;
  }

  const installed = detectBrewPath();
  if (installed) {
    context.logger.success(`Homebrew installed (${installed})`);
    cachedBrewPath = installed;
    return installed;
  }

  context.logger.warn("Homebrew installation completed but `brew` is not yet available in PATH.");
  context.logger.warn("Restart your shell and rerun `tiresias init`.");
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
