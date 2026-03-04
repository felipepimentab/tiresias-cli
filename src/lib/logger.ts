const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
} as const;

type LogMode = "default" | "verbose" | "quiet";

let logMode: LogMode = "default";

function supportsColor(stream: NodeJS.WriteStream) {
  return stream.isTTY && !("NO_COLOR" in process.env);
}

function paint(text: string, color: string, stream: NodeJS.WriteStream) {
  if (!supportsColor(stream)) {
    return text;
  }
  return `${ANSI.bold}${color}${text}${ANSI.reset}`;
}

/**
 * Configures logger verbosity for all command modules.
 * Quiet mode has precedence over verbose mode.
 */
export function configureLogger(options: { verbose?: boolean; quiet?: boolean }) {
  if (options.quiet) {
    logMode = "quiet";
    return;
  }
  if (options.verbose) {
    logMode = "verbose";
    return;
  }
  logMode = "default";
}

/**
 * Returns true when verbose logging is currently enabled.
 */
export function isVerbose() {
  return logMode === "verbose";
}

export function info(message: string) {
  if (logMode === "quiet") {
    return;
  }
  const prefix = paint("==>", ANSI.blue, process.stdout);
  console.log(`${prefix} ${message}`);
}

export function success(message: string) {
  if (logMode === "quiet") {
    return;
  }
  const prefix = paint("✔︎ Success:", ANSI.green, process.stdout);
  console.log(`${prefix} ${message}`);
}

export function warn(message: string) {
  const prefix = paint("⚠︎ Warning:", ANSI.yellow, process.stdout);
  console.log(`${prefix} ${message}`);
}

export function error(message: string) {
  const prefix = paint("✘ Error:", ANSI.red, process.stderr);
  console.error(`${prefix} ${message}`);
}

/**
 * Emits debug logs only when verbose mode is active.
 */
export function debug(message: string) {
  if (logMode !== "verbose") {
    return;
  }
  const prefix = paint("··· Debug:", ANSI.gray, process.stdout);
  console.log(`${prefix} ${message}`);
}
