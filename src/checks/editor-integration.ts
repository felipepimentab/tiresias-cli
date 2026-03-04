import { configureEditorBoardRoots, detectPreferredEditorCommand } from "../lib/editor-settings";
import { runCommand } from "../lib/exec";
import type { AskYesNo } from "../lib/prompts";
import { yesNoQuestion } from "../lib/prompts";

type EditorIntegrationLogger = {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

/**
 * Updates editor board roots after user confirmation.
 */
export async function configureBoardRootsIntegration(
  boardsPath: string,
  askYesNo: AskYesNo,
  logger: EditorIntegrationLogger,
) {
  await configureEditorBoardRoots({
    boardsPath,
    askYesNo: (question) => askYesNo(question),
    logger,
  });
}

/**
 * Prompts user to open a workspace in VS Code/Trae after init completes.
 */
export async function promptToOpenWorkspaceInEditor(
  workspacePath: string,
  askYesNo: AskYesNo,
  logger: EditorIntegrationLogger,
) {
  const detectedEditor = detectPreferredEditorCommand();
  const destination = `${detectedEditor?.editor ?? "detected editor"} (${workspacePath})`;
  const shouldOpen = await askYesNo(yesNoQuestion(`Do you want to open ${destination} now?`));
  if (!shouldOpen) {
    return;
  }

  if (!detectedEditor) {
    logger.warn("Could not auto-detect VS Code or Trae CLI command.");
    logger.warn(`Open this folder manually in your editor: ${workspacePath}`);
    return;
  }

  try {
    logger.info(`Opening ${detectedEditor.editor} at ${workspacePath}...`);
    await runCommand(detectedEditor.command, [workspacePath], { quiet: false });
    logger.success(`${detectedEditor.editor} opened.`);
  } catch (err) {
    logger.error(`Failed to open ${detectedEditor.editor}: ${String(err)}`);
    logger.warn(`Open this folder manually in your editor: ${workspacePath}`);
  }
}
