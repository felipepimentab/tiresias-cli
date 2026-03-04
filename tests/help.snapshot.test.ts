import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCli } from "./helpers";

const SNAPSHOTS_DIR = resolve(import.meta.dir, "snapshots");

function readSnapshot(name: string) {
  return readFileSync(resolve(SNAPSHOTS_DIR, name), "utf8");
}

function normalize(text: string) {
  return text.replace(/\r\n/g, "\n");
}

const cases = [
  { name: "root-help.txt", args: ["--help"] },
  { name: "init-help.txt", args: ["init", "--help"] },
  { name: "doctor-help.txt", args: ["doctor", "--help"] },
  { name: "update-help.txt", args: ["update", "--help"] },
  { name: "config-help.txt", args: ["config", "--help"] },
];

describe("help snapshots", () => {
  for (const testCase of cases) {
    it(`matches ${testCase.name}`, () => {
      const result = runCli(testCase.args);
      expect(result.exitCode).toBe(0);
      expect(normalize(result.stdout)).toBe(readSnapshot(testCase.name));
    });
  }
});
