import { $getSelection, $isRangeSelection, $splitNode, type LineBreakNode } from "lexical";

// Normalize imported soft breaks as soon as they enter the document. Splitting
// the existing nodes preserves Skill identity and text-node selection points.
export function $normalizeComposerLineBreak(node: LineBreakNode): void {
  const parent = node.getParentOrThrow();
  const offset = node.getIndexWithinParent();
  const selection = $getSelection();
  const points = $isRangeSelection(selection)
    ? [selection.anchor, selection.focus]
        .filter(
          (point) =>
            point.type === "element" && point.key === parent.getKey() && point.offset > offset,
        )
        .map((point) => ({ point, offset: point.offset - offset }))
    : [];
  const [, next] = $splitNode(parent, offset);
  for (const entry of points) entry.point.set(next.getKey(), entry.offset, "element");
  node.remove();
}
