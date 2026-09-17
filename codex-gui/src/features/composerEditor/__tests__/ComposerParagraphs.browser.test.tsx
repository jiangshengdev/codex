import { expect, test, vi } from "vitest";

import type { ComposerEditorProps } from "../ComposerEditor";
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
  await screen.user.keyboard("{Home}{ArrowLeft}R");
  await expect.poll(() => controller.capture().textContent).toBe("first\n$alphaR\nlast");
  await screen.user.keyboard("{ArrowLeft}{ArrowLeft}L");
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
  await screen.user.keyboard("{ArrowLeft}{ArrowLeft}middle");
  await expect.poll(() => controller.capture().textContent).toBe("$alphamiddle$beta");
  expect(controller.capture().selectedSkillPaths).toEqual(["/skills/alpha", "/skills/beta"]);
});
