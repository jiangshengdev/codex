import {
  $createNodeSelection,
  $getSelection,
  $isNodeSelection,
  $nodesOfType,
  $setSelection,
  getNearestEditorFromDOMNode,
} from "lexical";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type { ComposerEditorProps } from "../ComposerEditor";
import { SkillNode } from "../SkillNode";
import { getController, renderEditor, skill } from "./composerEditorBrowserTestSupport";

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

test("keeps a skill token atomic across deletion, undo, and redo", async () => {
  const { controllerRef, screen } = await renderEditor([skill("atomic", "/atomic")]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$ato");
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$atomic");

  await screen.user.keyboard("{Backspace}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("");

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$atomic");

  dispatchHistoryShortcut(editor.element(), "redo");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("");
});

test("replaces and deletes multiple selected skills as one atomic selection", async () => {
  const { controllerRef, screen } = await renderEditor([
    skill("first", "/skills/first/SKILL.md", "First"),
    skill("second", "/skills/second/SKILL.md", "Second"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$fir");
  await expect.element(screen.getByRole("option", { name: /First/i })).toBeVisible();
  await screen.user.keyboard("{Enter}");
  await screen.user.keyboard("$sec");
  await expect.element(screen.getByRole("option", { name: /Second/i })).toBeVisible();
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => readSkillNodeCount(editor.element())).toBe(2);
  expect(selectAllSkillNodes(editor.element())).toBe(2);
  editor.element().focus();
  await expect.element(editor).toHaveFocus();
  expect(readNodeSelectionSize(editor.element())).toBe(2);

  const replacementEvent = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: "replacement",
    inputType: "insertText",
  });
  expect(editor.element().dispatchEvent(replacementEvent)).toBe(false);
  expect(replacementEvent.defaultPrevented).toBe(true);

  await expect
    .poll(() => getController(controllerRef).getSnapshot())
    .toMatchObject({ selectedSkillPaths: [], textContent: "replacement" });
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "replacement", text_elements: [] },
  ]);

  await editor.fill("$fir");
  await expect.element(screen.getByRole("option", { name: /First/i })).toBeVisible();
  await screen.user.keyboard("{Enter}");
  await screen.user.keyboard("$sec");
  await expect.element(screen.getByRole("option", { name: /Second/i })).toBeVisible();
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => readSkillNodeCount(editor.element())).toBe(2);
  expect(selectAllSkillNodes(editor.element())).toBe(2);
  editor.element().focus();
  await expect.element(editor).toHaveFocus();
  expect(readNodeSelectionSize(editor.element())).toBe(2);

  await screen.user.keyboard("{Delete}");

  await expect
    .poll(() => getController(controllerRef).getSnapshot())
    .toMatchObject({ selectedSkillPaths: [], textContent: "" });
});

test("uses a real mouse click to select a skill while the editor keeps DOM focus", async () => {
  const selectedSkill = skill("atomic", "/skills/atomic/SKILL.md", "Atomic");
  const { controllerRef, screen } = await renderEditor([selectedSkill]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  const initialText = "abc $ato def";

  await editor.fill(initialText);
  await editor.click();
  setCollapsedCaret(editor.element(), initialText, "abc $ato".length);
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Enter}");

  const host = screen.getByRole("group", { name: /Atomic/i });
  const chip = host.element().querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement)) {
    throw new Error("selected skill must render a HeroUI Chip");
  }
  const snapshotBeforeSelection = getController(controllerRef).getSnapshot();
  await expect.element(editor).toHaveFocus();
  await expect.element(chip).not.toHaveAttribute("data-selected");

  await host.getByText("$Atomic", { exact: true }).click();

  await expect.element(editor).toHaveFocus();
  expect(readNodeSelectionSize(editor.element())).toBe(1);
  await expect.element(host).toHaveAttribute("data-selected");
  await expect.element(chip).toHaveAttribute("data-selected");
  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBeforeSelection);
  await expect.poll(() => collapsedCaretOffset(editor.element())).toBeNull();
});

test("uses ordinary click for one skill and Shift click to toggle a multi-selection", async () => {
  const firstSkill = skill("first", "/skills/first/SKILL.md", "First");
  const secondSkill = skill("second", "/skills/second/SKILL.md", "Second");
  const { controllerRef, screen } = await renderEditor([firstSkill, secondSkill]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$fir");
  await screen.user.keyboard("{Enter}");
  await screen.user.keyboard(" $sec");
  await screen.user.keyboard("{Enter}");

  const firstHost = screen.getByRole("group", { name: /First/i });
  const secondHost = screen.getByRole("group", { name: /Second/i });
  const firstChip = firstHost.element().querySelector('[data-slot="chip"]');
  const secondChip = secondHost.element().querySelector('[data-slot="chip"]');
  if (!(firstChip instanceof HTMLSpanElement) || !(secondChip instanceof HTMLSpanElement)) {
    throw new Error("selected skills must render HeroUI Chips");
  }
  const snapshotBeforeSelection = getController(controllerRef).getSnapshot();

  await firstHost.getByText("$First", { exact: true }).click();
  expect(readNodeSelectionSize(editor.element())).toBe(1);
  await expect.element(firstHost).toHaveAttribute("data-selected");
  await expect.element(secondHost).not.toHaveAttribute("data-selected");
  await expect.element(firstChip).toHaveAttribute("data-selected");
  await expect.element(secondChip).not.toHaveAttribute("data-selected");

  await secondHost.getByText("$Second", { exact: true }).click({ modifiers: ["Shift"] });
  expect(readNodeSelectionSize(editor.element())).toBe(2);
  await expect.element(firstHost).toHaveAttribute("data-selected");
  await expect.element(secondHost).toHaveAttribute("data-selected");
  await expect.element(firstChip).toHaveAttribute("data-selected");
  await expect.element(secondChip).toHaveAttribute("data-selected");

  await firstHost.getByText("$First", { exact: true }).click({ modifiers: ["Shift"] });
  expect(readNodeSelectionSize(editor.element())).toBe(1);
  await expect.element(firstHost).not.toHaveAttribute("data-selected");
  await expect.element(secondHost).toHaveAttribute("data-selected");
  await expect.element(firstChip).not.toHaveAttribute("data-selected");
  await expect.element(secondChip).toHaveAttribute("data-selected");

  await firstHost.getByText("$First", { exact: true }).click();
  expect(readNodeSelectionSize(editor.element())).toBe(1);
  await expect.element(firstHost).toHaveAttribute("data-selected");
  await expect.element(secondHost).not.toHaveAttribute("data-selected");
  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBeforeSelection);
});

test.for(["touch", "pen"] as const)(
  "cancels primary $0 pointer down while its compatible click still selects the skill",
  async (pointerType) => {
    const selectedSkill = skill(pointerType, `/skills/${pointerType}/SKILL.md`, pointerType);
    const { screen } = await renderEditor([selectedSkill]);
    const editor = screen.getByRole("combobox", { name: "Message" });

    await editor.fill(`$${pointerType}`);
    await screen.user.keyboard("{Enter}");
    const host = screen.getByRole("group", { name: new RegExp(pointerType, "i") });
    const chip = host.element().querySelector('[data-slot="chip"]');
    if (!(chip instanceof HTMLSpanElement)) {
      throw new Error("selected skill must render a HeroUI Chip");
    }
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      isPrimary: true,
      pointerType,
    });

    expect(chip.dispatchEvent(pointerDown)).toBe(false);
    expect(pointerDown.defaultPrevented).toBe(true);

    chip.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }));
    await expect.poll(() => readNodeSelectionSize(editor.element())).toBe(1);
    await expect.element(host).toHaveAttribute("data-selected");
    await expect.element(chip).toHaveAttribute("data-selected");
  },
);

test("uses pointer selection to replace, delete, and restore one atomic token", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor(
    [skill("atomic-trigger", "/skills/atomic-trigger/SKILL.md", "Atomic Trigger")],
    { onSubmit },
  );
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$atomic");
  await screen.user.keyboard("{Enter}");
  let host = screen.getByRole("group", { name: /Atomic Trigger/i });
  await host.getByText("$Atomic Trigger", { exact: true }).click();
  await expect.element(editor).toHaveFocus();
  expect(readNodeSelectionSize(editor.element())).toBe(1);
  expect(onSubmit).not.toHaveBeenCalled();
  const replacementEvent = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: "replacement",
    inputType: "insertText",
  });
  expect(editor.element().dispatchEvent(replacementEvent)).toBe(false);
  expect(replacementEvent.defaultPrevented).toBe(true);
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("replacement");
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "replacement", text_elements: [] },
  ]);

  await editor.fill("$atomic");
  await screen.user.keyboard("{Enter}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Atomic Trigger");
  host = screen.getByRole("group", { name: /Atomic Trigger/i });
  await host.getByText("$Atomic Trigger", { exact: true }).click();
  await expect.element(editor).toHaveFocus();
  expect(readNodeSelectionSize(editor.element())).toBe(1);
  await screen.user.keyboard("{Delete}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("");

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Atomic Trigger");
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "$atomic-trigger", text_elements: [] },
    {
      type: "skill",
      name: "atomic-trigger",
      path: "/skills/atomic-trigger/SKILL.md",
    },
  ]);
});

test("keeps a double-clicked skill atomic without adding an internal editor", async () => {
  const selectedSkill = skill("double", "/skills/double/SKILL.md", "Double Click");
  const { controllerRef, screen } = await renderEditor([selectedSkill]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$double");
  await screen.user.keyboard("{Enter}");
  const host = screen.getByRole("group", { name: /Double Click/i });
  const chipLabel = host.getByText("$Double Click", { exact: true });
  const snapshotBefore = getController(controllerRef).getSnapshot();

  await chipLabel.click();
  chipLabel
    .element()
    .dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0, cancelable: true }));

  await expect.element(editor).toHaveFocus();
  expect(readNodeSelectionSize(editor.element())).toBe(1);
  await expect.element(host).toHaveAttribute("data-selected");
  expect(host.element().querySelector("input, textarea, [contenteditable='true']")).toBeNull();
  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBefore);
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "$double", text_elements: [] },
    { type: "skill", name: selectedSkill.name, path: selectedSkill.path },
  ]);
});

function selectAllSkillNodes(root: Element): number {
  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) throw new Error("composer root must belong to a Lexical editor");
  let selectedCount = 0;
  editor.update(
    () => {
      const skillNodes = $nodesOfType(SkillNode);
      if (skillNodes.length === 0) throw new Error("composer must contain selected Skill nodes");
      const selection = $createNodeSelection();
      for (const node of skillNodes) selection.add(node.getKey());
      $setSelection(selection);
      selectedCount = skillNodes.length;
    },
    { discrete: true },
  );
  return selectedCount;
}

function readSkillNodeCount(root: Element): number {
  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) throw new Error("composer root must belong to a Lexical editor");
  return editor.getEditorState().read(() => $nodesOfType(SkillNode).length);
}

function collapsedCaretOffset(root: Element): number | null {
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

function readNodeSelectionSize(root: Element): number | null {
  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) throw new Error("composer root must belong to a Lexical editor");
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isNodeSelection(selection) ? selection.getNodes().length : null;
  });
}

function setCollapsedCaret(root: Element, expectedText: string, offset: number): void {
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

function dispatchHistoryShortcut(element: Element, command: "undo" | "redo"): void {
  const isApple = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const isRedo = command === "redo";
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: !isApple,
      key: isRedo && !isApple ? "y" : "z",
      metaKey: isApple,
      shiftKey: isRedo && isApple,
    }),
  );
}
