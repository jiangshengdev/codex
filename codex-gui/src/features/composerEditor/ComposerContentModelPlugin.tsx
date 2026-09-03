import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  KEY_ESCAPE_COMMAND,
  mergeRegister,
  ParagraphNode,
  SET_TEXT_FORMAT_COMMAND,
  TextNode,
} from "lexical";
import { useEffect } from "react";

export function ComposerContentModelPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(FORMAT_TEXT_COMMAND, rejectFormat, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(SET_TEXT_FORMAT_COMMAND, rejectFormat, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(FORMAT_ELEMENT_COMMAND, rejectFormat, COMMAND_PRIORITY_HIGH),
        editor.registerNodeTransform(TextNode, normalizeTextNode),
        editor.registerNodeTransform(ParagraphNode, normalizeParagraphNode),
        editor.registerCommand(DRAGSTART_COMMAND, disableDragAndDrop, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(DRAGOVER_COMMAND, disableDragAndDrop, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(DROP_COMMAND, disableDragAndDrop, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          (event) => {
            if (!editor.isEditable() || !$isRangeSelection($getSelection())) {
              return false;
            }
            event.preventDefault();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor],
  );

  return null;
}

function rejectFormat(): boolean {
  return true;
}

function normalizeTextNode(node: TextNode): void {
  if (node.getFormat() !== 0) {
    node.setFormat(0);
  }
  if (node.getStyle() !== "") {
    node.setStyle("");
  }
}

function normalizeParagraphNode(node: ParagraphNode): void {
  if (node.getFormat() !== 0) {
    node.setFormat("");
  }
  if (node.getIndent() !== 0) {
    node.setIndent(0);
  }
  if (node.getStyle() !== "") {
    node.setStyle("");
  }
  if (node.getTextFormat() !== 0) {
    node.setTextFormat(0);
  }
  if (node.getTextStyle() !== "") {
    node.setTextStyle("");
  }
}

function disableDragAndDrop(event: DragEvent): boolean {
  event.preventDefault();
  return true;
}
