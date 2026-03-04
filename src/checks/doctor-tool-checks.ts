import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMMON_TOOL_REQUIREMENTS,
  NORDIC_APP_DISPLAY_NAME,
  REQUIRED_NCS_TOOLCHAIN_VERSION,
  TOOL_INSTALL_URLS,
  type ToolRequirement,
} from "../lib/constants";
import { runCommand } from "../lib/exec";
import { yesNoQuestion } from "../lib/prompts";

type EmitLevel = "info" | "ok" | "warn" | "error" | "skipped";

type DoctorToolContext = {
  json: boolean;
  emit: (level: EmitLevel, message: string, id?: string) => void;
  promptForAction: (question: string, context: string) => Promise<boolean>;
};

/**
 * Runs host-tool and NCS-specific toolchain checks used by `doctor`.
 */
export async function runDoctorToolChecks(context: DoctorToolContext) {
  for (const check of COMMON_TOOL_REQUIREMENTS) {
    await checkTool(check, context);
  }

  await checkNrfConnectDesktop(context);
  await checkNrfToolchainVersion(context);
}

async function checkTool(check: ToolRequirement, context: DoctorToolContext) {
  const installedPath = Bun.which(check.command);
  if (!installedPath) {
    context.emit("error", `${check.name} not found`, check.id);
    await offerInstall(check, context);
    return;
  }

  if (!check.args || check.args.length === 0) {
    context.emit("ok", `${check.name} found (${installedPath})`, check.id);
    return;
  }

  try {
    const output = await runCommand(check.command, check.args, { quiet: true });
    const firstLine = output.split("\n")[0] ?? "version output unavailable";
    context.emit("ok", `${check.name} found (${firstLine})`, check.id);
  } catch {
    context.emit("ok", `${check.name} found (${installedPath})`, check.id);
  }
}

async function checkNrfConnectDesktop(context: DoctorToolContext) {
  const appPaths = [
    "/Applications/nRF Connect for Desktop.app",
    resolve(process.env.HOME ?? "", "Applications", "nRF Connect for Desktop.app"),
  ];
  const installedPath = appPaths.find((path) => existsSync(path));
  if (installedPath) {
    context.emit(
      "ok",
      `${NORDIC_APP_DISPLAY_NAME} found (${installedPath})`,
      "nrf-connect-desktop",
    );
    return;
  }

  const check: ToolRequirement = {
    id: "nrf-connect-desktop",
    name: NORDIC_APP_DISPLAY_NAME,
    command: "nrf-connect",
    brewInstall: ["install", "--cask", "nrf-connect"],
    officialInstallUrl: TOOL_INSTALL_URLS.nrfConnectDesktop,
  };

  context.emit("error", `${NORDIC_APP_DISPLAY_NAME} not found`, check.id);
  await offerInstall(check, context);
}

async function checkNrfToolchainVersion(context: DoctorToolContext) {
  if (!Bun.which("nrfutil")) {
    context.emit(
      "warn",
      `Skipping nRF Connect SDK toolchain check (requires nrfutil and toolchain-manager). Expected version: v${REQUIRED_NCS_TOOLCHAIN_VERSION}`,
      "ncs-toolchain",
    );
    return;
  }

  let listOutput = "";
  try {
    listOutput = await runCommand("nrfutil", ["list"], { quiet: true });
  } catch {
    context.emit(
      "warn",
      "Unable to list nrfutil commands. Skipping toolchain version check.",
      "ncs-toolchain",
    );
    return;
  }

  if (!/\btoolchain-manager\b/.test(listOutput)) {
    context.emit("error", "nrfutil toolchain-manager command not found", "ncs-toolchain");
    const shouldInstall = await context.promptForAction(
      yesNoQuestion(
        "Do you want to install nrfutil toolchain-manager now?",
        "nrfutil install toolchain-manager",
      ),
      "Toolchain manager install prompt was skipped.",
    );
    if (shouldInstall) {
      try {
        context.emit("info", "Installing nrfutil toolchain-manager...");
        await runCommand("nrfutil", ["install", "toolchain-manager"], { quiet: false });
        context.emit("ok", "nrfutil toolchain-manager installed.", "ncs-toolchain");
      } catch (err) {
        context.emit("error", String(err), "ncs-toolchain");
        return;
      }
    } else {
      context.emit(
        "warn",
        "Install it manually with `nrfutil install toolchain-manager` to verify NCS toolchain versions.",
        "ncs-toolchain",
      );
      return;
    }
  }

  try {
    const toolchains = await runCommand("nrfutil", ["toolchain-manager", "list"], { quiet: true });
    const hasRequiredVersion = new RegExp(`\\bv?${REQUIRED_NCS_TOOLCHAIN_VERSION}\\b`).test(
      toolchains,
    );
    if (hasRequiredVersion) {
      context.emit(
        "ok",
        `nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} found`,
        "ncs-toolchain",
      );
      return;
    }

    context.emit(
      "error",
      `nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} not found`,
      "ncs-toolchain",
    );
    context.emit(
      "warn",
      `Install it with: nrfutil toolchain-manager install --ncs-version v${REQUIRED_NCS_TOOLCHAIN_VERSION}`,
      "ncs-toolchain",
    );
    context.emit("warn", `Reference: ${TOOL_INSTALL_URLS.ncsToolchainInstall}`, "ncs-toolchain");
  } catch (err) {
    context.emit(
      "error",
      `Failed to check toolchains via nrfutil toolchain-manager: ${String(err)}`,
      "ncs-toolchain",
    );
  }
}

async function offerInstall(check: ToolRequirement, context: DoctorToolContext) {
  if (context.json) {
    return;
  }

  if (process.platform !== "darwin") {
    context.emit(
      "warn",
      `Install ${check.name} from the official source: ${check.officialInstallUrl}`,
      check.id,
    );
    return;
  }

  if (!Bun.which("brew")) {
    context.emit(
      "warn",
      `Homebrew is not installed. Install it from ${TOOL_INSTALL_URLS.homebrew} and retry.`,
      check.id,
    );
    context.emit(
      "warn",
      `Official install guide for ${check.name}: ${check.officialInstallUrl}`,
      check.id,
    );
    return;
  }

  if (!check.brewInstall) {
    context.emit("warn", `No Homebrew package configured for ${check.name}.`, check.id);
    context.emit("warn", `Official install guide: ${check.officialInstallUrl}`, check.id);
    return;
  }

  const installCommand = `brew ${check.brewInstall.join(" ")}`;
  const shouldInstall = await context.promptForAction(
    yesNoQuestion(`Do you want to install ${check.name} now?`, installCommand),
    `${check.name} install prompt was skipped.`,
  );
  if (!shouldInstall) {
    return;
  }

  try {
    context.emit("info", `Installing ${check.name} with Homebrew...`, check.id);
    await runCommand("brew", check.brewInstall, { quiet: false });
    context.emit("ok", `${check.name} installed.`, check.id);
  } catch (err) {
    context.emit("error", String(err), check.id);
  }
}
