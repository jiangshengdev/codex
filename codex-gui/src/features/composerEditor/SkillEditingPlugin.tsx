import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $generateNodesFromRawText,
  $getSelection,
  $isNodeSelection,
  BEFORE_INPUT_COMMAND,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  mergeRegister,
} from "lexical";
import { useEffect } from "react";

import { $isSkillNode } from "./SkillNode";

export function SkillEditingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          BEFORE_INPUT_COMMAND,
          replaceSelectedSkillsFromBeforeInput,
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND,
          deleteSelectedSkillsFromKeyboard,
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_DELETE_COMMAND,
          deleteSelectedSkillsFromKeyboard,
          COMMAND_PRIORITY_HIGH,
        ),
      ),
    [editor],
  );

  return null;
}

function replaceSelectedSkillsFromBeforeInput(event: InputEvent): boolean {
  if (!isTextInsertionBeforeInput(event) || !replaceSelectedSkills(event)) return false;
  event.preventDefault();
  return true;
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

function replaceSelectedSkills(event: InputEvent): boolean {
  const selection = getSelectedSkills();
  if (selection == null) return false;

  const text = event.dataTransfer?.getData("text/plain") ?? event.data;
  if (text == null || text === "") return false;

  selection.insertNodes($generateNodesFromRawText(text));
  return true;
}

function deleteSelectedSkillsFromKeyboard(event: KeyboardEvent): boolean {
  const selection = getSelectedSkills();
  if (selection == null) return false;
  event.preventDefault();
  selection.deleteNodes();
  return true;
}

function getSelectedSkills() {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const nodes = selection.getNodes();
  if (nodes.length === 0 || nodes.some((node) => !$isSkillNode(node))) return null;
  return selection;
}
