import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $generateNodesFromRawText,
  $getSelection,
  $isDecoratorNode,
  $isNodeSelection,
  BEFORE_INPUT_COMMAND,
  COMMAND_PRIORITY_HIGH,
} from "lexical";
import { useEffect } from "react";

export function ComposerAtomicNodePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        BEFORE_INPUT_COMMAND,
        (event) => {
          if (!editor.isEditable()) return false;
          return replaceSelectedInlineAtomicNodesFromBeforeInput(event);
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );

  return null;
}

function replaceSelectedInlineAtomicNodesFromBeforeInput(event: InputEvent): boolean {
  if (!isTextInsertionBeforeInput(event) || !replaceSelectedInlineAtomicNodes(event)) return false;
  event.preventDefault();
  return true;
}

function isTextInsertionBeforeInput(event: InputEvent): boolean {
  if (event.isComposing) return false;
  switch (event.inputType) {
    case "insertText":
      return event.data !== "\n" && event.data !== "\n\n";
    case "insertTranspose":
    case "insertFromYank":
    case "insertReplacementText":
      return true;
    default:
      return false;
  }
}

function replaceSelectedInlineAtomicNodes(event: InputEvent): boolean {
  const selection = getSelectedInlineAtomicNodes();
  if (selection == null) return false;

  const text = event.dataTransfer?.getData("text/plain") ?? event.data;
  if (text == null || text === "") return false;

  selection.insertNodes($generateNodesFromRawText(text));
  return true;
}

function getSelectedInlineAtomicNodes() {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const nodes = selection.getNodes();
  if (
    nodes.length === 0 ||
    nodes.some(
      (node) => !$isDecoratorNode(node) || !node.isInline() || !node.isKeyboardSelectable(),
    )
  ) {
    return null;
  }
  return selection;
}
