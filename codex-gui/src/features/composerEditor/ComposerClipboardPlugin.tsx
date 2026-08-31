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
  $createNodeSelection,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  type BaseSelection,
  COMMAND_PRIORITY_HIGH,
  COPY_COMMAND,
  CUT_COMMAND,
  CUT_TAG,
  type LexicalEditor,
  type LexicalNode,
  mergeRegister,
  PASTE_COMMAND,
  PASTE_TAG,
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
          (event) => copySelection(editor, event) !== "unavailable",
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          CUT_COMMAND,
          (event) => {
            const selectionToDelete = $getSelection()?.clone() ?? null;
            const copyResult = copySelection(editor, event, () => {
              deleteCopiedSelection(editor, selectionToDelete);
            });
            if (copyResult === "copied") {
              deleteCopiedSelection(editor, selectionToDelete);
            }
            return copyResult !== "unavailable";
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
                if ($isRangeSelection(selection) || $isNodeSelection(selection)) {
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
  onCopied?: () => void,
): "copied" | "pending" | "unavailable" {
  const selection = $getSelection();
  if (
    (!$isRangeSelection(selection) && !$isNodeSelection(selection)) ||
    selection.isCollapsed() ||
    selection.getNodes().length === 0
  ) {
    return "unavailable";
  }

  const data = clipboardDataFromSelection(editor, selection);
  const clipboardData = event != null && "clipboardData" in event ? event.clipboardData : null;
  if (event != null && clipboardData != null) {
    event.preventDefault();
    setLexicalClipboardDataTransfer(clipboardData, data);
    return "copied";
  } else {
    void copyToClipboard(editor, null, data).then(
      (copied) => {
        if (copied) {
          onCopied?.();
        } else {
          reportClipboardCopyFailure(editor);
        }
      },
      (error: unknown) => {
        reportClipboardCopyFailure(editor, error);
      },
    );
    return "pending";
  }
}

function deleteCopiedSelection(
  editor: LexicalEditor,
  expectedSelection: BaseSelection | null,
): void {
  editor.update(
    () => {
      const selection = $getSelection();
      if (!selection?.is(expectedSelection)) return;
      if ($isRangeSelection(selection)) {
        selection.removeText();
      } else if ($isNodeSelection(selection)) {
        selection.deleteNodes();
      }
    },
    { tag: CUT_TAG },
  );
}

function clipboardDataFromSelection(
  editor: LexicalEditor,
  selection: BaseSelection,
): LexicalClipboardData {
  const payload = $generateJSONFromSelectedNodes(
    editor,
    normalizeSelectionForClipboardProjection(selection),
  );
  const selectedNodes = $generateNodesFromSerializedNodes(payload.nodes);
  return {
    "text/plain": compileSelectedNodes(selectedNodes, "canonical"),
    "text/html": `<span>${escapeHtml(compileSelectedNodes(selectedNodes, "display"))}</span>`,
    [LEXICAL_MIME_TYPE]: JSON.stringify(payload),
  };
}

type SkillTextProjection = "canonical" | "display";

function normalizeSelectionForClipboardProjection(selection: BaseSelection): BaseSelection {
  if (!$isRangeSelection(selection)) return selection;

  const selectedNodes = selection.getNodes();
  if (selectedNodes.some($isTextNode)) return selection;

  const nodeSelection = $createNodeSelection();
  for (const node of selectedNodes) nodeSelection.add(node.getKey());
  return nodeSelection;
}

function compileSelectedNodes(nodes: LexicalNode[], skillText: SkillTextProjection): string {
  return nodes.map((node) => compileSelectedNode(node, skillText)).join("\n");
}

function compileSelectedNode(node: LexicalNode, skillText: SkillTextProjection): string {
  if ($isSkillNode(node)) {
    const skill = node.getSkill();
    return `$${skillText === "canonical" ? skill.name : skill.displayName}`;
  }
  if (!$isElementNode(node)) return node.getTextContent();
  return node
    .getChildren()
    .map((child) => compileSelectedNode(child, skillText))
    .join("");
}

function reportClipboardCopyFailure(editor: LexicalEditor, error?: unknown): void {
  const clipboardError =
    error instanceof Error ? error : new Error("Unable to copy the composer selection");
  editor.update(() => {
    throw clipboardError;
  });
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
