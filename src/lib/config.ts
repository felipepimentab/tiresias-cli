import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

export type TiresiasConfig = {
  workspacePath?: string;
  boardsPath?: string;
};

function getConfigDirectory() {
  if (process.env.XDG_CONFIG_HOME) {
    return resolve(process.env.XDG_CONFIG_HOME);
  }
  return resolve(homedir(), ".config");
}

export function getConfigFilePath() {
  return resolve(getConfigDirectory(), "tiresias-cli", "config.json");
}

export async function readConfig(): Promise<TiresiasConfig> {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    return {};
  }

  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as TiresiasConfig;
  return parsed;
}

export async function writeConfig(config: TiresiasConfig) {
  const configPath = getConfigFilePath();
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function updateConfig(patch: Partial<TiresiasConfig>) {
  const current = await readConfig();
  const next: TiresiasConfig = { ...current };
  if (patch.workspacePath !== undefined) {
    next.workspacePath = patch.workspacePath;
  }
  if (patch.boardsPath !== undefined) {
    next.boardsPath = patch.boardsPath;
  }
  await writeConfig(next);
}
