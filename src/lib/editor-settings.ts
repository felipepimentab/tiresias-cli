import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import JSON5 from "json5";

export const BOARD_ROOTS_TUTORIAL_URL =
  "https://youtu.be/V_dVKgWKILM?si=UypFkBgh_aVOVuQG&t=2629";

type EditorKind = "VS Code" | "Trae";

type EditorSettingsTarget = {
  editor: EditorKind;
  settingsPath: string;
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

export async function configureEditorBoardRoots(options: ConfigureBoardRootsOptions) {
  const boardsPath = resolve(options.boardsPath);
  const targets = detectEditorSettingsTargets();

  if (targets.length === 0) {
    options.logger.warn("Could not detect VS Code or Trae settings for automatic board root setup.");
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
    return;
  }

  for (const target of targets) {
    await configureSingleTarget(target, boardsPath, options);
  }
}

function detectEditorSettingsTargets() {
  const home = process.env.HOME ?? "";
  const appData = process.env.APPDATA ?? "";

  const definitions = getSettingsPathDefinitions(home, appData);
  return definitions.filter((target) => existsSync(dirname(target.settingsPath)));
}

function getSettingsPathDefinitions(home: string, appData: string): EditorSettingsTarget[] {
  if (process.platform === "darwin") {
    return [
      {
        editor: "VS Code",
        settingsPath: resolve(home, "Library", "Application Support", "Code", "User", "settings.json"),
      },
      {
        editor: "Trae",
        settingsPath: resolve(home, "Library", "Application Support", "Trae", "User", "settings.json"),
      },
    ];
  }

  if (process.platform === "win32") {
    const base = appData || resolve(home, "AppData", "Roaming");
    return [
      {
        editor: "VS Code",
        settingsPath: resolve(base, "Code", "User", "settings.json"),
      },
      {
        editor: "Trae",
        settingsPath: resolve(base, "Trae", "User", "settings.json"),
      },
    ];
  }

  return [
    {
      editor: "VS Code",
      settingsPath: resolve(home, ".config", "Code", "User", "settings.json"),
    },
    {
      editor: "Trae",
      settingsPath: resolve(home, ".config", "Trae", "User", "settings.json"),
    },
  ];
}

async function configureSingleTarget(
  target: EditorSettingsTarget,
  boardsPath: string,
  options: ConfigureBoardRootsOptions
) {
  const settings = await loadSettings(target.settingsPath, options.logger);
  if (!settings) {
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
    return;
  }

  const currentBoardRoots = settings[BOARD_ROOTS_KEY];
  if (currentBoardRoots !== undefined && !Array.isArray(currentBoardRoots)) {
    options.logger.error(
      `Cannot update ${target.editor} settings because "${BOARD_ROOTS_KEY}" is not an array (${target.settingsPath}).`
    );
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
    return;
  }

  const boardRoots = (currentBoardRoots as string[] | undefined) ?? [];
  if (boardRoots.includes(boardsPath)) {
    options.logger.success(
      `${target.editor} already contains "${BOARD_ROOTS_KEY}" entry for ${boardsPath}.`
    );
    return;
  }

  const nextBoardRoots = [...boardRoots, boardsPath];
  options.logger.info(`${target.editor} settings detected: ${target.settingsPath}`);
  options.logger.info(`Will write key "${BOARD_ROOTS_KEY}" with value:`);
  options.logger.info(`  ${JSON.stringify(nextBoardRoots)}`);
  options.logger.info(
    "Reason: the nRF Connect extension reads this key to find external board directories."
  );

  const shouldWrite = await options.askYesNo(
    `Do you want to update ${target.editor} settings automatically? [Y/n] `
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
      `${target.editor} settings updated at ${target.settingsPath} (added ${boardsPath}).`
    );
  } catch (err) {
    options.logger.error(`Failed to write ${target.editor} settings: ${String(err)}`);
    options.logger.info(`Manual tutorial: ${BOARD_ROOTS_TUTORIAL_URL}`);
  }
}

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
