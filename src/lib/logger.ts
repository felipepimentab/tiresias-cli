export function success(message: string) {
  console.log(`[OK] ${message}`);
}

export function error(message: string) {
  console.error(`[ERROR] ${message}`);
}

export function info(message: string) {
  console.log(`[INFO] ${message}`);
}

export function warn(message: string) {
  console.log(`[WARN] ${message}`);
}
