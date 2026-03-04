import { afterEach, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ensureDir,
  makeTempDir,
  readText,
  removeDir,
  runCli,
  writeExecutable,
} from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    removeDir(tempDirs.pop() as string);
  }
});

function setupFakeDoctorToolchain(baseDir: string) {
  const binDir = resolve(baseDir, "bin");
  const brewLog = resolve(baseDir, "brew.log");
  ensureDir(binDir);

  writeExecutable(
    resolve(binDir, "west"),
    `#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  --version) echo "West version: v1.5.0";;
  topdir) echo "$PWD";;
  *) echo "west-ok";;
esac
`
  );

  writeExecutable(
    resolve(binDir, "cmake"),
    `#!/usr/bin/env bash
echo "cmake version 4.2.3"
`
  );

  writeExecutable(
    resolve(binDir, "python3"),
    `#!/usr/bin/env bash
echo "Python 3.14.3"
`
  );

  writeExecutable(
    resolve(binDir, "nrfutil"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo "nrfutil 8.1.1"
  exit 0
fi
if [[ "\${1:-}" == "list" ]]; then
  echo "toolchain-manager 0.15.0"
  exit 0
fi
if [[ "\${1:-}" == "toolchain-manager" && "\${2:-}" == "list" ]]; then
  echo "v3.0.1 Installed"
  exit 0
fi
if [[ "\${1:-}" == "install" && "\${2:-}" == "toolchain-manager" ]]; then
  echo "installed toolchain-manager"
  exit 0
fi
echo "ok"
`
  );

  writeExecutable(
    resolve(binDir, "JLinkExe"),
    `#!/usr/bin/env bash
echo "SEGGER J-Link Commander"
`
  );

  writeExecutable(
    resolve(binDir, "nrfjprog"),
    `#!/usr/bin/env bash
echo "nrfjprog version: 10.24.2 external"
`
  );

  writeExecutable(
    resolve(binDir, "brew"),
    `#!/usr/bin/env bash
echo "$PWD :: $*" >> "\${BREW_LOG:?}"
exit 0
`
  );

  return { binDir, brewLog };
}

function ensureEditorSettingsDirs(home: string) {
  ensureDir(resolve(home, "Library", "Application Support", "Code", "User"));
  ensureDir(resolve(home, ".config", "Code", "User"));
  ensureDir(resolve(home, "AppData", "Roaming", "Code", "User"));
}

describe("doctor command", () => {
  it("passes with a complete mocked toolchain and valid paths", () => {
    const root = makeTempDir("tiresias-doctor-success-");
    tempDirs.push(root);
    const workspace = resolve(root, "tiresias-workspace");
    const boards = resolve(root, "tiresias-boards");
    const home = resolve(root, "home");
    const xdgConfigHome = resolve(root, "xdg");

    ensureDir(resolve(workspace, ".west"));
    ensureDir(boards);
    ensureDir(resolve(home, "Applications", "nRF Connect for Desktop.app"));
    const { binDir } = setupFakeDoctorToolchain(root);

    const result = runCli(
      ["doctor", "--workspace", workspace, "--boards-path", boards],
      {
        env: {
          HOME: home,
          XDG_CONFIG_HOME: xdgConfigHome,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("nRF Connect SDK toolchain v3.0.1 found");
    expect(result.output).toContain("west workspace found");
    expect(result.output).toContain("boards repository found");
    expect(result.output).toContain("Done.");
  });

  it("prints manual board root tutorial when settings update prompt is declined/skipped", () => {
    const root = makeTempDir("tiresias-doctor-editor-settings-");
    tempDirs.push(root);
    const workspace = resolve(root, "tiresias-workspace");
    const boards = resolve(root, "boards");
    const home = resolve(root, "home");
    const xdgConfigHome = resolve(root, "xdg");

    ensureDir(resolve(workspace, ".west"));
    ensureDir(boards);
    ensureDir(resolve(home, "Applications", "nRF Connect for Desktop.app"));
    ensureEditorSettingsDirs(home);
    const { binDir } = setupFakeDoctorToolchain(root);

    const result = runCli(
      ["doctor", "--workspace", workspace, "--boards-path", boards],
      {
        env: {
          HOME: home,
          XDG_CONFIG_HOME: xdgConfigHome,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Interactive prompt skipped");
    expect(result.output).toContain(
      "https://youtu.be/V_dVKgWKILM?si=UypFkBgh_aVOVuQG&t=2629"
    );
  });

  it("parses JSON5-like editor settings without parse errors", () => {
    const root = makeTempDir("tiresias-doctor-json5-settings-");
    tempDirs.push(root);
    const workspace = resolve(root, "tiresias-workspace");
    const boards = resolve(root, "boards");
    const home = resolve(root, "home");
    const xdgConfigHome = resolve(root, "xdg");
    const vscodeSettings = resolve(
      home,
      "Library",
      "Application Support",
      "Code",
      "User",
      "settings.json"
    );

    ensureDir(resolve(workspace, ".west"));
    ensureDir(boards);
    ensureDir(resolve(home, "Applications", "nRF Connect for Desktop.app"));
    ensureEditorSettingsDirs(home);
    writeFileSync(
      vscodeSettings,
      `{
  // JSONC/JSON5 style content
  editor: {
    formatOnSave: true,
  },
}
`,
      "utf8"
    );
    const { binDir } = setupFakeDoctorToolchain(root);

    const result = runCli(
      ["doctor", "--workspace", workspace, "--boards-path", boards],
      {
        env: {
          HOME: home,
          XDG_CONFIG_HOME: xdgConfigHome,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).not.toContain("Failed to parse settings file");
    expect(result.output).toContain("VS Code settings detected");
  });

  it("warns and skips prompts in non-interactive mode when boards are missing", () => {
    const root = makeTempDir("tiresias-doctor-missing-boards-");
    tempDirs.push(root);
    const workspace = resolve(root, "tiresias-workspace");
    const home = resolve(root, "home");
    const xdgConfigHome = resolve(root, "xdg");
    ensureDir(resolve(workspace, ".west"));
    ensureDir(resolve(home, "Applications", "nRF Connect for Desktop.app"));
    const { binDir } = setupFakeDoctorToolchain(root);

    const missingBoards = resolve(root, "boards-missing");
    const result = runCli(
      ["doctor", "--workspace", workspace, "--boards-path", missingBoards],
      {
        env: {
          HOME: home,
          XDG_CONFIG_HOME: xdgConfigHome,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("boards repository not found");
    expect(result.output).toContain("Interactive prompt skipped");
  });

  it("offers official install guidance when brew is unavailable", () => {
    const root = makeTempDir("tiresias-doctor-no-brew-");
    tempDirs.push(root);
    const workspace = resolve(root, "tiresias-workspace");
    const boards = resolve(root, "tiresias-boards");
    const home = resolve(root, "home");
    const xdgConfigHome = resolve(root, "xdg");
    const binDir = resolve(root, "bin");

    ensureDir(binDir);
    ensureDir(resolve(workspace, ".west"));
    ensureDir(boards);
    ensureDir(resolve(home, "Applications", "nRF Connect for Desktop.app"));

    writeExecutable(
      resolve(binDir, "west"),
      `#!/usr/bin/env bash
echo "West version: v1.5.0"
`
    );
    writeExecutable(
      resolve(binDir, "cmake"),
      `#!/usr/bin/env bash
echo "cmake version 4.2.3"
`
    );
    writeExecutable(
      resolve(binDir, "python3"),
      `#!/usr/bin/env bash
echo "Python 3.14.3"
`
    );
    writeExecutable(
      resolve(binDir, "nrfutil"),
      `#!/usr/bin/env bash
if [[ "\${1:-}" == "--version" ]]; then
  echo "nrfutil 8.1.1"
  exit 0
fi
if [[ "\${1:-}" == "list" ]]; then
  echo "toolchain-manager 0.15.0"
  exit 0
fi
if [[ "\${1:-}" == "toolchain-manager" && "\${2:-}" == "list" ]]; then
  echo "v3.0.1 Installed"
  exit 0
fi
exit 0
`
    );
    writeExecutable(
      resolve(binDir, "nrfjprog"),
      `#!/usr/bin/env bash
echo "nrfjprog version: 10.24.2 external"
`
    );

    const result = runCli(
      ["doctor", "--workspace", workspace, "--boards-path", boards],
      {
        env: {
          HOME: home,
          XDG_CONFIG_HOME: xdgConfigHome,
          PATH: binDir,
        },
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("segger-jlink not found");
    expect(result.output).toContain("Homebrew is not installed");
    expect(result.output).toContain("Official install guide");
  });
});
