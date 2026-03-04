export const APP_NAME = "tiresias";
export const CONFIG_DIRECTORY_NAME = "tiresias-cli";
export const CONFIG_FILE_NAME = "config.json";

export const DEFAULT_WORKSPACE_NAME = "tiresias-workspace";
export const DEFAULT_BOARDS_DIRECTORY_NAME = "boards";
export const FW_REPOSITORY_NAME = "tiresias-fw";
export const BOARDS_REPOSITORY_NAME = "tiresias-boards";

export const FW_REPO_URL = "https://github.com/felipepimentab/tiresias-fw";
export const BOARDS_REPO_URL = "https://github.com/felipepimentab/tiresias-boards";
export const BOARD_ROOTS_TUTORIAL_URL = "https://youtu.be/V_dVKgWKILM?si=UypFkBgh_aVOVuQG&t=2629";
export const HOMEBREW_INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh";

export const REQUIRED_NCS_TOOLCHAIN_VERSION = "3.0.1";

export const ENV_VARS = {
  workspacePath: "TIRESIAS_WORKSPACE",
  boardsPath: "TIRESIAS_BOARDS_PATH",
} as const;

export const TOOL_INSTALL_URLS = {
  west: "https://docs.zephyrproject.org/latest/develop/west/install.html",
  cmake: "https://cmake.org/download/",
  python3: "https://www.python.org/downloads/",
  nrfutil: "https://www.nordicsemi.com/Products/Development-tools/nrf-util",
  seggerJlink: "https://www.segger.com/downloads/jlink/",
  nrfCommandLineTools:
    "https://www.nordicsemi.com/Products/Development-tools/nRF-Command-Line-Tools",
  nrfConnectDesktop:
    "https://www.nordicsemi.com/Products/Development-tools/nrf-connect-for-desktop/download",
  ncsToolchainInstall:
    "https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/installation/install_ncs.html",
  homebrew: "https://brew.sh",
} as const;

export type ToolRequirement = {
  id: string;
  name: string;
  command: string;
  args?: string[];
  brewInstall?: string[];
  officialInstallUrl: string;
  requiredForInit?: boolean;
};

export const COMMON_TOOL_REQUIREMENTS: ToolRequirement[] = [
  {
    id: "west",
    name: "west",
    command: "west",
    args: ["--version"],
    brewInstall: ["install", "west"],
    officialInstallUrl: TOOL_INSTALL_URLS.west,
  },
  {
    id: "cmake",
    name: "cmake",
    command: "cmake",
    args: ["--version"],
    brewInstall: ["install", "cmake"],
    officialInstallUrl: TOOL_INSTALL_URLS.cmake,
  },
  {
    id: "python3",
    name: "python3",
    command: "python3",
    args: ["--version"],
    officialInstallUrl: TOOL_INSTALL_URLS.python3,
  },
  {
    id: "nrfutil",
    name: "nrfutil",
    command: "nrfutil",
    args: ["--version"],
    brewInstall: ["install", "nrfutil"],
    officialInstallUrl: TOOL_INSTALL_URLS.nrfutil,
  },
  // SEGGER tools do not provide a consistent version flag across installs.
  {
    id: "segger-jlink",
    name: "segger-jlink",
    command: "JLinkExe",
    brewInstall: ["install", "--cask", "segger-jlink"],
    officialInstallUrl: TOOL_INSTALL_URLS.seggerJlink,
  },
  {
    id: "nordic-nrf-command-line-tools",
    name: "nordic-nrf-command-line-tools",
    command: "nrfjprog",
    args: ["--version"],
    brewInstall: ["install", "--cask", "nrf-command-line-tools"],
    officialInstallUrl: TOOL_INSTALL_URLS.nrfCommandLineTools,
  },
];

export const INIT_TOOL_REQUIREMENTS: ToolRequirement[] = [
  {
    id: "git",
    name: "git",
    command: "git",
    args: ["--version"],
    brewInstall: ["install", "git"],
    officialInstallUrl: "https://git-scm.com/downloads",
    requiredForInit: true,
  },
  {
    id: "west",
    name: "west",
    command: "west",
    args: ["--version"],
    brewInstall: ["install", "west"],
    officialInstallUrl: TOOL_INSTALL_URLS.west,
    requiredForInit: true,
  },
  ...COMMON_TOOL_REQUIREMENTS.filter((tool) => tool.id !== "west"),
];

export const NORDIC_APP_DISPLAY_NAME = "nrf-connect-for-desktop";
export const NCS_BUILD_BOARD_TARGET = "tiresias_dk/nrf5340/cpuapp";
