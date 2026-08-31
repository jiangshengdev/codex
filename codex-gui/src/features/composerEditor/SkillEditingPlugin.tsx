import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $addUpdateTag,
  $createNodeSelection,
  $createRangeSelection,
  $generateNodesFromRawText,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  BEFORE_INPUT_COMMAND,
  COMMAND_PRIORITY_BEFORE_EDITOR,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  DELETE_CHARACTER_COMMAND,
  HISTORY_MERGE_TAG,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  getNearestEditorFromDOMNode,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  mergeRegister,
} from "lexical";
import { useEffect } from "react";

import { $isSkillNode } from "./SkillNode";

// ComposerEditor mounts Lexical 0.49 HistoryPlugin without a delay override.
const historyMergeDelayMs = 1_000;

type TextInsertionCaret = Readonly<{
  key: NodeKey;
  offset: number;
  type: "element" | "text";
}>;

type TextInsertionContinuation = Readonly<{
  caret: TextInsertionCaret;
  expiresAt: number;
}>;

export function SkillEditingPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          BEFORE_INPUT_COMMAND,
          createBeforeInputHandler(editor),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          CONTROLLED_TEXT_INSERTION_COMMAND,
          (payload) => replaceSelectedSkills(payload),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          DELETE_CHARACTER_COMMAND,
          () => deleteSelectedSkills(editor),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_ARROW_LEFT_COMMAND,
          (event) => navigateSkill(editor, event, "left"),
          COMMAND_PRIORITY_BEFORE_EDITOR,
        ),
        editor.registerCommand(
          KEY_ARROW_RIGHT_COMMAND,
          (event) => navigateSkill(editor, event, "right"),
          COMMAND_PRIORITY_BEFORE_EDITOR,
        ),
        editor.registerCommand(
          KEY_ARROW_UP_COMMAND,
          (event) => navigateSkill(editor, event, "up"),
          COMMAND_PRIORITY_BEFORE_EDITOR,
        ),
        editor.registerCommand(
          KEY_ARROW_DOWN_COMMAND,
          (event) => navigateSkill(editor, event, "down"),
          COMMAND_PRIORITY_BEFORE_EDITOR,
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND,
          (event) => deleteSelectedSkillsFromKeyboard(editor, event),
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          KEY_DELETE_COMMAND,
          (event) => deleteSelectedSkillsFromKeyboard(editor, event),
          COMMAND_PRIORITY_HIGH,
        ),
      ),
    [editor],
  );

  return null;
}

function createBeforeInputHandler(editor: LexicalEditor): (event: InputEvent) => boolean {
  let continuation: TextInsertionContinuation | null = null;

  return (event) => {
    const pendingContinuation = continuation;
    continuation = null;

    if (replaceSelectedSkillsFromBeforeInput(event)) {
      const caret = isOrdinaryTextInsertionBeforeInput(event) ? getCollapsedCaret() : null;
      if (caret != null) {
        continuation = {
          caret,
          expiresAt: event.timeStamp + historyMergeDelayMs,
        };
      }
      return true;
    }

    if (pendingContinuation == null || !continuesTextInsertion(pendingContinuation, event)) {
      return false;
    }

    const handled = editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, event);
    if (!handled) return false;
    $addUpdateTag(HISTORY_MERGE_TAG);
    event.preventDefault();
    return true;
  };
}

function replaceSelectedSkillsFromBeforeInput(event: InputEvent): boolean {
  if (!isTextInsertionBeforeInput(event) || !replaceSelectedSkills(event)) return false;
  event.preventDefault();
  return true;
}

function continuesTextInsertion(
  continuation: TextInsertionContinuation,
  event: InputEvent,
): boolean {
  if (!isOrdinaryTextInsertionBeforeInput(event) || event.timeStamp >= continuation.expiresAt) {
    return false;
  }

  const caret = getCollapsedCaret();
  return (
    caret?.key === continuation.caret.key &&
    caret.offset === continuation.caret.offset &&
    caret.type === continuation.caret.type
  );
}

function isOrdinaryTextInsertionBeforeInput(event: InputEvent): boolean {
  return (
    event.inputType === "insertText" &&
    event.data != null &&
    event.data !== "" &&
    event.data !== "\n" &&
    event.data !== "\n\n"
  );
}

function isTextInsertionBeforeInput(event: InputEvent): boolean {
  switch (event.inputType) {
    case "insertText":
      return event.data !== "\n" && event.data !== "\n\n";
    case "insertTranspose":
    case "insertFromYank":
    case "insertFromDrop":
    case "insertReplacementText":
    case "insertFromComposition":
      return true;
    default:
      return false;
  }
}

function replaceSelectedSkills(payload: InputEvent | string): boolean {
  const selection = getSelectedSkills();
  if (selection == null) return false;

  const text =
    typeof payload === "string"
      ? payload
      : (payload.dataTransfer?.getData("text/plain") ?? payload.data);
  if (text == null || text === "") return false;

  selection.insertNodes($generateNodesFromRawText(text));
  return true;
}

function deleteSelectedSkills(editor: LexicalEditor): boolean {
  const selection = getSelectedSkills();
  if (selection == null) return false;
  selection.deleteNodes();
  focusCurrentRoot(editor);
  return true;
}

function deleteSelectedSkillsFromKeyboard(editor: LexicalEditor, event: KeyboardEvent): boolean {
  const selection = getSelectedSkills();
  if (selection == null) return false;
  event.preventDefault();
  selection.deleteNodes();
  focusCurrentRoot(editor);
  return true;
}

type SkillNavigationDirection = "down" | "left" | "right" | "up";

type DomSelectionSnapshot = Readonly<{
  activeElement: HTMLElement;
  anchorNode: Node;
  anchorOffset: number;
  focusNode: Node;
  focusOffset: number;
  rootScrollLeft: number;
  rootScrollTop: number;
  windowScrollX: number;
  windowScrollY: number;
}>;

function navigateSkill(
  editor: LexicalEditor,
  event: KeyboardEvent,
  direction: SkillNavigationDirection,
): boolean {
  if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false;

  const selection = $getSelection();
  if ($isNodeSelection(selection)) {
    return exitSelectedSkill(editor, event, direction, selection.getNodes());
  }
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const root = editor.getRootElement();
  const domSelection = root?.ownerDocument.getSelection();
  const activeElement = root?.ownerDocument.activeElement;
  if (
    root == null ||
    !root.isConnected ||
    domSelection == null ||
    !domSelection.isCollapsed ||
    domSelection.anchorNode == null ||
    domSelection.focusNode == null ||
    activeElement !== root ||
    !root.contains(domSelection.anchorNode) ||
    !root.contains(domSelection.focusNode) ||
    getNearestEditorFromDOMNode(domSelection.anchorNode) !== editor ||
    getNearestEditorFromDOMNode(domSelection.focusNode) !== editor
  ) {
    return false;
  }

  const snapshot = captureDomSelection(
    root,
    domSelection,
    root,
    domSelection.anchorNode,
    domSelection.focusNode,
  );
  const startRect = caretRect(snapshot.anchorNode, snapshot.anchorOffset);
  if (startRect == null || !isUsableCaretRect(startRect)) return false;
  let skillKey: NodeKey | null = null;
  try {
    domSelection.modify(
      "move",
      direction === "left"
        ? "left"
        : direction === "right"
          ? "right"
          : direction === "up"
            ? "backward"
            : "forward",
      direction === "left" || direction === "right" ? "character" : "line",
    );
    const targetNode = domSelection.anchorNode;
    if (root.contains(targetNode) && getNearestEditorFromDOMNode(targetNode) === editor) {
      const targetRect = caretRect(targetNode, domSelection.anchorOffset);
      if (
        targetRect != null &&
        isUsableCaretRect(targetRect) &&
        (targetNode !== snapshot.anchorNode || domSelection.anchorOffset !== snapshot.anchorOffset)
      ) {
        skillKey = findFirstSkillOnCaretPath(
          editor,
          root,
          targetNode,
          startRect,
          targetRect,
          direction,
        );
      }
    }
  } finally {
    restoreDomSelection(root, domSelection, snapshot);
  }

  if (skillKey == null) return false;
  return selectSkillForNavigation(editor, root, snapshot, event, skillKey);
}

function selectSkillForNavigation(
  editor: LexicalEditor,
  root: HTMLElement,
  snapshot: DomSelectionSnapshot,
  event: KeyboardEvent,
  skillKey: NodeKey,
): boolean {
  const nodeSelection = $createNodeSelection();
  nodeSelection.add(skillKey);
  $setSelection(nodeSelection);
  scheduleDomSelectionCleanup(editor, root, skillKey);
  restoreDomFocusAndScroll(root, snapshot);
  event.preventDefault();
  return true;
}

function exitSelectedSkill(
  editor: LexicalEditor,
  event: KeyboardEvent,
  direction: SkillNavigationDirection,
  nodes: readonly LexicalNode[],
): boolean {
  if (nodes.length !== 1 || !$isSkillNode(nodes[0])) return false;

  const node = nodes[0];
  const root = editor.getRootElement();
  const parent = node.getParent();
  if (root == null || parent == null || !node.isAttached()) return false;
  const nodeIndex = node.getIndexWithinParent();
  const parentElement = editor.getElementByKey(parent.getKey());
  if (parentElement == null || nodeIndex < 0) return false;

  const exitsVisualLeft = direction === "left" || direction === "up";
  const isParentRtl =
    parentElement.ownerDocument.defaultView?.getComputedStyle(parentElement).direction === "rtl";
  const exitsBefore = exitsVisualLeft === !isParentRtl;
  const rangeSelection = $createRangeSelection();
  const offset = nodeIndex + (exitsBefore ? 0 : 1);
  rangeSelection.anchor.set(parent.getKey(), offset, "element");
  rangeSelection.focus.set(parent.getKey(), offset, "element");
  $setSelection(rangeSelection);
  event.preventDefault();
  return true;
}

function captureDomSelection(
  root: HTMLElement,
  selection: Selection,
  activeElement: HTMLElement,
  anchorNode: Node,
  focusNode: Node,
): DomSelectionSnapshot {
  const view = root.ownerDocument.defaultView;
  return {
    activeElement,
    anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode,
    focusOffset: selection.focusOffset,
    rootScrollLeft: root.scrollLeft,
    rootScrollTop: root.scrollTop,
    windowScrollX: view?.scrollX ?? 0,
    windowScrollY: view?.scrollY ?? 0,
  };
}

function restoreDomSelection(
  root: HTMLElement,
  selection: Selection,
  snapshot: DomSelectionSnapshot,
): void {
  selection.setBaseAndExtent(
    snapshot.anchorNode,
    snapshot.anchorOffset,
    snapshot.focusNode,
    snapshot.focusOffset,
  );
  restoreDomFocusAndScroll(root, snapshot);
}

function restoreDomFocusAndScroll(root: HTMLElement, snapshot: DomSelectionSnapshot): void {
  if (
    root.ownerDocument.activeElement !== snapshot.activeElement &&
    snapshot.activeElement.isConnected
  ) {
    snapshot.activeElement.focus({ preventScroll: true });
  }
  if (root.scrollLeft !== snapshot.rootScrollLeft) root.scrollLeft = snapshot.rootScrollLeft;
  if (root.scrollTop !== snapshot.rootScrollTop) root.scrollTop = snapshot.rootScrollTop;
  const view = root.ownerDocument.defaultView;
  if (
    view != null &&
    (view.scrollX !== snapshot.windowScrollX || view.scrollY !== snapshot.windowScrollY)
  ) {
    view.scrollTo(snapshot.windowScrollX, snapshot.windowScrollY);
  }
}

function scheduleDomSelectionCleanup(
  editor: LexicalEditor,
  root: HTMLElement,
  skillKey: NodeKey,
): void {
  const view = root.ownerDocument.defaultView;
  if (view == null) return;
  view.requestAnimationFrame(() => {
    view.requestAnimationFrame(() => {
      if (!root.isConnected || editor.getRootElement() !== root) return;
      const isStillSelected = editor.read(() => {
        const selection = $getSelection();
        return $isNodeSelection(selection) && selection.has(skillKey);
      });
      if (!isStillSelected || editor.getRootElement() !== root) return;

      const domSelection = root.ownerDocument.getSelection();
      const anchorNode = domSelection?.anchorNode;
      const focusNode = domSelection?.focusNode;
      if (
        domSelection == null ||
        anchorNode == null ||
        focusNode == null ||
        !root.contains(anchorNode) ||
        !root.contains(focusNode)
      ) {
        return;
      }
      domSelection.removeAllRanges();
    });
  });
}

function findFirstSkillOnCaretPath(
  editor: LexicalEditor,
  root: HTMLElement,
  targetNode: Node,
  start: DOMRect,
  target: DOMRect,
  direction: SkillNavigationDirection,
): NodeKey | null {
  const skills = Array.from(
    root.querySelectorAll<HTMLElement>('[contenteditable="false"]'),
  ).flatMap((host) => {
    const node = $getNearestNodeFromDOMNode(host);
    const rect = host.getBoundingClientRect();
    return $isSkillNode(node) && node.isAttached() && editor.getElementByKey(node.getKey()) === host
      ? [{ host, key: node.getKey(), rect }]
      : [];
  });
  const targetSkills = skills.filter(({ host }) => host.contains(targetNode));
  if (targetSkills.length !== 0) {
    return targetSkills.length === 1 ? (targetSkills[0]?.key ?? null) : null;
  }

  const matches = skills.filter(
    ({ rect }) =>
      rect.width > 0 && rect.height > 0 && caretPathCrossesSkill(start, target, rect, direction),
  );
  matches.sort((a, b) => skillPathOrder(a.rect, b.rect, direction));
  const first = matches[0];
  const second = matches[1];
  if (
    first == null ||
    (second != null && skillPathOrder(first.rect, second.rect, direction) === 0)
  ) {
    return null;
  }
  return first.key;
}

function skillPathOrder(a: DOMRect, b: DOMRect, direction: SkillNavigationDirection): number {
  switch (direction) {
    case "left":
      return b.right - a.right;
    case "right":
      return a.left - b.left;
    case "up":
      return b.bottom - a.bottom;
    case "down":
      return a.top - b.top;
  }
}

function caretPathCrossesSkill(
  start: DOMRect,
  target: DOMRect,
  skill: DOMRect,
  direction: SkillNavigationDirection,
): boolean {
  const startX = start.left;
  const startY = start.top + start.height / 2;
  const targetX = target.left;
  const targetY = target.top + target.height / 2;
  const startIntersectsSkillY = start.top < skill.bottom && start.bottom > skill.top;
  const targetIntersectsSkillY = target.top < skill.bottom && target.bottom > skill.top;
  switch (direction) {
    case "left":
      return (
        startX >= skill.right &&
        targetX <= skill.right &&
        startIntersectsSkillY &&
        targetIntersectsSkillY
      );
    case "right":
      return (
        startX <= skill.left &&
        targetX >= skill.left &&
        startIntersectsSkillY &&
        targetIntersectsSkillY
      );
    case "up":
      return (
        startY > skill.bottom &&
        targetY <= skill.bottom &&
        ((startX >= skill.left && startX <= skill.right) ||
          (targetX >= skill.left && targetX <= skill.right))
      );
    case "down":
      return (
        startY < skill.top &&
        targetY >= skill.top &&
        ((startX >= skill.left && startX <= skill.right) ||
          (targetX >= skill.left && targetX <= skill.right))
      );
  }
}

function caretRect(node: Node, offset: number): DOMRect | null {
  const document = node.ownerDocument;
  if (document == null) return null;
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const collapsed = range.getBoundingClientRect();
  if (collapsed.height > 0) return collapsed;
  if (!(node instanceof Text) || node.length === 0) return collapsed;
  const direction = getComputedStyle(node.parentElement ?? document.body).direction;
  if (offset < node.length) {
    range.setEnd(node, offset + 1);
    const character = range.getBoundingClientRect();
    return new DOMRect(
      direction === "rtl" ? character.right : character.left,
      character.top,
      0,
      character.height,
    );
  }
  range.setStart(node, offset - 1);
  const character = range.getBoundingClientRect();
  return new DOMRect(
    direction === "rtl" ? character.left : character.right,
    character.top,
    0,
    character.height,
  );
}

function isUsableCaretRect(rect: DOMRect): boolean {
  return (
    rect.height > 0 &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom)
  );
}

function getSelectedSkills() {
  const selection = $getSelection();
  if (!$isNodeSelection(selection)) return null;
  const nodes = selection.getNodes();
  if (nodes.length === 0 || nodes.some((node) => !$isSkillNode(node))) return null;
  return selection;
}

function getCollapsedCaret(): TextInsertionCaret | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  return {
    key: selection.anchor.key,
    offset: selection.anchor.offset,
    type: selection.anchor.type,
  };
}

function focusCurrentRoot(editor: LexicalEditor): void {
  const root = editor.getRootElement();
  if (root?.isConnected) root.focus({ preventScroll: true });
}
