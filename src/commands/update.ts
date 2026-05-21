import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { isGitRepo } from "../checks/workspace-checks";
import { readConfig, updateConfig } from "../lib/config";
import { DEFAULT_BOARDS_DIRECTORY_NAME, FW_REPOSITORY_NAME } from "../lib/constants";
import { runCommand } from "../lib/exec";
import { error, info, success, warn } from "../lib/logger";
import {
  describeResolvedPath,
  resolveBoardsPath,
  resolveSigmaPath,
  resolveWorkspacePath,
} from "../lib/path-resolution";

type UpdateOptions = {
  workspace?: string;
  boardsPath?: string;
  target?: string;
  dryRun?: boolean;
};

type UpdateSigmaOptions = {
  workspace?: string;
  sigmaPath?: string;
};

const SIGMA_TARGET_DIRECTORY = "src/SigmaStudioFiles";

/**
 * Registers `tiresias update` commands:
 * - default action: pull firmware + boards repositories
 * - `sigma`: sync SigmaStudio export files into firmware tree
 */
export function registerUpdate(program: Command) {
  const update = program
    .command("update")
    .description("Pull latest changes for tiresias-fw and boards")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-B, --boards-path <path>", "Path to boards repository (outside workspace)")
    .option("-t, --target <target>", "Repository target to update: all, firmware, or boards", "all")
    .option("--dry-run", "Check for upstream changes without pulling", false)
    .addHelpText(
      "after",
      [
        "",
        "Interactive mode:",
        "  Run `tiresias`, choose Update, then choose both repositories, firmware only,",
        "  boards only, or dry run. SigmaStudio export sync is not part of repository updates.",
      ].join("\n"),
    )
    .action(async (options: UpdateOptions) => {
      await updateRepositories(options);
    });

  update
    .command("sigma")
    .description("Sync SigmaStudio export files into firmware SigmaStudioFiles")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-S, --sigma-path <path>", "Path to SigmaStudio export directory")
    .action(async (options: UpdateSigmaOptions, command) => {
      // Commander may bind duplicated parent/child options to parent in some invocation forms.
      // Prefer explicit sigma flag, then fall back to parsed parent value.
      const inheritedWorkspace = command.parent?.opts()?.workspace as string | undefined;
      await updateSigmaFiles({
        workspace: options.workspace ?? inheritedWorkspace,
        sigmaPath: options.sigmaPath,
      });
    });
}

async function updateRepositories(options: UpdateOptions) {
  const target = parseUpdateTarget(options.target);
  const includeFirmware = target === "all" || target === "firmware";
  const includeBoards = target === "all" || target === "boards";
  const config = await readConfig();
  const workspaceResolution = await resolveWorkspacePath({
    fromFlag: options.workspace,
    fromConfig: config.workspacePath,
  });
  const boardsResolution = resolveBoardsPath({
    fromFlag: options.boardsPath,
    fromConfig: config.boardsPath,
    workspacePath: workspaceResolution.path,
  });

  info(describeResolvedPath("workspace path", workspaceResolution));
  if (includeBoards) {
    info(describeResolvedPath("boards path", boardsResolution));
  }

  if (!workspaceResolution.path) {
    warn(
      "Could not determine west workspace automatically. Use --workspace or set TIRESIAS_WORKSPACE.",
    );
    process.exit(1);
  }
  if (includeBoards && !boardsResolution.path) {
    warn(
      "Boards repository path could not be determined. Use --boards-path or set TIRESIAS_BOARDS_PATH.",
    );
    process.exit(1);
  }

  const workspacePath = workspaceResolution.path;
  const boardsPath = boardsResolution.path;
  const fwRepoPath = resolve(workspacePath, FW_REPOSITORY_NAME);

  if (includeFirmware && !isGitRepo(fwRepoPath)) {
    error(`tiresias-fw repository not found at ${fwRepoPath}`);
    warn(`Expected layout: <workspace>/${FW_REPOSITORY_NAME}`);
    process.exit(1);
  }

  if (includeBoards && (!boardsPath || !isGitRepo(boardsPath))) {
    error(`boards path is not a git repository (${boardsPath})`);
    warn(`Expected boards directory path (for example: ../${DEFAULT_BOARDS_DIRECTORY_NAME}).`);
    process.exit(1);
  }

  try {
    if (includeFirmware) {
      if (options.dryRun) {
        await checkRepositoryOutdated("tiresias-fw", fwRepoPath);
      } else {
        info(`Updating tiresias-fw in ${fwRepoPath}...`);
        await runCommand("git", ["pull"], { cwd: fwRepoPath, quiet: false });
        success("tiresias-fw updated.");
      }
    }

    if (includeBoards && boardsPath) {
      if (options.dryRun) {
        await checkRepositoryOutdated("boards", boardsPath);
      } else {
        info(`Updating boards in ${boardsPath}...`);
        await runCommand("git", ["pull"], { cwd: boardsPath, quiet: false });
        success("boards updated.");
      }
    }

    await updateConfig({
      workspacePath,
      boardsPath: includeBoards && boardsPath ? boardsPath : undefined,
    });
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
}

function parseUpdateTarget(target = "all") {
  if (target === "all" || target === "firmware" || target === "boards") {
    return target;
  }

  error(`Invalid update target: ${target}`);
  warn("Use --target all, --target firmware, or --target boards.");
  process.exit(1);
}

async function checkRepositoryOutdated(label: string, repoPath: string) {
  info(`Checking ${label} for upstream changes in ${repoPath}...`);
  await runCommand("git", ["fetch"], { cwd: repoPath, quiet: false });
  const rawBehindCount = await runCommand("git", ["rev-list", "--count", "HEAD..@{u}"], {
    cwd: repoPath,
    quiet: true,
  });
  const behindCount = Number(rawBehindCount.trim() || "0");
  if (behindCount > 0) {
    warn(`${label} is behind upstream by ${behindCount} commit(s).`);
    return;
  }

  success(`${label} is up to date.`);
}

async function updateSigmaFiles(options: UpdateSigmaOptions) {
  const config = await readConfig();
  const workspaceResolution = await resolveWorkspacePath({
    fromFlag: options.workspace,
    fromConfig: config.workspacePath,
  });
  const sigmaResolution = resolveSigmaPath({
    fromFlag: options.sigmaPath,
    fromConfig: config.sigmaPath,
  });

  info(describeResolvedPath("workspace path", workspaceResolution));
  info(describeResolvedPath("sigma path", sigmaResolution));

  if (!workspaceResolution.path) {
    warn(
      "Could not determine west workspace automatically. Use --workspace or set TIRESIAS_WORKSPACE.",
    );
    process.exit(1);
  }
  if (!sigmaResolution.path) {
    warn(
      "SigmaStudio export directory could not be determined. Use --sigma-path or set TIRESIAS_SIGMA_PATH.",
    );
    process.exit(1);
  }

  const workspacePath = workspaceResolution.path;
  const sigmaPath = sigmaResolution.path;
  const fwRepoPath = resolve(workspacePath, FW_REPOSITORY_NAME);
  const sigmaTargetPath = resolve(fwRepoPath, SIGMA_TARGET_DIRECTORY);

  if (!isGitRepo(fwRepoPath)) {
    error(`tiresias-fw repository not found at ${fwRepoPath}`);
    warn(`Expected layout: <workspace>/${FW_REPOSITORY_NAME}`);
    process.exit(1);
  }
  if (!existsSync(sigmaPath)) {
    error(`SigmaStudio export directory not found (${sigmaPath})`);
    process.exit(1);
  }

  try {
    info(`Syncing SigmaStudio export files from ${sigmaPath} into ${sigmaTargetPath}...`);
    await mkdir(sigmaTargetPath, { recursive: true });
    await copyDirectoryContentsExcludingGit(sigmaPath, sigmaTargetPath);
    success("SigmaStudio export files copied.");

    await updateConfig({ workspacePath, sigmaPath });
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
}

async function copyDirectoryContentsExcludingGit(sourceRoot: string, destinationRoot: string) {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }

    const sourcePath = join(sourceRoot, entry.name);
    const destinationPath = join(destinationRoot, entry.name);

    if (entry.isDirectory()) {
      await mkdir(destinationPath, { recursive: true });
      await copyDirectoryContentsExcludingGit(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile()) {
      await mkdir(resolve(destinationPath, ".."), { recursive: true });
      await copyFile(sourcePath, destinationPath);
    }
  }
}
