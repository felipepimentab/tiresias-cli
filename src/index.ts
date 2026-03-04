#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import { registerConfig } from "./commands/config";
import { registerDoctor } from "./commands/doctor";
import { registerInit } from "./commands/init";
import { registerUpdate } from "./commands/update";
import { APP_NAME } from "./lib/constants";
import { configureLogger } from "./lib/logger";

const program = new Command();

/**
 * Main CLI entrypoint.
 * Registers all command modules and delegates argument parsing to Commander.
 */
program
  .name(APP_NAME)
  .description("Tiresias firmware development environment checker")
  .version(packageJson.version)
  .option("--verbose", "Enable verbose logs for command execution", false)
  .option("--quiet", "Reduce command output to warnings/errors only", false);

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

await program.parseAsync();
