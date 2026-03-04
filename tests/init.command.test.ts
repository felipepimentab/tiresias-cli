import { afterEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import {
  ensureDir,
  makeTempDir,
  readText,
  removeDir,
  runCli,
  writeExecutable,
  writeJson,
} from "./helpers";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    removeDir(tempDirs.pop() as string);
  }
});

function setupFakeGitAndWest(baseDir: string) {
  const binDir = resolve(baseDir, "bin");
  const westLog = resolve(baseDir, "west.log");
  const gitLog = resolve(baseDir, "git.log");
  ensureDir(binDir);

  writeExecutable(
    resolve(binDir, "west"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "$PWD :: $*" >> "\${WEST_LOG:?}"
cmd="\${1:-}"
if [[ "$cmd" == "init" ]]; then
  workspace="\${@: -1}"
  mkdir -p "$PWD/$workspace/.west"
  mkdir -p "$PWD/$workspace/tiresias-fw/.git"
  exit 0
fi
if [[ "$cmd" == "update" ]]; then
  exit 0
fi
if [[ "$cmd" == "topdir" ]]; then
  echo "$PWD"
  exit 0
fi
exit 0
`,
  );

  writeExecutable(
    resolve(binDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
echo "$PWD :: $*" >> "\${GIT_LOG:?}"
cmd="\${1:-}"
if [[ "$cmd" == "clone" ]]; then
  dest="\${@: -1}"
  mkdir -p "$PWD/$dest/.git"
fi
exit 0
`,
  );

  writeExecutable(
    resolve(binDir, "cmake"),
    `#!/usr/bin/env bash
echo "cmake version 4.2.3"
`,
  );

  writeExecutable(
    resolve(binDir, "python3"),
    `#!/usr/bin/env bash
echo "Python 3.14.3"
`,
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
if [[ "\${1:-}" == "toolchain-manager" && "\${2:-}" == "install" ]]; then
  exit 0
fi
if [[ "\${1:-}" == "install" && "\${2:-}" == "toolchain-manager" ]]; then
  exit 0
fi
echo "ok"
`,
  );

  writeExecutable(
    resolve(binDir, "JLinkExe"),
    `#!/usr/bin/env bash
echo "SEGGER J-Link Commander"
`,
  );

  writeExecutable(
    resolve(binDir, "nrfjprog"),
    `#!/usr/bin/env bash
echo "nrfjprog version: 10.24.2 external"
`,
  );

  return { binDir, westLog, gitLog };
}

describe("init command", () => {
  it("fails when parent directory does not exist", () => {
    const root = makeTempDir("tiresias-init-missing-parent-");
    tempDirs.push(root);
    const missingParent = resolve(root, "nope");
    const xdgConfigHome = resolve(root, "xdg");

    const result = runCli(["init", "--parent", missingParent], {
      env: { XDG_CONFIG_HOME: xdgConfigHome },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("parent directory not found");
  });

  it("blocks when workspace directory already exists and --force is not set", () => {
    const root = makeTempDir("tiresias-init-existing-");
    tempDirs.push(root);
    const parent = resolve(root, "parent");
    const xdgConfigHome = resolve(root, "xdg");
    ensureDir(resolve(parent, "tiresias-workspace"));

    const result = runCli(["init", "--parent", parent], {
      env: { XDG_CONFIG_HOME: xdgConfigHome },
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("workspace directory already exists");
  });

  it("uses --skip-west-update and persists paths to config", () => {
    const root = makeTempDir("tiresias-init-skip-update-");
    tempDirs.push(root);
    const parent = resolve(root, "parent");
    const xdgConfigHome = resolve(root, "xdg");
    const home = resolve(root, "home");
    const { binDir, westLog } = setupFakeGitAndWest(root);

    ensureDir(parent);
    ensureDir(home);
    ensureDir(resolve(home, "Applications", "nRF Connect for Desktop.app"));

    const result = runCli(
      ["init", "--parent", parent, "--workspace-name", "tiresias-workspace", "--skip-west-update"],
      {
        env: {
          HOME: home,
          XDG_CONFIG_HOME: xdgConfigHome,
          WEST_LOG: westLog,
          GIT_LOG: resolve(root, "git.log"),
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Skipping `west update` as requested.");
    expect(result.output).toContain(
      "In the NCS extension, add the application if it is not already added.",
    );
    expect(result.output).toContain("Build with board target: tiresias_dk/nrf5340/cpuapp");

    const westInvocations = readText(westLog);
    expect(westInvocations).toContain("init -m");
    expect(westInvocations).not.toContain(":: update");

    const config = JSON.parse(readText(resolve(xdgConfigHome, "tiresias-cli", "config.json"))) as {
      workspacePath: string;
      boardsPath: string;
    };
    expect(config.workspacePath).toBe(resolve(parent, "tiresias-workspace"));
    expect(config.boardsPath).toBe(resolve(parent, "boards"));
  });

  it("honors config safeguards when another configured workspace already exists", () => {
    const root = makeTempDir("tiresias-init-config-safeguard-");
    tempDirs.push(root);
    const xdgConfigHome = resolve(root, "xdg");
    const existingWorkspace = resolve(root, "existing-workspace");
    const parent = resolve(root, "new-parent");

    ensureDir(resolve(existingWorkspace, "tiresias-fw", ".git"));
    ensureDir(parent);
    writeJson(resolve(xdgConfigHome, "tiresias-cli", "config.json"), {
      workspacePath: existingWorkspace,
    });

    const result = runCli(["init", "--parent", parent], {
      env: { XDG_CONFIG_HOME: xdgConfigHome },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Configured workspace already contains tiresias-fw");
  });

  it("shows install prompt warnings in non-interactive mode when dependencies are missing", () => {
    const root = makeTempDir("tiresias-init-missing-deps-");
    tempDirs.push(root);
    const parent = resolve(root, "parent");
    const xdgConfigHome = resolve(root, "xdg");
    const binDir = resolve(root, "bin");

    ensureDir(parent);
    ensureDir(binDir);

    // Provide only git and west to let init proceed while other deps are missing.
    writeExecutable(
      resolve(binDir, "git"),
      `#!/usr/bin/env bash
if [[ "\${1:-}" == "clone" ]]; then
  dest="\${@: -1}"
  mkdir -p "$PWD/$dest/.git"
fi
exit 0
`,
    );
    writeExecutable(
      resolve(binDir, "west"),
      `#!/usr/bin/env bash
cmd="\${1:-}"
if [[ "$cmd" == "init" ]]; then
  workspace="\${@: -1}"
  mkdir -p "$PWD/$workspace/.west"
  mkdir -p "$PWD/$workspace/tiresias-fw/.git"
  exit 0
fi
if [[ "$cmd" == "update" ]]; then
  exit 0
fi
if [[ "$cmd" == "--version" ]]; then
  echo "West version: v1.5.0"
  exit 0
fi
exit 0
`,
    );

    const result = runCli(["init", "--parent", parent, "--skip-west-update"], {
      env: {
        XDG_CONFIG_HOME: xdgConfigHome,
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Prompt skipped (non-interactive terminal). Defaulting to No.");
    expect(result.output).toContain("nrfutil not found");
  });
});
