import { $getRoot, $getSelection, $isRangeSelection, getNearestEditorFromDOMNode } from "lexical";
import { expect, test } from "vitest";

import { getController, renderEditor, skill } from "./composerEditorBrowserTestSupport";
import { dispatchHistoryShortcut } from "./composerKeyboardBrowserTestSupport";

test.for(["Delete", "Backspace"])(
  "deletes the DOM range before selectionchange on %s and restores the skill on undo",
  async (key) => {
    const { controllerRef, screen } = await renderEditor([skill("atomic", "/atomic")]);
    const input = screen.getByRole("combobox", { name: "Message" });
    await input.fill("$ato");
    await screen.user.keyboard("{Enter}");
    await expect
      .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
      .toEqual(["/atomic"]);

    const root = input.element();
    const editor = getNearestEditorFromDOMNode(root);
    if (editor == null) throw new Error("expected a Lexical editor");
    editor.update(
      () => {
        if (key === "Delete") $getRoot().selectEnd();
        else $getRoot().selectStart();
      },
      { discrete: true },
    );
    const selection = root.ownerDocument.getSelection();
    if (selection == null) throw new Error("expected a DOM selection");
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.isCollapsed).toBe(false);
    expect(
      editor.getEditorState().read(() => {
        const modelSelection = $getSelection();
        return $isRangeSelection(modelSelection) && modelSelection.isCollapsed();
      }),
    ).toBe(true);

    // Keep selection and keydown in one task: the browser has not delivered selectionchange yet.
    root.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

    await expect
      .poll(() => getController(controllerRef).getSnapshot())
      .toMatchObject({
        selectedSkillPaths: [],
        textContent: "",
      });
    dispatchHistoryShortcut(root, "undo");
    await expect
      .poll(() => getController(controllerRef).getSnapshot())
      .toMatchObject({
        selectedSkillPaths: ["/atomic"],
        textContent: "$atomic",
      });
  },
);

test.for([
  { key: "Delete", anchor: 3, focus: 1, expected: "ad" },
  { key: "Backspace", anchor: 1, focus: 3, expected: "ad" },
  { key: "Delete", anchor: 1, focus: 1, expected: "acd" },
  { key: "Backspace", anchor: 1, focus: 1, expected: "bcd" },
])(
  "uses the current DOM text selection on $key ($anchor to $focus)",
  async ({ key, anchor, focus, expected }) => {
    const { controllerRef, screen } = await renderEditor([]);
    const input = screen.getByRole("combobox", { name: "Message" });
    await input.fill("abcd");
    const root = input.element();
    const editor = getNearestEditorFromDOMNode(root);
    if (editor == null) throw new Error("expected a Lexical editor");
    editor.update(() => $getRoot().selectEnd(), { discrete: true });
    const text = root.querySelector('[data-lexical-text="true"]')?.firstChild;
    const selection = root.ownerDocument.getSelection();
    if (!(text instanceof Text) || selection == null) throw new Error("expected selected text");
    selection.setBaseAndExtent(text, anchor, text, focus);
    root.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe(expected);
  },
);
