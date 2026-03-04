import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, posix, resolve, win32 } from "node:path";
import JSON5 from "json5";
import { BOARD_ROOTS_TUTORIAL_URL } from "./constants";

type EditorKind = "VS Code" | "Trae";

type EditorSettingsTarget = {
  editor: EditorKind;
  settingsPath: string;
};

type EditorCommand = {
  editor: EditorKind;
  command: string;
};

type Logger = {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type ConfigureBoardRootsOptions = {
  boardsPath: string;
  askYesNo: (question: string) => Promise<boolean>;
  logger: Logger;
};

const BOARD_ROOTS_KEY = "nrf-connect.boardRoots";

/**
 * Adds boards path entries to detected editor settings files (VS Code and/or Trae)
 * after explicit user confirmation.
 */
export async function configureEditorBoardRoots(options: ConfigureBoardRootsOptions) {
  const boardsPath = resolve(options.boardsPath);
  const targets = detectEditorSettingsTargets();

  if (targets.length === 0) {
    options.logger.warn(
      "Could not detect VS Code or Trae settings for automatic board root setup.",
    );
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
    return;
  }

  for (const target of targets) {
    await configureSingleTarget(target, boardsPath, options);
  }
}

/**
 * Chooses the best editor CLI command to open a workspace path.
 * Priority: terminal hint -> existing settings target -> first detected command.
 */
export function detectPreferredEditorCommand() {
  const termProgram = (process.env.TERM_PROGRAM ?? "").toLowerCase();
  const candidates: EditorCommand[] = [];

  if (Bun.which("code")) {
    candidates.push({ editor: "VS Code", command: "code" });
  }
  if (Bun.which("trae")) {
    candidates.push({ editor: "Trae", command: "trae" });
  }

  if (candidates.length === 0) {
    return null;
  }
  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    return null;
  }

  if (termProgram.includes("vscode")) {
    return candidates.find((candidate) => candidate.editor === "VS Code") ?? firstCandidate;
  }
  if (termProgram.includes("trae")) {
    return candidates.find((candidate) => candidate.editor === "Trae") ?? firstCandidate;
  }

  const settingsTargets = detectEditorSettingsTargets();
  const withExistingSettings = candidates.find((candidate) =>
    settingsTargets.some(
      (target) => target.editor === candidate.editor && existsSync(target.settingsPath),
    ),
  );
  if (withExistingSettings) {
    return withExistingSettings;
  }

  const withDetectedUserDir = candidates.find((candidate) =>
    settingsTargets.some((target) => target.editor === candidate.editor),
  );
  return withDetectedUserDir ?? firstCandidate;
}

function detectEditorSettingsTargets() {
  const home = process.env.HOME ?? "";
  const appData = process.env.APPDATA ?? "";

  const definitions = getSettingsPathDefinitionsForPlatform(process.platform, home, appData);
  return definitions.filter((target) => existsSync(dirname(target.settingsPath)));
}

/**
 * Returns default settings.json locations for each supported platform.
 */
export function getSettingsPathDefinitionsForPlatform(
  platform: NodeJS.Platform,
  home: string,
  appData: string,
): EditorSettingsTarget[] {
  const pathResolver = platform === "win32" ? win32.resolve : posix.resolve;

  if (platform === "darwin") {
    return [
      {
        editor: "VS Code",
        settingsPath: pathResolver(
          home,
          "Library",
          "Application Support",
          "Code",
          "User",
          "settings.json",
        ),
      },
      {
        editor: "Trae",
        settingsPath: pathResolver(
          home,
          "Library",
          "Application Support",
          "Trae",
          "User",
          "settings.json",
        ),
      },
    ];
  }

  if (platform === "win32") {
    const base = appData || pathResolver(home, "AppData", "Roaming");
    return [
      {
        editor: "VS Code",
        settingsPath: pathResolver(base, "Code", "User", "settings.json"),
      },
      {
        editor: "Trae",
        settingsPath: pathResolver(base, "Trae", "User", "settings.json"),
      },
    ];
  }

  return [
    {
      editor: "VS Code",
      settingsPath: pathResolver(home, ".config", "Code", "User", "settings.json"),
    },
    {
      editor: "Trae",
      settingsPath: pathResolver(home, ".config", "Trae", "User", "settings.json"),
    },
  ];
}

/**
 * Applies board-roots update logic for one concrete editor settings file.
 */
async function configureSingleTarget(
  target: EditorSettingsTarget,
  boardsPath: string,
  options: ConfigureBoardRootsOptions,
) {
  const settings = await loadSettings(target.settingsPath, options.logger);
  if (!settings) {
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
    return;
  }

  const currentBoardRoots = settings[BOARD_ROOTS_KEY];
  if (currentBoardRoots !== undefined && !Array.isArray(currentBoardRoots)) {
    options.logger.error(
      `Cannot update ${target.editor} settings because "${BOARD_ROOTS_KEY}" is not an array (${target.settingsPath}).`,
    );
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
    return;
  }

  const boardRoots = (currentBoardRoots as string[] | undefined) ?? [];
  if (boardRoots.includes(boardsPath)) {
    options.logger.success(
      `${target.editor} already contains "${BOARD_ROOTS_KEY}" entry for ${boardsPath}.`,
    );
    return;
  }

  const nextBoardRoots = [...boardRoots, boardsPath];
  options.logger.info(`${target.editor} settings detected: ${target.settingsPath}`);
  options.logger.info(`Will write key "${BOARD_ROOTS_KEY}" with value:`);
  options.logger.info(`  ${JSON.stringify(nextBoardRoots)}`);
  options.logger.info(
    "Reason: the nRF Connect extension reads this key to find external board directories.",
  );

  const shouldWrite = await options.askYesNo(
    `Do you want to update ${target.editor} settings automatically? [Y/n] `,
  );
  if (!shouldWrite) {
    options.logger.warn(`Skipped automatic update for ${target.editor}.`);
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
    return;
  }

  settings[BOARD_ROOTS_KEY] = nextBoardRoots;

  try {
    await mkdir(dirname(target.settingsPath), { recursive: true });
    await writeFile(target.settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    options.logger.success(
      `${target.editor} settings updated at ${target.settingsPath} (added ${boardsPath}).`,
    );
  } catch (err) {
    options.logger.error(`Failed to write ${target.editor} settings: ${String(err)}`);
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
  }
}

/**
 * Loads and parses settings content using JSON5 (to support JSONC-like files).
 */
async function loadSettings(path: string, logger: Pick<Logger, "error">) {
  if (!existsSync(path)) {
    return {} as Record<string, unknown>;
  }

  try {
    const raw = await readFile(path, "utf8");
    if (!raw.trim()) {
      return {} as Record<string, unknown>;
    }
    const parsed = JSON5.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      logger.error(`Settings file must contain a JSON object: ${path}`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    logger.error(`Failed to parse settings file (${path}): ${String(err)}`);
    return null;
  }
}
