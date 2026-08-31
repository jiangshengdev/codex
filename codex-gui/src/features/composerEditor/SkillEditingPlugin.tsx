import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $addUpdateTag,
  $generateNodesFromRawText,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  BEFORE_INPUT_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  DELETE_CHARACTER_COMMAND,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  type NodeKey,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  mergeRegister,
} from "lexical";
import { useEffect } from "react";

import { $isSkillNode } from "./SkillNode";

// ComposerEditor mounts Lexical 0.49 HistoryPlugin without a delay override.
const historyMergeDelayMs = 1_000;

type TextInsertionCaret = Readonly<{
  key: NodeKey;
  offset: number;
  type: "element" | "text";
}>;

type TextInsertionContinuation = Readonly<{
  caret: TextInsertionCaret;
  expiresAt: number;
}>;

export function SkillEditingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          BEFORE_INPUT_COMMAND,
          createBeforeInputHandler(editor),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          CONTROLLED_TEXT_INSERTION_COMMAND,
          (payload) => replaceSelectedSkills(payload),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          DELETE_CHARACTER_COMMAND,
          () => deleteSelectedSkills(editor),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_ARROW_LEFT_COMMAND,
          (event) => exitSelectedSkill(editor, event, "left"),
          COMMAND_PRIORITY_EDITOR,
        ),
        editor.registerCommand(
          KEY_ARROW_RIGHT_COMMAND,
          (event) => exitSelectedSkill(editor, event, "right"),
          COMMAND_PRIORITY_EDITOR,
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND,
          (event) => deleteSelectedSkillsFromKeyboard(editor, event),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_DELETE_COMMAND,
          (event) => deleteSelectedSkillsFromKeyboard(editor, event),
          COMMAND_PRIORITY_HIGH,
        ),
      ),
    [editor],
  );

  return null;
}

function createBeforeInputHandler(editor: LexicalEditor): (event: InputEvent) => boolean {
  let continuation: TextInsertionContinuation | null = null;

  return (event) => {
    const pendingContinuation = continuation;
    continuation = null;

    if (replaceSelectedSkillsFromBeforeInput(event)) {
      const caret = isOrdinaryTextInsertionBeforeInput(event) ? getCollapsedCaret() : null;
      if (caret != null) {
        continuation = {
          caret,
          expiresAt: event.timeStamp + historyMergeDelayMs,
        };
      }
      return true;
    }

    if (pendingContinuation == null || !continuesTextInsertion(pendingContinuation, event)) {
      return false;
    }

    const handled = editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, event);
    if (!handled) return false;
    $addUpdateTag(HISTORY_MERGE_TAG);
    event.preventDefault();
    return true;
  };
}

function replaceSelectedSkillsFromBeforeInput(event: InputEvent): boolean {
  if (!isTextInsertionBeforeInput(event) || !replaceSelectedSkills(event)) return false;
  event.preventDefault();
  return true;
}

function continuesTextInsertion(
  continuation: TextInsertionContinuation,
  event: InputEvent,
): boolean {
  if (!isOrdinaryTextInsertionBeforeInput(event) || event.timeStamp >= continuation.expiresAt) {
    return false;
  }

  const caret = getCollapsedCaret();
  return (
    caret?.key === continuation.caret.key &&
    caret.offset === continuation.caret.offset &&
    caret.type === continuation.caret.type
  );
}

function isOrdinaryTextInsertionBeforeInput(event: InputEvent): boolean {
  return (
    event.inputType === "insertText" &&
    event.data != null &&
    event.data !== "" &&
    event.data !== "\n" &&
    event.data !== "\n\n"
  );
}

function isTextInsertionBeforeInput(event: InputEvent): boolean {
  switch (event.inputType) {
    case "insertText":
      return event.data !== "\n" && event.data !== "\n\n";
    case "insertTranspose":
    case "insertFromYank":
    case "insertFromDrop":
    case "insertReplacementText":
    case "insertFromComposition":
      return true;
    default:
      return false;
  }
}

function replaceSelectedSkills(payload: InputEvent | string): boolean {
  const selection = getSelectedSkills();
  if (selection == null) return false;

  const text =
    typeof payload === "string"
      ? payload
      : (payload.dataTransfer?.getData("text/plain") ?? payload.data);
  if (text == null || text === "") return false;

  selection.insertNodes($generateNodesFromRawText(text));
  return true;
}

function deleteSelectedSkills(editor: LexicalEditor): boolean {
  const selection = getSelectedSkills();
  if (selection == null) return false;
  selection.deleteNodes();
  focusCurrentRoot(editor);
  return true;
}

function deleteSelectedSkillsFromKeyboard(editor: LexicalEditor, event: KeyboardEvent): boolean {
  const selection = getSelectedSkills();
  if (selection == null) return false;
  event.preventDefault();
  selection.deleteNodes();
  focusCurrentRoot(editor);
  return true;
}

function exitSelectedSkill(
  editor: LexicalEditor,
  event: KeyboardEvent,
  direction: "left" | "right",
): boolean {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return false;
  const nodes = selection.getNodes();
  if (nodes.length !== 1 || !$isSkillNode(nodes[0])) return false;

  const node = nodes[0];
  const parentElement = editor.getElementByKey(node.getParentOrThrow().getKey());
  const view = parentElement?.ownerDocument.defaultView;
  if (parentElement == null || view == null) return false;

  const isParentRtl = view.getComputedStyle(parentElement).direction === "rtl";
  const movesPrevious = direction === (isParentRtl ? "right" : "left");
  if (movesPrevious) {
    node.selectPrevious();
  } else {
    node.selectNext(0, 0);
  }
  event.preventDefault();
  return true;
}

function getSelectedSkills() {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const nodes = selection.getNodes();
  if (nodes.length === 0 || nodes.some((node) => !$isSkillNode(node))) return null;
  return selection;
}

function getCollapsedCaret(): TextInsertionCaret | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  return {
    key: selection.anchor.key,
    offset: selection.anchor.offset,
    type: selection.anchor.type,
  };
}

function focusCurrentRoot(editor: LexicalEditor): void {
  const root = editor.getRootElement();
  if (root?.isConnected) root.focus({ preventScroll: true });
}
