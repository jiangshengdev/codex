import { COMPOSITION_END_COMMAND, getNearestEditorFromDOMNode } from "lexical";

export function dispatchCompositionEnd(root: Element, data: string): void {
  const event = new CompositionEvent("compositionend", { bubbles: true, data });
  root.dispatchEvent(event);

  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) {
    throw new Error("composition root must belong to a Lexical editor");
  }
  if (editor.isComposing()) {
    editor.dispatchCommand(COMPOSITION_END_COMMAND, event);
  }
}
