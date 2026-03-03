const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
} as const;

function supportsColor(stream: NodeJS.WriteStream) {
  return stream.isTTY && !("NO_COLOR" in process.env);
}

function paint(text: string, color: string, stream: NodeJS.WriteStream) {
  if (!supportsColor(stream)) {
    return text;
  }
  return `${ANSI.bold}${color}${text}${ANSI.reset}`;
}

export function info(message: string) {
  const prefix = paint("==>", ANSI.blue, process.stdout);
  console.log(`${prefix} ${message}`);
}

export function success(message: string) {
  const prefix = paint("\uf00c Success:", ANSI.green, process.stdout);
  console.log(`${prefix} ${message}`);
}

export function warn(message: string) {
  const prefix = paint("\ue654 Warning:", ANSI.yellow, process.stdout);
  console.log(`${prefix} ${message}`);
}

export function error(message: string) {
  const prefix = paint("\uea87 Error:", ANSI.red, process.stderr);
  console.error(`${prefix} ${message}`);
}
