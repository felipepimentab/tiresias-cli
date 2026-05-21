import { resolve } from "node:path";
import type { Command } from "commander";
import { getConfigFilePath, readConfig, updateConfig } from "../lib/config";
import { error, info, success, warn } from "../lib/logger";

type SetOptions = {
  workspace?: string;
  boardsPath?: string;
  sigmaPath?: string;
};

/**
 * Registers `tiresias config` subcommands used to read and update persisted
 * workspace, boards, and SigmaStudio export paths.
 */
export function registerConfig(program: Command) {
  const config = program
    .command("config")
    .description("Manage persisted config in script mode")
    .addHelpText(
      "after",
      [
        "",
        "Interactive mode:",
        "  Run `tiresias`, choose Config, then choose Show config or Update config.",
        "  Interactive updates prompt for one value at a time and return to the menu.",
      ].join("\n"),
    );

  config
    .command("show")
    .description("Show current persisted configuration summary")
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
      if (current.sigmaPath) {
        success(`sigmaPath=${current.sigmaPath}`);
      }
    });

  config
    .command("set")
    .description("Persist workspace, boards, and/or SigmaStudio export paths")
    .option("-w, --workspace <path>", "West workspace path")
    .option("-B, --boards-path <path>", "Path to boards repository")
    .option("-S, --sigma-path <path>", "Path to SigmaStudio export directory")
    .action(async (options: SetOptions) => {
      if (!options.workspace && !options.boardsPath && !options.sigmaPath) {
        error("No values provided. Use --workspace, --boards-path and/or --sigma-path.");
        process.exit(1);
      }

      await updateConfig({
        workspacePath: options.workspace ? resolve(options.workspace) : undefined,
        boardsPath: options.boardsPath ? resolve(options.boardsPath) : undefined,
        sigmaPath: options.sigmaPath ? resolve(options.sigmaPath) : undefined,
      });

      success("Configuration saved.");
      info(`Config file: ${getConfigFilePath()}`);
    });
}
