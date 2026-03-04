import { describe, expect, it } from "bun:test";
import { getSettingsPathDefinitionsForPlatform } from "../src/lib/editor-settings";

describe("editor settings path detection", () => {
  const home = "/Users/tester";
  const appData = "C:\\Users\\tester\\AppData\\Roaming";

  const cases = [
    {
      name: "darwin paths",
      platform: "darwin" as const,
      expected: [
        "/Users/tester/Library/Application Support/Code/User/settings.json",
        "/Users/tester/Library/Application Support/Trae/User/settings.json",
      ],
    },
    {
      name: "linux paths",
      platform: "linux" as const,
      expected: [
        "/Users/tester/.config/Code/User/settings.json",
        "/Users/tester/.config/Trae/User/settings.json",
      ],
    },
    {
      name: "windows paths",
      platform: "win32" as const,
      expected: [
        "C:\\Users\\tester\\AppData\\Roaming\\Code\\User\\settings.json",
        "C:\\Users\\tester\\AppData\\Roaming\\Trae\\User\\settings.json",
      ],
    },
  ];

  for (const testCase of cases) {
    it(`returns expected ${testCase.name}`, () => {
      const targets = getSettingsPathDefinitionsForPlatform(testCase.platform, home, appData);
      expect(targets.map((target) => target.settingsPath)).toEqual(testCase.expected);
    });
  }
});
