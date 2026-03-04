import { existsSync } from "node:fs";
import type { Command } from "commander";
import { runDoctorToolChecks } from "../checks/doctor-tool-checks";
import { configureBoardRootsIntegration } from "../checks/editor-integration";
import {
  expectedBoardsPath,
  validateBoardsOutsideWorkspace,
  validateWestWorkspace,
} from "../checks/workspace-checks";
import { readConfig, updateConfig } from "../lib/config";
import { BOARDS_REPO_URL } from "../lib/constants";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";
import {
  describeResolvedPath,
  resolveBoardsPath,
  resolveWorkspacePath,
} from "../lib/path-resolution";
import { createAskYesNo, yesNoQuestion } from "../lib/prompts";
import type { DoctorCheckResult, DoctorCheckStatus, DoctorReport } from "../lib/types";

type DoctorOptions = {
  workspace?: string;
  boardsPath?: string;
  json?: boolean;
};

type DoctorContext = {
  json: boolean;
  interactive: boolean;
  checks: DoctorCheckResult[];
  askYesNo: ReturnType<typeof createAskYesNo>;
};

/**
 * Registers `tiresias doctor`.
 * This command checks tool availability, validates workspace/boards layout,
 * and can emit either human logs or structured JSON.
 */
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

      await runDoctorToolChecks({
        json: ctx.json,
        emit: (level, message, id) => emit(ctx, level, message, id),
        promptForAction: (question, context) => promptForAction(ctx, question, context),
      });

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
          await configureBoardRootsIntegration(boardsPath, ctx.askYesNo, {
            info: (message) => emit(ctx, "info", message),
            success: (message) => emit(ctx, "ok", message),
            warn: (message) => emit(ctx, "warn", message),
            error: (message) => emit(ctx, "error", message),
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

/**
 * Converts runtime check results into a machine-readable report.
 */
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
      workspacePath: workspaceResolution,
      boardsPath: boardsResolution,
    },
    overallStatus: hasErrors ? "error" : "ok",
  };
}

/**
 * Validates west workspace structure by checking for the `.west` directory.
 */
function checkWorkspace(workspacePath: string, ctx: DoctorContext) {
  const result = validateWestWorkspace(workspacePath);
  if (!result.ok) {
    emit(ctx, "error", result.error, "workspace");
    return false;
  }

  emit(ctx, "ok", `west workspace found (${workspacePath})`, "workspace");
  return true;
}

/**
 * Validates boards path location and optionally offers cloning the repository
 * if it is missing.
 */
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
      emit(ctx, "warn", `Expected location: ${expectedBoardsPath(workspacePath)}`, "boards");
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

  const locationCheck = validateBoardsOutsideWorkspace(boardsPath, workspacePath);
  if (!locationCheck.ok) {
    emit(ctx, "error", locationCheck.error, "boards");
    if (locationCheck.moveTarget) {
      emit(ctx, "warn", `Move boards repo to: ${locationCheck.moveTarget}`, "boards");
    }
    return null;
  }

  emit(ctx, "ok", `boards repository found (${boardsPath})`, "boards");
  return boardsPath;
}

/**
 * Wraps prompt usage to keep `--json` output deterministic and non-interactive.
 */
async function promptForAction(ctx: DoctorContext, question: string, context: string) {
  if (!ctx.interactive) {
    emit(ctx, "skipped", context, "prompt");
    return false;
  }
  return ctx.askYesNo(question);
}

/**
 * Clones the boards repository into the provided destination path.
 */
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

/**
 * Central event sink for doctor output.
 * It records check states for JSON mode and emits human-friendly logs otherwise.
 */
function emit(
  ctx: DoctorContext,
  level: "info" | "ok" | "warn" | "error" | "skipped",
  message: string,
  id = "doctor",
) {
  if (level !== "info") {
    const statusByLevel: Record<Exclude<typeof level, "info">, DoctorCheckStatus> = {
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
