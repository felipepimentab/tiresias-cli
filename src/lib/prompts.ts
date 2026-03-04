import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

type PromptLogger = {
  warn: (message: string) => void;
};

type AskYesNoOptions = {
  nonInteractiveDefault?: boolean;
  context?: string;
};

export type AskYesNo = (question: string, options?: AskYesNoOptions) => Promise<boolean>;

/**
 * Builds a reusable yes/no prompt function with deterministic non-interactive behavior.
 */
export function createAskYesNo(logger: PromptLogger): AskYesNo {
  return async (question, options = {}) => {
    // Safety policy: in non-interactive shells we default to "No" unless
    // explicitly overridden, so automation cannot accidentally mutate state.
    const nonInteractiveDefault = options.nonInteractiveDefault ?? false;
    if (!input.isTTY || !output.isTTY) {
      logger.warn(
        `Prompt skipped (non-interactive terminal). Defaulting to ${
          nonInteractiveDefault ? "Yes" : "No"
        }.${options.context ? ` ${options.context}` : ""}`,
      );
      return nonInteractiveDefault;
    }

    const rl = createInterface({ input, output });
    try {
      const answer = (await rl.question(question)).trim().toLowerCase();
      return answer === "" || answer === "y" || answer === "yes";
    } finally {
      rl.close();
    }
  };
}

/**
 * Formats a standard `[Y/n]` question, optionally appending execution details.
 */
export function yesNoQuestion(message: string, detail?: string) {
  return `${message} [Y/n]${detail ? ` (${detail})` : ""} `;
}
