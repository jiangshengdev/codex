export function setCollapsedCaret(root: Element, expectedText: string, offset: number): void {
  const textElements = root.querySelectorAll<HTMLElement>('[data-lexical-text="true"]');
  if (textElements.length !== 1) {
    throw new Error("composer editor must contain exactly one Lexical text element");
  }

  const textElement = textElements.item(0);
  const textNode = textElement.firstChild;
  if (textElement.childNodes.length !== 1 || !(textNode instanceof Text)) {
    throw new Error("Lexical text element must contain exactly one Text child");
  }
  if (textNode.data !== expectedText) {
    throw new Error(`expected Lexical text ${expectedText}, received ${textNode.data}`);
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > textNode.length) {
    throw new Error(`caret offset ${String(offset)} is outside the Lexical text`);
  }

  const selection = root.ownerDocument.getSelection();
  if (selection == null) {
    throw new Error("composer editor document must provide a Selection");
  }
  const range = root.ownerDocument.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.ownerDocument.dispatchEvent(new Event("selectionchange"));
}

export function collapsedCaretOffset(root: Element): number | null {
  const selection = root.ownerDocument.getSelection();
  if (
    selection == null ||
    !selection.isCollapsed ||
    selection.anchorNode == null ||
    !root.contains(selection.anchorNode)
  ) {
    return null;
  }
  return selection.anchorOffset;
}
