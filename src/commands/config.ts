import type { Command } from "commander";
import { resolve } from "node:path";
import { getConfigFilePath, readConfig, updateConfig } from "../lib/config";
import { error, info, success, warn } from "../lib/logger";

type SetOptions = {
  workspace?: string;
  boardsPath?: string;
};

export function registerConfig(program: Command) {
  const config = program.command("config").description("Manage persisted Tiresias CLI configuration");

  config
    .command("show")
    .description("Show current persisted configuration")
    .action(async () => {
      const current = await readConfig();
      const configPath = getConfigFilePath();
      info(`Config file: ${configPath}`);
      if (!current.workspacePath && !current.boardsPath) {
        warn("No persisted paths configured yet.");
        return;
      }
      if (current.workspacePath) {
        success(`workspacePath=${current.workspacePath}`);
      }
      if (current.boardsPath) {
        success(`boardsPath=${current.boardsPath}`);
      }
    });

  config
    .command("set")
    .description("Persist workspace and/or boards paths globally")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-B, --boards-path <path>", "Path to tiresias-boards repository")
    .action(async (options: SetOptions) => {
      if (!options.workspace && !options.boardsPath) {
        error("No values provided. Use --workspace and/or --boards-path.");
        process.exit(1);
      }

      await updateConfig({
        workspacePath: options.workspace ? resolve(options.workspace) : undefined,
        boardsPath: options.boardsPath ? resolve(options.boardsPath) : undefined,
      });

      success("Configuration saved.");
      info(`Config file: ${getConfigFilePath()}`);
    });
}
