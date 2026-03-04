import { debug, isVerbose } from "./logger";

type RunOptions = {
  cwd?: string;
  quiet?: boolean;
};

/**
 * Executes a command and returns trimmed stdout in quiet mode.
 * Throws on non-zero exit with stderr/stdout details to simplify command callers.
 */
export async function runCommand(command: string, args: string[] = [], options: RunOptions = {}) {
  const quiet = options.quiet ?? true;
  if (isVerbose()) {
    const location = options.cwd ? ` (cwd: ${options.cwd})` : "";
    debug(`exec: ${command} ${args.join(" ")}${location}`);
  }

  if (!quiet) {
    const proc = Bun.spawn({
      cmd: [command, ...args],
      cwd: options.cwd,
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Command failed (${exitCode}): ${command} ${args.join(" ")}`);
    }
    return "";
  }

  const proc = Bun.spawn({
    cmd: [command, ...args],
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const details = (stderr || stdout).trim();
    throw new Error(
      `Command failed (${exitCode}): ${command} ${args.join(" ")}${details ? `\n${details}` : ""}`,
    );
  }

  return stdout.trim();
}
