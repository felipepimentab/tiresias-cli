import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import { readConfig, updateConfig } from "../lib/config";
import {
  BOARDS_REPO_URL,
  COMMON_TOOL_REQUIREMENTS,
  DEFAULT_BOARDS_DIRECTORY_NAME,
  NORDIC_APP_DISPLAY_NAME,
  REQUIRED_NCS_TOOLCHAIN_VERSION,
  TOOL_INSTALL_URLS,
  type ToolRequirement,
} from "../lib/constants";
import { configureEditorBoardRoots } from "../lib/editor-settings";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";
import {
  describeResolvedPath,
  type PathSource,
  resolveBoardsPath,
  resolveWorkspacePath,
} from "../lib/path-resolution";
import { createAskYesNo, yesNoQuestion } from "../lib/prompts";

type DoctorOptions = {
  workspace?: string;
  boardsPath?: string;
  json?: boolean;
};

type CheckStatus = "ok" | "warn" | "error" | "skipped";

type CheckResult = {
  id: string;
  status: CheckStatus;
  message: string;
};

type DoctorReport = {
  command: "doctor";
  generatedAt: string;
  checks: CheckResult[];
  paths: {
    workspacePath: { value: string | null; source: PathSource | null };
    boardsPath: { value: string | null; source: PathSource | null };
  };
  overallStatus: "ok" | "error";
};

type DoctorContext = {
  json: boolean;
  interactive: boolean;
  checks: CheckResult[];
  askYesNo: ReturnType<typeof createAskYesNo>;
};

export function registerDoctor(program: Command) {
  program
    .command("doctor")
    .description("Check development environment")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-B, --boards-path <path>", "Path to boards repository (outside workspace)")
    .option("--json", "Output structured JSON report and skip interactive actions", false)
    .action(async (options: DoctorOptions) => {
      const ctx: DoctorContext = {
        json: options.json ?? false,
        interactive: !(options.json ?? false),
        checks: [],
        askYesNo: createAskYesNo({
          warn: (message) => emit(ctx, "warn", message),
        }),
      };

      emit(ctx, "info", "Checking environment...");
      const config = await readConfig();

      for (const check of COMMON_TOOL_REQUIREMENTS) {
        await checkTool(check, ctx);
      }

      await checkNrfConnectDesktop(ctx);
      await checkNrfToolchainVersion(ctx);

      const workspaceResolution = await resolveWorkspacePath({
        fromFlag: options.workspace,
        fromConfig: config.workspacePath,
      });
      emit(ctx, "info", describeResolvedPath("workspace path", workspaceResolution));

      if (!workspaceResolution.path) {
        emit(
          ctx,
          "warn",
          "Could not determine west workspace automatically. Use --workspace or set TIRESIAS_WORKSPACE.",
        );
      }

      const workspaceIsValid = workspaceResolution.path
        ? checkWorkspace(workspaceResolution.path, ctx)
        : false;
      if (workspaceResolution.path && workspaceIsValid) {
        await updateConfig({ workspacePath: workspaceResolution.path });
      }

      const boardsResolution = resolveBoardsPath({
        fromFlag: options.boardsPath,
        fromConfig: config.boardsPath,
        workspacePath: workspaceResolution.path,
      });
      emit(ctx, "info", describeResolvedPath("boards path", boardsResolution));

      if (!boardsResolution.path) {
        emit(
          ctx,
          "warn",
          "Boards repository path could not be determined. Use --boards-path or set TIRESIAS_BOARDS_PATH.",
        );
      }

      const boardsPath = await checkBoardsPath(
        boardsResolution.path,
        workspaceResolution.path,
        ctx,
      );
      if (boardsPath) {
        await updateConfig({ boardsPath });
        if (!ctx.json) {
          await configureEditorBoardRoots({
            boardsPath,
            askYesNo: ctx.askYesNo,
            logger: {
              info: (message) => emit(ctx, "info", message),
              success: (message) => emit(ctx, "ok", message),
              warn: (message) => emit(ctx, "warn", message),
              error: (message) => emit(ctx, "error", message),
            },
          });
        }
      }

      emit(ctx, "info", "Done.");
      if (ctx.json) {
        const report = buildJsonReport(ctx, workspaceResolution, boardsResolution);
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      }
    });
}

function buildJsonReport(
  ctx: DoctorContext,
  workspaceResolution: Awaited<ReturnType<typeof resolveWorkspacePath>>,
  boardsResolution: ReturnType<typeof resolveBoardsPath>,
): DoctorReport {
  const hasErrors = ctx.checks.some((check) => check.status === "error");
  return {
    command: "doctor",
    generatedAt: new Date().toISOString(),
    checks: ctx.checks,
    paths: {
      workspacePath: { value: workspaceResolution.path, source: workspaceResolution.source },
      boardsPath: { value: boardsResolution.path, source: boardsResolution.source },
    },
    overallStatus: hasErrors ? "error" : "ok",
  };
}

async function checkTool(check: ToolRequirement, ctx: DoctorContext) {
  const installedPath = Bun.which(check.command);
  if (!installedPath) {
    emit(ctx, "error", `${check.name} not found`, check.id);
    await offerInstall(check, ctx);
    return;
  }

  if (!check.args || check.args.length === 0) {
    emit(ctx, "ok", `${check.name} found (${installedPath})`, check.id);
    return;
  }

  try {
    const output = await runCommand(check.command, check.args, { quiet: true });
    const firstLine = output.split("\n")[0] ?? "version output unavailable";
    emit(ctx, "ok", `${check.name} found (${firstLine})`, check.id);
  } catch {
    emit(ctx, "ok", `${check.name} found (${installedPath})`, check.id);
  }
}

async function checkNrfConnectDesktop(ctx: DoctorContext) {
  const appPaths = [
    "/Applications/nRF Connect for Desktop.app",
    resolve(process.env.HOME ?? "", "Applications", "nRF Connect for Desktop.app"),
  ];
  const installedPath = appPaths.find((path) => existsSync(path));
  if (installedPath) {
    emit(ctx, "ok", `${NORDIC_APP_DISPLAY_NAME} found (${installedPath})`, "nrf-connect-desktop");
    return;
  }

  const check: ToolRequirement = {
    id: "nrf-connect-desktop",
    name: NORDIC_APP_DISPLAY_NAME,
    command: "nrf-connect",
    brewInstall: ["install", "--cask", "nrf-connect"],
    officialInstallUrl: TOOL_INSTALL_URLS.nrfConnectDesktop,
  };

  emit(ctx, "error", `${NORDIC_APP_DISPLAY_NAME} not found`, check.id);
  await offerInstall(check, ctx);
}

async function checkNrfToolchainVersion(ctx: DoctorContext) {
  if (!Bun.which("nrfutil")) {
    emit(
      ctx,
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
    emit(
      ctx,
      "warn",
      "Unable to list nrfutil commands. Skipping toolchain version check.",
      "ncs-toolchain",
    );
    return;
  }

  if (!/\btoolchain-manager\b/.test(listOutput)) {
    emit(ctx, "error", "nrfutil toolchain-manager command not found", "ncs-toolchain");
    const shouldInstall = await promptForAction(
      ctx,
      yesNoQuestion(
        "Do you want to install nrfutil toolchain-manager now?",
        "nrfutil install toolchain-manager",
      ),
      "Toolchain manager install prompt was skipped.",
    );
    if (shouldInstall) {
      try {
        emit(ctx, "info", "Installing nrfutil toolchain-manager...");
        await runCommand("nrfutil", ["install", "toolchain-manager"], { quiet: false });
        emit(ctx, "ok", "nrfutil toolchain-manager installed.", "ncs-toolchain");
      } catch (err) {
        emit(ctx, "error", String(err), "ncs-toolchain");
        return;
      }
    } else {
      emit(
        ctx,
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
      emit(
        ctx,
        "ok",
        `nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} found`,
        "ncs-toolchain",
      );
      return;
    }

    emit(
      ctx,
      "error",
      `nRF Connect SDK toolchain v${REQUIRED_NCS_TOOLCHAIN_VERSION} not found`,
      "ncs-toolchain",
    );
    emit(
      ctx,
      "warn",
      `Install it with: nrfutil toolchain-manager install --ncs-version v${REQUIRED_NCS_TOOLCHAIN_VERSION}`,
      "ncs-toolchain",
    );
    emit(ctx, "warn", `Reference: ${TOOL_INSTALL_URLS.ncsToolchainInstall}`, "ncs-toolchain");
  } catch (err) {
    emit(
      ctx,
      "error",
      `Failed to check toolchains via nrfutil toolchain-manager: ${String(err)}`,
      "ncs-toolchain",
    );
  }
}

async function offerInstall(check: ToolRequirement, ctx: DoctorContext) {
  if (ctx.json) {
    return;
  }

  if (process.platform !== "darwin") {
    emit(
      ctx,
      "warn",
      `Install ${check.name} from the official source: ${check.officialInstallUrl}`,
      check.id,
    );
    return;
  }

  if (!Bun.which("brew")) {
    emit(
      ctx,
      "warn",
      `Homebrew is not installed. Install it from ${TOOL_INSTALL_URLS.homebrew} and retry.`,
      check.id,
    );
    emit(
      ctx,
      "warn",
      `Official install guide for ${check.name}: ${check.officialInstallUrl}`,
      check.id,
    );
    return;
  }

  if (!check.brewInstall) {
    emit(ctx, "warn", `No Homebrew package configured for ${check.name}.`, check.id);
    emit(ctx, "warn", `Official install guide: ${check.officialInstallUrl}`, check.id);
    return;
  }

  const installCommand = `brew ${check.brewInstall.join(" ")}`;
  const shouldInstall = await promptForAction(
    ctx,
    yesNoQuestion(`Do you want to install ${check.name} now?`, installCommand),
    `${check.name} install prompt was skipped.`,
  );
  if (!shouldInstall) {
    return;
  }

  try {
    emit(ctx, "info", `Installing ${check.name} with Homebrew...`, check.id);
    await runCommand("brew", check.brewInstall, { quiet: false });
    emit(ctx, "ok", `${check.name} installed.`, check.id);
  } catch (err) {
    emit(ctx, "error", String(err), check.id);
  }
}

function checkWorkspace(workspacePath: string, ctx: DoctorContext) {
  if (!existsSync(workspacePath)) {
    emit(ctx, "error", `workspace not found (${workspacePath})`, "workspace");
    return false;
  }

  const westDir = resolve(workspacePath, ".west");
  if (!existsSync(westDir)) {
    emit(ctx, "error", `invalid west workspace (${workspacePath})`, "workspace");
    return false;
  }

  emit(ctx, "ok", `west workspace found (${workspacePath})`, "workspace");
  return true;
}

async function checkBoardsPath(
  boardsPath: string | null,
  workspacePath: string | null,
  ctx: DoctorContext,
) {
  if (!boardsPath) {
    return null;
  }

  if (!existsSync(boardsPath)) {
    emit(ctx, "error", `boards repository not found (${boardsPath})`, "boards");
    if (workspacePath) {
      emit(
        ctx,
        "warn",
        `Expected location: ${resolve(workspacePath, "..", DEFAULT_BOARDS_DIRECTORY_NAME)}`,
        "boards",
      );
    }
    const shouldClone = await promptForAction(
      ctx,
      yesNoQuestion("Do you want to clone tiresias-boards automatically now?"),
      "Boards clone prompt was skipped.",
    );
    if (shouldClone) {
      const cloned = await cloneBoardsRepository(boardsPath, ctx);
      if (cloned) {
        return boardsPath;
      }
    }
    return null;
  }

  if (workspacePath && isInsideDirectory(boardsPath, workspacePath)) {
    emit(ctx, "error", "boards repository should be outside the west workspace", "boards");
    emit(
      ctx,
      "warn",
      `Move boards repo to: ${resolve(workspacePath, "..", DEFAULT_BOARDS_DIRECTORY_NAME)}`,
      "boards",
    );
    return null;
  }

  emit(ctx, "ok", `boards repository found (${boardsPath})`, "boards");
  return boardsPath;
}

async function promptForAction(ctx: DoctorContext, question: string, context: string) {
  if (!ctx.interactive) {
    emit(ctx, "skipped", context, "prompt");
    return false;
  }
  return ctx.askYesNo(question);
}

async function cloneBoardsRepository(boardsPath: string, ctx: DoctorContext) {
  try {
    emit(ctx, "info", `Cloning tiresias-boards into ${boardsPath}...`, "boards");
    await runCommand("git", ["clone", BOARDS_REPO_URL, boardsPath], { quiet: false });
    emit(ctx, "ok", "tiresias-boards cloned successfully.", "boards");
    return true;
  } catch (err) {
    emit(ctx, "error", String(err), "boards");
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

function emit(
  ctx: DoctorContext,
  level: "info" | "ok" | "warn" | "error" | "skipped",
  message: string,
  id = "doctor",
) {
  if (level !== "info") {
    const statusByLevel: Record<Exclude<typeof level, "info">, CheckStatus> = {
      ok: "ok",
      warn: "warn",
      error: "error",
      skipped: "skipped",
    };
    ctx.checks.push({
      id,
      status: statusByLevel[level],
      message,
    });
  }

  if (ctx.json) {
    return;
  }

  if (level === "info") {
    info(message);
    return;
  }
  if (level === "ok") {
    success(message);
    return;
  }
  if (level === "warn" || level === "skipped") {
    warn(message);
    return;
  }
  error(message);
}
