import type { ComposerPendingInputMoveDestination } from "./composerInputQueueContracts";

export function composerPendingInputMoveTargetIndex(
  sourceIndex: number,
  count: number,
  destination: ComposerPendingInputMoveDestination,
): number {
  if (sourceIndex < 0 || sourceIndex >= count) {
    throw new RangeError("Pending input move source index is outside the sortable collection");
  }
  switch (destination) {
    case "earlier":
      return Math.max(0, sourceIndex - 1);
    case "later":
      return Math.min(count - 1, sourceIndex + 1);
    case "first":
      return 0;
    case "last":
      return count - 1;
  }
}

export function moveArrayElement(items: unknown[], sourceIndex: number, targetIndex: number): void {
  if (
    sourceIndex < 0 ||
    sourceIndex >= items.length ||
    targetIndex < 0 ||
    targetIndex >= items.length
  ) {
    throw new RangeError("Pending input move index is outside the sortable collection");
  }
  if (sourceIndex === targetIndex) {
    return;
  }
  const moved = items.splice(sourceIndex, 1);
  items.splice(targetIndex, 0, ...moved);
}
