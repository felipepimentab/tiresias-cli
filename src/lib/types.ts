/**
 * Source used when resolving a path argument for workspace/boards operations.
 */
export type PathSource = "flag" | "env" | "config" | "auto" | "default";

/**
 * Standard resolved-path payload used by command resolution helpers.
 */
export type ResolvedPath = {
  path: string | null;
  source: PathSource | null;
};

/**
 * Structured status levels produced by doctor checks.
 */
export type DoctorCheckStatus = "ok" | "warn" | "error" | "skipped";

/**
 * Single doctor check record used in JSON output mode.
 */
export type DoctorCheckResult = {
  id: string;
  status: DoctorCheckStatus;
  message: string;
};

/**
 * Full machine-readable doctor report emitted by `tiresias doctor --json`.
 */
export type DoctorReport = {
  command: "doctor";
  generatedAt: string;
  checks: DoctorCheckResult[];
  paths: {
    workspacePath: ResolvedPath;
    boardsPath: ResolvedPath;
  };
  overallStatus: "ok" | "error";
};
