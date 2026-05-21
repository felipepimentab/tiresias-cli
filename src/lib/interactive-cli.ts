import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { getConfigFilePath, type TiresiasConfig, updateConfig } from "./config";
import {
  CONFIG_MENU_ITEMS,
  CONFIG_UPDATE_MENU_ITEMS,
  INTERACTIVE_MENU_ITEMS,
  promptInteractiveMenu,
  UPDATE_MENU_ITEMS,
} from "./interactive-menu";
import { info, success, warn } from "./logger";

type ConfigKey = keyof Pick<TiresiasConfig, "workspacePath" | "boardsPath" | "sigmaPath">;

const CONFIG_LABELS: Record<ConfigKey, string> = {
  workspacePath: "workspace path",
  boardsPath: "boards path",
  sigmaPath: "SigmaStudio export path",
};

export async function runInteractiveCli() {
  while (true) {
    const selectedItem = await promptInteractiveMenu(
      process.stdin,
      process.stdout,
      INTERACTIVE_MENU_ITEMS,
    );

    if (!selectedItem || selectedItem.action === "exit") {
      process.exit(process.exitCode ?? 0);
    }

    if (selectedItem.action === "config") {
      await runInteractiveConfigMenu();
      continue;
    }

    if (selectedItem.action === "update") {
      await runInteractiveUpdateMenu();
      continue;
    }

    await runCliCommand(selectedItem.args ?? []);
  }
}

async function runInteractiveUpdateMenu() {
  const selectedItem = await promptInteractiveMenu(
    process.stdin,
    process.stdout,
    UPDATE_MENU_ITEMS,
    [
      "Update Repositories",
      "",
      "Pull firmware and board-definition changes, or check whether either repository is behind upstream.",
    ].join("\n"),
  );

  if (!selectedItem || selectedItem.action === "exit") {
    return;
  }

  await runCliCommand(selectedItem.args ?? []);
}

async function runInteractiveConfigMenu() {
  while (true) {
    const selectedItem = await promptInteractiveMenu(
      process.stdin,
      process.stdout,
      CONFIG_MENU_ITEMS,
      "Tiresias CLI Config",
    );

    if (!selectedItem || selectedItem.action === "exit") {
      return;
    }

    if (selectedItem.label === "Show config") {
      await showConfigFileContents();
      await waitForEnter();
      continue;
    }

    if (selectedItem.label === "Update config") {
      await runInteractiveConfigUpdateMenu();
    }
  }
}

async function runInteractiveConfigUpdateMenu() {
  const selectedItem = await promptInteractiveMenu(
    process.stdin,
    process.stdout,
    CONFIG_UPDATE_MENU_ITEMS,
    "Update Config",
  );

  if (!selectedItem || selectedItem.action === "exit") {
    return;
  }

  const key = selectedItem.args?.[0] as ConfigKey | undefined;
  if (!key) {
    return;
  }

  const value = await promptText(`Enter ${CONFIG_LABELS[key]}: `);
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    warn("No value entered. Configuration was not changed.");
    await waitForEnter();
    return;
  }

  await updateConfig({ [key]: resolve(trimmedValue) });
  success("Configuration saved.");
  info(`Config file: ${getConfigFilePath()}`);
  await waitForEnter();
}

async function showConfigFileContents() {
  const configPath = getConfigFilePath();
  info(`Config file: ${configPath}`);

  if (!existsSync(configPath)) {
    warn("Config file does not exist yet.");
    return;
  }

  const content = await readFile(configPath, "utf8");
  process.stdout.write(`${content.trimEnd()}\n`);
}

async function runCliCommand(args: string[]) {
  const executable = process.argv[1];
  if (!executable) {
    warn("Could not determine CLI entrypoint.");
    await waitForEnter();
    return;
  }

  const proc = Bun.spawn({
    cmd: [process.execPath, executable, ...args],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
  await waitForEnter();
}

async function promptText(question: string) {
  const rl = createInterface({ input, output });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function waitForEnter() {
  await promptText("Press Enter to return to the menu.");
}
