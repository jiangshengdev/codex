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
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ESCAPE_COMMAND,
  LineBreakNode,
  mergeRegister,
  ParagraphNode,
  SET_TEXT_FORMAT_COMMAND,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import { $normalizeComposerLineBreak } from "./composerParagraphs";
import { ADD_ATTACHMENTS_COMMAND } from "./AttachmentNode";

export function ComposerContentModelPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          INSERT_LINE_BREAK_COMMAND,
          () => editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(FORMAT_TEXT_COMMAND, rejectFormat, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(SET_TEXT_FORMAT_COMMAND, rejectFormat, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(FORMAT_ELEMENT_COMMAND, rejectFormat, COMMAND_PRIORITY_HIGH),
        editor.registerNodeTransform(TextNode, normalizeTextNode),
        editor.registerNodeTransform(ParagraphNode, normalizeParagraphNode),
        editor.registerNodeTransform(LineBreakNode, $normalizeComposerLineBreak),
        editor.registerCommand(DRAGSTART_COMMAND, disableDragAndDrop, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(DRAGOVER_COMMAND, disableDragAndDrop, COMMAND_PRIORITY_HIGH),
        editor.registerCommand(
          DROP_COMMAND,
          (event) => {
            event.preventDefault();
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length > 0) editor.dispatchCommand(ADD_ATTACHMENTS_COMMAND, files);
            return true;
          },
          COMMAND_PRIORITY_HIGH,
        ),
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
