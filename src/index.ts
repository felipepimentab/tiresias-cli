#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import { registerConfig } from "./commands/config";
import { registerDoctor } from "./commands/doctor";
import { registerInit } from "./commands/init";
import { registerUpdate } from "./commands/update";
import { APP_NAME } from "./lib/constants";

const program = new Command();

program
  .name(APP_NAME)
  .description("Tiresias firmware development environment checker")
  .version(packageJson.version);

registerConfig(program);
registerDoctor(program);
registerInit(program);
registerUpdate(program);

await program.parseAsync();
