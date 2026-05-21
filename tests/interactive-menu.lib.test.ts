import { describe, expect, it } from "bun:test";
import {
  CONFIG_MENU_ITEMS,
  CONFIG_UPDATE_MENU_ITEMS,
  INTERACTIVE_MENU_ITEMS,
  moveSelection,
  renderInteractiveMenu,
  UPDATE_MENU_ITEMS,
} from "../src/lib/interactive-menu";

describe("interactive menu", () => {
  it("wraps selection when moving beyond the menu bounds", () => {
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(2, 1, 3)).toBe(0);
  });

  it("renders command choices with the selected marker", () => {
    const output = renderInteractiveMenu(1);

    expect(output).toContain("Welcome to Tiresias CLI");
    expect(output).toContain("> Init");
    expect(output).toContain("Doctor");
    expect(output).toContain("Config");
  });

  it("keeps main menu command items mapped to command arguments", () => {
    const commandItems = INTERACTIVE_MENU_ITEMS.filter((item) => item.action === "command");

    expect(commandItems.map((item) => item.args)).toContainEqual(["doctor"]);
    expect(commandItems.map((item) => item.args)).toContainEqual(["init"]);
    expect(INTERACTIVE_MENU_ITEMS.find((item) => item.label === "Update")?.action).toBe("update");
    expect(INTERACTIVE_MENU_ITEMS.map((item) => item.label)).not.toContain("Update sigma");
  });

  it("defines update submenu targets", () => {
    expect(UPDATE_MENU_ITEMS.map((item) => item.label)).toEqual([
      "Firmware + boards",
      "Firmware only",
      "Boards only",
      "Dry run",
      "Back",
    ]);
    expect(UPDATE_MENU_ITEMS.map((item) => item.args).filter(Boolean)).toEqual([
      ["update"],
      ["update", "--target", "firmware"],
      ["update", "--target", "boards"],
      ["update", "--dry-run"],
    ]);
  });

  it("defines config submenus for showing and updating known config keys", () => {
    expect(CONFIG_MENU_ITEMS.map((item) => item.label)).toEqual([
      "Show config",
      "Update config",
      "Back",
    ]);
    expect(CONFIG_UPDATE_MENU_ITEMS.map((item) => item.args?.[0]).filter(Boolean)).toEqual([
      "workspacePath",
      "boardsPath",
      "sigmaPath",
    ]);
  });
});
