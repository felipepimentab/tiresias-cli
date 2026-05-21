#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import { registerConfig } from "./commands/config";
import { registerDoctor } from "./commands/doctor";
import { registerInit } from "./commands/init";
import { registerUpdate } from "./commands/update";
import { APP_NAME } from "./lib/constants";
import { runInteractiveCli } from "./lib/interactive-cli";
import { configureLogger } from "./lib/logger";

const program = new Command();

/**
 * Main CLI entrypoint.
 * Registers all command modules and delegates argument parsing to Commander.
 */
program
  .name(APP_NAME)
  .description("Interactive Tiresias firmware development environment helper")
  .version(packageJson.version)
  .option("--verbose", "Enable verbose logs for explicit or menu-run commands", false)
  .option("--quiet", "Reduce explicit or menu-run command output to warnings/errors only", false)
  .addHelpText(
    "after",
    [
      "",
      "Interactive mode:",
      "  Run `tiresias` without a command to open the keyboard-driven main menu.",
      "  Use arrow keys to choose doctor, init, update, config, help, or exit.",
      "  Commands selected from the menu return to the menu after they finish.",
    ].join("\n"),
  );

program.hook("preAction", (_, actionCommand) => {
  const options = actionCommand.optsWithGlobals();
  configureLogger({
    verbose: Boolean(options.verbose),
    quiet: Boolean(options.quiet),
  });
});

registerConfig(program);
registerDoctor(program);
registerInit(program);
registerUpdate(program);

if (process.argv.length <= 2) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    program.outputHelp();
    process.exit(0);
  }

  configureLogger({});
  await runInteractiveCli();
} else {
  await program.parseAsync();
}
