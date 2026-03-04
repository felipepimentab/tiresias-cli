import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { CONFIG_DIRECTORY_NAME, CONFIG_FILE_NAME } from "./constants";

const tiresiasConfigSchema = z
  .object({
    workspacePath: z.string().min(1).optional(),
    boardsPath: z.string().min(1).optional(),
  })
  .strict();

export type TiresiasConfig = z.infer<typeof tiresiasConfigSchema>;

function getConfigDirectory() {
  if (process.env.XDG_CONFIG_HOME) {
    return resolve(process.env.XDG_CONFIG_HOME);
  }
  return resolve(homedir(), ".config");
}

export function getConfigFilePath() {
  return resolve(getConfigDirectory(), CONFIG_DIRECTORY_NAME, CONFIG_FILE_NAME);
}

function parseConfig(content: unknown): TiresiasConfig {
  const parsed = tiresiasConfigSchema.safeParse(content);
  if (!parsed.success) {
    return {};
  }
  return parsed.data;
}

export async function readConfig(): Promise<TiresiasConfig> {
  const configPath = getConfigFilePath();
  if (!existsSync(configPath)) {
    return {};
  }

  const raw = await readFile(configPath, "utf8");
  try {
    return parseConfig(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export async function writeConfig(config: TiresiasConfig) {
  const configPath = getConfigFilePath();
  await mkdir(dirname(configPath), { recursive: true });
  const parsedConfig = parseConfig(config);
  await writeFile(configPath, `${JSON.stringify(parsedConfig, null, 2)}\n`, "utf8");
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
