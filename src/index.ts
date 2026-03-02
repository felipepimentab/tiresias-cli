#!/usr/bin/env bun

import { Command } from "commander";
import packageJson from "../package.json";
import { registerDoctor } from "./commands/doctor";
import { registerInit } from "./commands/init";

const program = new Command();

program
  .name("tiresias")
  .description("Tiresias firmware development environment checker")
  .version(packageJson.version);

registerDoctor(program);
registerInit(program);

await program.parseAsync();
