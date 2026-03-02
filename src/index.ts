#!/usr/bin/env bun

import { Command } from "commander";
import { registerDoctor } from "./commands/doctor";
import { registerInit } from "./commands/init";

const program = new Command();

program
  .name("tiresias")
  .description("Tiresias firmware development environment checker")
  .version("0.1.0");

registerDoctor(program);
registerInit(program);

await program.parseAsync();
