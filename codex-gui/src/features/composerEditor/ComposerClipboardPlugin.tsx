import {
  $generateJSONFromSelectedNodes,
  $generateNodesFromSerializedNodes,
  $insertDataTransferForRichText,
  copyToClipboard,
  type LexicalClipboardData,
  setLexicalClipboardDataTransfer,
} from "@lexical/clipboard";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  COPY_COMMAND,
  CUT_COMMAND,
  CUT_TAG,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  PASTE_COMMAND,
  PASTE_TAG,
  type RangeSelection,
} from "lexical";
import { useEffect } from "react";
import { $isSkillNode } from "./SkillNode";

const LEXICAL_MIME_TYPE = "application/x-lexical-editor";

export function ComposerClipboardPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          COPY_COMMAND,
          (event) => copySelection(editor, event),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          CUT_COMMAND,
          (event) => {
            const copied = copySelection(editor, event);
            if (copied) {
              editor.update(
                () => {
                  const selection = $getSelection();
                  if ($isRangeSelection(selection)) selection.removeText();
                },
                { tag: CUT_TAG },
              );
            }
            return copied;
          },
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          PASTE_COMMAND,
          (event) => {
            const dataTransfer = dataTransferFromPasteEvent(event);
            if (dataTransfer == null) return false;
            event.preventDefault();
            editor.update(
              () => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                  $insertDataTransferForRichText(dataTransfer, selection, editor);
                }
              },
              { tag: PASTE_TAG },
            );
            return true;
          },
          COMMAND_PRIORITY_HIGH,
        ),
      ),
    [editor],
  );

  return null;
}

function copySelection(
  editor: LexicalEditor,
  event: ClipboardEvent | KeyboardEvent | null,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;

  const data = clipboardDataFromSelection(editor, selection);
  const clipboardData = event != null && "clipboardData" in event ? event.clipboardData : null;
  if (event != null && clipboardData != null) {
    event.preventDefault();
    setLexicalClipboardDataTransfer(clipboardData, data);
  } else {
    void copyToClipboard(editor, null, data);
  }
  return true;
}

function clipboardDataFromSelection(
  editor: LexicalEditor,
  selection: RangeSelection,
): LexicalClipboardData {
  const payload = $generateJSONFromSelectedNodes(editor, selection);
  const selectedNodes = $generateNodesFromSerializedNodes(payload.nodes);
  return {
    "text/plain": selectedNodes.map(compileSelectedNode).join("\n"),
    "text/html": `<span>${escapeHtml(selection.getTextContent())}</span>`,
    [LEXICAL_MIME_TYPE]: JSON.stringify(payload),
  };
}

function compileSelectedNode(node: LexicalNode): string {
  if ($isSkillNode(node)) return `$${node.getSkill().name}`;
  if (!$isElementNode(node)) return node.getTextContent();
  return node.getChildren().map(compileSelectedNode).join("");
}

function dataTransferFromPasteEvent(
  event: ClipboardEvent | InputEvent | KeyboardEvent,
): DataTransfer | null {
  if ("clipboardData" in event) return event.clipboardData;
  if ("dataTransfer" in event) return event.dataTransfer;
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
