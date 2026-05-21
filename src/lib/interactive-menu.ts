export type InteractiveMenuItem = {
  label: string;
  description: string;
  action: "command" | "config" | "update" | "exit";
  args?: string[];
};

export const INTERACTIVE_MENU_ITEMS: InteractiveMenuItem[] = [
  {
    label: "Doctor",
    description: "Check development environment",
    action: "command",
    args: ["doctor"],
  },
  {
    label: "Init",
    description: "Initialize workspace and boards repositories",
    action: "command",
    args: ["init"],
  },
  {
    label: "Update",
    description: "Update firmware and boards repositories",
    action: "update",
  },
  {
    label: "Config",
    description: "Show or update persisted CLI configuration",
    action: "config",
  },
  {
    label: "Help",
    description: "Show command help",
    action: "command",
    args: ["--help"],
  },
  {
    label: "Exit",
    description: "Leave without running a command",
    action: "exit",
  },
];

export const UPDATE_MENU_ITEMS: InteractiveMenuItem[] = [
  {
    label: "Firmware + boards",
    description: "Pull latest changes in both repositories",
    action: "command",
    args: ["update"],
  },
  {
    label: "Firmware only",
    description: "Pull latest tiresias-fw changes",
    action: "command",
    args: ["update", "--target", "firmware"],
  },
  {
    label: "Boards only",
    description: "Pull latest boards changes",
    action: "command",
    args: ["update", "--target", "boards"],
  },
  {
    label: "Dry run",
    description: "Check for upstream changes without pulling",
    action: "command",
    args: ["update", "--dry-run"],
  },
  {
    label: "Back",
    description: "Return to main menu",
    action: "exit",
  },
];

export const CONFIG_MENU_ITEMS: InteractiveMenuItem[] = [
  {
    label: "Show config",
    description: "Print config file path and contents",
    action: "command",
  },
  {
    label: "Update config",
    description: "Edit one persisted path",
    action: "command",
  },
  {
    label: "Back",
    description: "Return to main menu",
    action: "exit",
  },
];

export const CONFIG_UPDATE_MENU_ITEMS: InteractiveMenuItem[] = [
  {
    label: "Workspace",
    description: "Update workspacePath",
    action: "command",
    args: ["workspacePath"],
  },
  {
    label: "Boards",
    description: "Update boardsPath",
    action: "command",
    args: ["boardsPath"],
  },
  {
    label: "SigmaStudio",
    description: "Update sigmaPath",
    action: "command",
    args: ["sigmaPath"],
  },
  {
    label: "Back",
    description: "Return to config menu",
    action: "exit",
  },
];

const CLEAR_SCREEN = "\x1b[2J\x1b[H";

export function moveSelection(current: number, direction: -1 | 1, total: number) {
  if (total <= 0) {
    return 0;
  }
  return (current + direction + total) % total;
}

export function renderInteractiveMenu(
  selectedIndex: number,
  items: InteractiveMenuItem[] = INTERACTIVE_MENU_ITEMS,
  title = "Welcome to Tiresias CLI",
) {
  const lines = [title, "", "Use ↑/↓ to move, Enter or Space to select, q to exit.", ""];
  const labelWidth = items.length > 0 ? Math.max(...items.map((item) => item.label.length)) + 2 : 0;

  for (const [index, item] of items.entries()) {
    const marker = index === selectedIndex ? ">" : " ";
    lines.push(`${marker} ${item.label.padEnd(labelWidth)} ${item.description}`);
  }

  return `${lines.join("\n")}\n`;
}

export async function promptInteractiveMenu(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
  items: InteractiveMenuItem[] = INTERACTIVE_MENU_ITEMS,
  title?: string,
) {
  if (!input.isTTY || !output.isTTY) {
    return null;
  }

  let selectedIndex = 0;
  const render = () =>
    output.write(`${CLEAR_SCREEN}${renderInteractiveMenu(selectedIndex, items, title)}`);

  return new Promise<InteractiveMenuItem | null>((resolve) => {
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };

    const finish = (item: InteractiveMenuItem | null) => {
      cleanup();
      resolve(item);
    };

    const onData = (chunk: Buffer) => {
      const key = chunk.toString("utf8");

      if (key === "\u0003") {
        finish(null);
        process.exitCode = 130;
        return;
      }

      if (key === "\x1B[A") {
        selectedIndex = moveSelection(selectedIndex, -1, items.length);
        render();
        return;
      }

      if (key === "\x1B[B") {
        selectedIndex = moveSelection(selectedIndex, 1, items.length);
        render();
        return;
      }

      if (key === "\r" || key === "\n" || key === " ") {
        finish(items[selectedIndex] ?? null);
        return;
      }

      if (key.toLowerCase() === "q") {
        finish(null);
      }
    };

    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
    render();
  });
}
