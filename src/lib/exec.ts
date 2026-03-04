type RunOptions = {
  cwd?: string;
  quiet?: boolean;
};

export async function runCommand(command: string, args: string[] = [], options: RunOptions = {}) {
  const quiet = options.quiet ?? true;

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
