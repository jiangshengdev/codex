import { expect, test, vi } from "vitest";
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  createEditor,
  getNearestEditorFromDOMNode,
} from "lexical";

import type { ComposerEditorProps } from "../ComposerEditor";
import { importComposerDraft } from "../composerDraft";
import { $createSkillNode, SkillNode } from "../SkillNode";
import { getController, renderEditor, skill } from "./composerEditorBrowserTestSupport";

test("Shift+Enter preserves blank lines as paragraphs and submits one newline per boundary", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor([], { onSubmit });
  const editor = screen.getByRole("combobox", { name: "Message" });
  await editor.click();
  await screen.user.keyboard(
    "{Shift>}{Enter}{/Shift}first{Shift>}{Enter}{Enter}{/Shift}last{Shift>}{Enter}{/Shift}",
  );
  const controller = getController(controllerRef);
  await expect.poll(() => controller.getSnapshot().textContent).toBe("\nfirst\n\nlast\n");
  expect(editor.element().querySelectorAll(":scope > p")).toHaveLength(5);
  expect(onSubmit).not.toHaveBeenCalled();
  await screen.user.keyboard("{Enter}");
  expect(onSubmit.mock.calls[0]?.[0].input).toEqual([
    { type: "text", text: "\nfirst\n\nlast\n", text_elements: [] },
  ]);
  const paragraphs = Array.from(editor.element().querySelectorAll("p"));
  for (const paragraph of paragraphs) {
    expect(getComputedStyle(paragraph).marginTop).toBe("0px");
    expect(getComputedStyle(paragraph).marginBottom).toBe("0px");
  }
});

test("reaches both sides of a standalone skill across paragraphs with arrow keys", async () => {
  const { controllerRef, screen } = await renderEditor([skill("alpha", "/skills/alpha")]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  await editor.fill("first");
  await screen.user.keyboard("{Shift>}{Enter}{/Shift}$alp");
  await screen.user.keyboard("{Enter}");
  await screen.user.keyboard("{Shift>}{Enter}{/Shift}last");
  const controller = getController(controllerRef);
  await expect.poll(() => controller.capture().textContent).toBe("first\n$alpha\nlast");
  // Firefox native caret movement needs iframe focus, even when the editor is activeElement.
  window.focus();
  // Move across "last" without relying on platform-specific Home behavior.
  await screen.user.keyboard("{ArrowLeft>4/}");
  await screen.user.keyboard("{ArrowLeft}R");
  await expect.poll(() => controller.capture().textContent).toBe("first\n$alphaR\nlast");
  await screen.user.keyboard("{ArrowLeft}");
  await screen.user.keyboard("{ArrowLeft}");
  await expect.poll(() => selectedSkillText(editor.element())).toBe("$alpha");
  await screen.user.keyboard("{ArrowLeft}");
  await screen.user.keyboard("L");
  await expect.poll(() => controller.capture().textContent).toBe("first\nL$alphaR\nlast");
  expect(controller.capture().selectedSkillPaths).toEqual(["/skills/alpha"]);
});

test("reaches between adjacent skills without replacing either node", async () => {
  const { controllerRef, screen } = await renderEditor([
    skill("alpha", "/skills/alpha"),
    skill("beta", "/skills/beta"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  await editor.fill("$alp");
  await screen.user.keyboard("{Enter}");
  await screen.user.keyboard("$bet");
  await expect.element(screen.getByRole("option", { name: /beta/i })).toBeVisible();
  await screen.user.keyboard("{Enter}");
  const controller = getController(controllerRef);
  await expect.poll(() => controller.capture().textContent).toBe("$alpha$beta");
  await screen.user.keyboard("{ArrowLeft}");
  await expect.poll(() => selectedSkillText(editor.element())).toBe("$beta");
  await screen.user.keyboard("{ArrowLeft}");
  await screen.user.keyboard("middle");
  await expect.poll(() => controller.capture().textContent).toBe("$alphamiddle$beta");
  expect(controller.capture().selectedSkillPaths).toEqual(["/skills/alpha", "/skills/beta"]);
});

test.each([
  ["text/plain", "\nfirst\n\nlast\n"],
  ["text/html", "<p><br>first<br><br>last<br><br></p>"],
])("pastes %s with blank lines into the same paragraph model", async (mime, value) => {
  const { controllerRef, screen } = await renderEditor([]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  await editor.click();
  const data = new DataTransfer();
  data.setData(mime, value);
  const pasteEvent = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
  // Firefox creates a separate DataTransfer for synthetic clipboard events.
  Object.defineProperty(pasteEvent, "clipboardData", { value: data });
  editor.element().dispatchEvent(pasteEvent);
  const controller = getController(controllerRef);
  await expect.poll(() => controller.capture().textContent).toBe("\nfirst\n\nlast\n");
  expect(editor.element().querySelectorAll(":scope > p")).toHaveLength(5);
  await screen.user.keyboard("tail");
  await expect.poll(() => controller.capture().textContent).toBe("\nfirst\n\nlast\ntail");
});

test("restores legacy soft breaks as paragraphs and preserves editing, history, and submission", async () => {
  const legacy = createEditor({
    nodes: [SkillNode],
    onError: (error) => {
      throw error;
    },
  });
  legacy.update(
    () => {
      $getRoot().append(
        $createParagraphNode().append(
          $createTextNode("first"),
          $createLineBreakNode(),
          $createSkillNode({
            name: "alpha",
            displayName: "Alpha",
            path: "/skills/alpha",
            sourceLabel: "",
          }),
          $createLineBreakNode(),
          $createTextNode("last"),
        ),
      );
    },
    { discrete: true },
  );
  const imported = importComposerDraft({
    version: 1,
    editorStateJson: JSON.stringify(legacy.getEditorState().toJSON()),
  });
  if (imported.type !== "imported") throw new Error("Expected imported legacy draft");
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor([skill("alpha", "/skills/alpha", "Alpha")], {
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });
  const controller = getController(controllerRef);
  expect(controller.restore(imported.draft)).toEqual({ type: "restored" });
  await expect.poll(() => controller.capture().textContent).toBe("first\n$Alpha\nlast");
  expect(editor.element().querySelectorAll(":scope > p")).toHaveLength(3);
  // Restoring the editor selection does not activate the test iframe in Firefox.
  window.focus();
  // Move across "last" without relying on platform-specific Home behavior.
  await screen.user.keyboard("{ArrowLeft>4/}");
  await screen.user.keyboard("{ArrowLeft}R");
  await expect.poll(() => controller.capture().textContent).toBe("first\n$AlphaR\nlast");
  await screen.user.keyboard("{ArrowLeft}");
  await screen.user.keyboard("{ArrowLeft}");
  await expect.poll(() => selectedSkillText(editor.element())).toBe("$Alpha");
  await screen.user.keyboard("{ArrowLeft}");
  await screen.user.keyboard("L");
  await expect.poll(() => controller.capture().textContent).toBe("first\nL$AlphaR\nlast");
  await screen.user.keyboard("{Delete}");
  await expect.poll(() => controller.capture().textContent).toBe("first\nLR\nlast");
  await screen.user.keyboard(
    navigator.platform.startsWith("Mac") ? "{Meta>}z{/Meta}" : "{Control>}z{/Control}",
  );
  await expect.poll(() => controller.capture().textContent).toBe("first\nL$AlphaR\nlast");
  await screen.user.keyboard(
    navigator.platform.startsWith("Mac")
      ? "{Meta>}{Shift>}z{/Shift}{/Meta}"
      : "{Control>}y{/Control}",
  );
  await expect.poll(() => controller.capture().textContent).toBe("first\nLR\nlast");
  expect(controller.restore(imported.draft)).toEqual({ type: "restored" });
  await expect.poll(() => controller.capture().textContent).toBe("first\n$Alpha\nlast");
  await screen.user.keyboard("{Enter}");
  expect(onSubmit.mock.calls[0]?.[0].input).toEqual([
    { type: "text", text: "first\n$alpha\nlast", text_elements: [] },
    { type: "skill", name: "alpha", path: "/skills/alpha" },
  ]);
});

test.each(["manual", "paste", "restore"] as const)(
  "%s content keeps right-arrow insertion stops before, between, and after skills",
  async (entry) => {
    const { controllerRef, screen } = await renderEditor([
      skill("alpha", "/skills/alpha"),
      skill("beta", "/skills/beta"),
    ]);
    const editor = screen.getByRole("combobox", { name: "Message" });
    const controller = getController(controllerRef);
    await editor.fill("a");
    await screen.user.keyboard("{Shift>}{Enter}{/Shift}$alp");
    await expect.element(screen.getByRole("option", { name: /alpha/i })).toBeVisible();
    await screen.user.keyboard("{Enter}");
    await screen.user.keyboard("$bet");
    await expect.element(screen.getByRole("option", { name: /beta/i })).toBeVisible();
    await screen.user.keyboard("{Enter}");
    await screen.user.keyboard("{Shift>}{Enter}{/Shift}$alp");
    await expect.element(screen.getByRole("option", { name: /alpha/i })).toBeVisible();
    await screen.user.keyboard("{Enter}");
    await screen.user.keyboard("{Shift>}{Enter}{/Shift}b");
    await expect.poll(() => controller.capture().textContent).toBe("a\n$alpha$beta\n$alpha\nb");
    const prepareEntry = {
      manual: () => undefined,
      restore: () => {
        const capture = controller.capture();
        expect(controller.clearIfCurrent(capture)).toBe(true);
        expect(controller.restore(capture.draft)).toEqual({ type: "restored" });
      },
      paste: async () => {
        await screen.user.keyboard(
          navigator.platform.startsWith("Mac") ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}",
        );
        const data = new DataTransfer();
        const copyEvent = new ClipboardEvent("copy", { bubbles: true, cancelable: true });
        // Firefox creates a separate DataTransfer for synthetic clipboard events.
        Object.defineProperty(copyEvent, "clipboardData", { value: data });
        editor.element().dispatchEvent(copyEvent);
        expect(data.getData("text/plain")).toBe("a\n$alpha$beta\n$alpha\nb");
        expect(controller.clearIfCurrent(controller.capture())).toBe(true);
        await expect.poll(() => controller.capture().textContent).toBe("");
        await editor.click();
        const pasteEvent = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(pasteEvent, "clipboardData", { value: data });
        editor.element().dispatchEvent(pasteEvent);
      },
    };
    await prepareEntry[entry]();
    await expect.poll(() => controller.capture().textContent).toBe("a\n$alpha$beta\n$alpha\nb");
    // Activate the iframe before native navigation after manual input, paste, or restore.
    window.focus();
    await screen.user.keyboard("{ArrowLeft>20/}");
    await screen.user.keyboard("{ArrowRight}");
    await screen.user.keyboard("{ArrowRight}");
    await screen.user.keyboard("L");
    await expect.poll(() => controller.capture().textContent).toBe("a\nL$alpha$beta\n$alpha\nb");
    await screen.user.keyboard("{ArrowRight}");
    await expect.poll(() => selectedSkillText(editor.element())).toBe("$alpha");
    await screen.user.keyboard("{ArrowRight}");
    await screen.user.keyboard("middle");
    await expect
      .poll(() => controller.capture().textContent)
      .toBe("a\nL$alphamiddle$beta\n$alpha\nb");
    await screen.user.keyboard("{ArrowRight}");
    await expect.poll(() => selectedSkillText(editor.element())).toBe("$beta");
    await screen.user.keyboard("{ArrowRight}");
    await screen.user.keyboard("R");
    await expect
      .poll(() => controller.capture().textContent)
      .toBe("a\nL$alphamiddle$betaR\n$alpha\nb");
    await screen.user.keyboard("{ArrowRight}");
    await screen.user.keyboard("S");
    await expect
      .poll(() => controller.capture().textContent)
      .toBe("a\nL$alphamiddle$betaR\nS$alpha\nb");
    await screen.user.keyboard("{ArrowRight}");
    await expect.poll(() => selectedSkillText(editor.element())).toBe("$alpha");
    await screen.user.keyboard("{ArrowRight}");
    await screen.user.keyboard("T");
    await expect
      .poll(() => controller.capture().textContent)
      .toBe("a\nL$alphamiddle$betaR\nS$alphaT\nb");
    await screen.user.keyboard("{ArrowRight}");
    await screen.user.keyboard("next");
    await expect
      .poll(() => controller.capture().textContent)
      .toBe("a\nL$alphamiddle$betaR\nS$alphaT\nnextb");
    expect(controller.capture().selectedSkillPaths).toEqual([
      "/skills/alpha",
      "/skills/beta",
      "/skills/alpha",
    ]);
  },
);

function selectedSkillText(root: Element): string | null {
  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) throw new Error("Expected composer editor");
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isNodeSelection(selection)
      ? selection
          .getNodes()
          .map((node) => node.getTextContent())
          .join("")
      : null;
  });
}
