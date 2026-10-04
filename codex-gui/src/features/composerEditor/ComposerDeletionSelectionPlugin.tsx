import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createRangeSelectionFromDom,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  mergeRegister,
} from "lexical";
import { useEffect } from "react";

export function ComposerDeletionSelectionPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const syncDeletionSelection = (event: KeyboardEvent): false => {
      if (!editor.isEditable() || editor.isComposing() || event.isComposing) return false;
      const selection = $getSelection();
      // NodeSelection owns atomic token selection even when the DOM has no range for it.
      if (!$isRangeSelection(selection)) return false;
      const root = editor.getRootElement();
      const domSelection = root?.ownerDocument.getSelection();
      if (
        root == null ||
        domSelection == null ||
        !root.contains(domSelection.anchorNode) ||
        !root.contains(domSelection.focusNode)
      )
        return false;

      // keydown can precede selectionchange (including contenteditable fill).
      // Preserve the model's typing format and leave deletion/history to RichTextPlugin.
      const current = $createRangeSelectionFromDom(domSelection, editor);
      if (current != null) {
        selection.anchor.set(current.anchor.key, current.anchor.offset, current.anchor.type);
        selection.focus.set(current.focus.key, current.focus.offset, current.focus.type);
      }
      return false;
    };
    return mergeRegister(
      editor.registerCommand(KEY_DELETE_COMMAND, syncDeletionSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(KEY_BACKSPACE_COMMAND, syncDeletionSelection, COMMAND_PRIORITY_HIGH),
    );
  }, [editor]);

  return null;
}
