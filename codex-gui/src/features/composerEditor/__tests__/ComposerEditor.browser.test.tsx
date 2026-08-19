import { createRef, type RefObject } from "react";
import { expect, test, vi } from "vitest";
import { $getSelection, $isRangeSelection } from "lexical";

import { renderWithProviders } from "@/utils/test-utils";
import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";

import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorSnapshot,
} from "../ComposerEditor";
import { invalidSelectedSkillPaths } from "../../composerTurnControl/composerTurnControlModel";
import { compileComposerDraft } from "../compileComposerDraft";

test("opens a capped accessible skill list and keeps editor focus", async () => {
  const candidates = Array.from({ length: 25 }, (_, index) =>
    skill(`skill-${String(index).padStart(2, "0")}`, `/skills/${String(index)}`),
  );
  const { controllerRef, screen } = await renderEditor(candidates);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox).toBeVisible();
  await expect.poll(() => listbox.getByRole("option").length).toBe(20);
  await expect.element(editor).toHaveAttribute("aria-autocomplete", "list");
  await expect.element(editor).toHaveAttribute("aria-expanded", "true");
  await expect.element(editor).toHaveAttribute("aria-controls", listbox.element().id);
  await expect.element(editor).toHaveAttribute("aria-activedescendant", "typeahead-item-0");
  await expect
    .element(listbox.getByRole("option").first())
    .toHaveAttribute("aria-selected", "true");
  await expect.element(editor).toHaveFocus();
  expect(getController(controllerRef).getRootElement()).toBe(editor.element());
});

test("filters by canonical and display names but never by description", async () => {
  const { screen } = await renderEditor([
    skill("canonical-match", "/canonical", "Friendly"),
    skill("other", "/display", "Display Match"),
    skill("description-only", "/description", "Hidden Candidate", "match appears only here"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$match");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox.getByRole("option", { name: /Friendly/ })).toBeVisible();
  await expect.element(listbox.getByRole("option", { name: /Display Match/ })).toBeVisible();
  await expect
    .element(listbox.getByRole("option", { name: /Hidden Candidate/ }))
    .not.toBeInTheDocument();
});

test("replaces a query at a middle caret with canonical skill input without submitting", async () => {
  const onSubmit = vi.fn<(snapshot: ComposerEditorSnapshot) => void>();
  const { controllerRef, screen } = await renderEditor(
    [skill("canonical-match", "/canonical", "Friendly")],
    { onSubmit },
  );
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("before $canonical after");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("before $canonical after");
  await editor.click();
  await expect.element(editor).toHaveFocus();
  setCollapsedCaret(editor.element(), "before $canonical after", 17);
  await expect
    .poll(() =>
      getController(controllerRef)
        .getSnapshot()
        .editorState.read(() => {
          const selection = $getSelection();
          return $isRangeSelection(selection) && selection.isCollapsed()
            ? selection.anchor.offset
            : null;
        }),
    )
    .toBe(17);
  await expect.element(editor).toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Enter}");

  expect(onSubmit).not.toHaveBeenCalled();
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("before $Friendly after");
  expect(compileComposerDraft(getController(controllerRef).getSnapshot().editorState)).toEqual([
    {
      type: "text",
      text: "before $canonical-match after",
      text_elements: [],
    },
    { type: "skill", name: "canonical-match", path: "/canonical" },
  ]);
});

test("uses Tab to choose, Escape to close, and Shift Enter only to add a line break", async () => {
  const onSubmit = vi.fn<(snapshot: ComposerEditorSnapshot) => void>();
  const { controllerRef, screen } = await renderEditor([skill("alpha", "/alpha")], {
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$alp");
  await screen.user.keyboard("{Tab}");
  expect(onSubmit).not.toHaveBeenCalled();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$alpha");

  await editor.fill("$");
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Escape}");
  await expect
    .element(screen.getByRole("listbox", { name: "Typeahead menu" }))
    .not.toBeInTheDocument();
  await expect.element(editor).toHaveAttribute("aria-expanded", "false");

  await editor.fill("Line");
  await screen.user.keyboard("{Shift>}{Enter}{/Shift}");
  expect(onSubmit).not.toHaveBeenCalled();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("Line\n");
});

test("submits plain text without letting Enter rewrite the editor snapshot", async () => {
  const onSubmit = vi.fn<(snapshot: ComposerEditorSnapshot) => void>();
  const { controllerRef, screen } = await renderEditor([], { onSubmit });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("Hello");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("Hello");
  const snapshotBeforeSubmit = getController(controllerRef).getSnapshot();

  await screen.user.keyboard("{Enter}");

  expect(onSubmit).toHaveBeenCalledOnce();
  const submittedSnapshot = onSubmit.mock.calls.at(0)?.at(0);
  if (submittedSnapshot == null) {
    throw new Error("plain text submit must provide an editor snapshot");
  }
  expect(submittedSnapshot).toBe(snapshotBeforeSubmit);
  expect(getController(controllerRef).getSnapshot()).toBe(snapshotBeforeSubmit);
  expect(compileComposerDraft(submittedSnapshot.editorState)).toEqual([
    { type: "text", text: "Hello", text_elements: [] },
  ]);
});

test("shows authoritative source labels only for duplicate display names", async () => {
  const { screen } = await renderEditor([
    skill("first", "/user", "Shared", "first description", "user"),
    skill("second", "/repo", "Shared", "second description", "repo"),
    skill("unique", "/unique", "Unique", "unique description", "system"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$sh");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox.getByText("User", { exact: true })).toBeVisible();
  await expect.element(listbox.getByText("Repository", { exact: true })).toBeVisible();
  await editor.fill("$unique");
  await expect.element(listbox.getByRole("option", { name: /Unique/ })).toBeVisible();
  await expect.element(listbox.getByText("System", { exact: true })).not.toBeInTheDocument();
});

test("uses the same replacement for pointer selection and retains editor focus", async () => {
  const onSubmit = vi.fn<(snapshot: ComposerEditorSnapshot) => void>();
  const { controllerRef, screen } = await renderEditor([skill("pointer", "/pointer")], {
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$poi");
  await screen.getByRole("option", { name: /pointer/ }).click();

  expect(onSubmit).not.toHaveBeenCalled();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$pointer");
  await expect.element(editor).toHaveFocus();
});

test("keeps a skill token atomic across caret navigation, deletion, undo, and redo", async () => {
  const { controllerRef, screen } = await renderEditor([skill("atomic", "/atomic")]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$ato");
  await screen.user.keyboard("{Enter}");
  await screen.user.keyboard("{ArrowLeft}{ArrowRight}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$atomic");

  await screen.user.keyboard("{Backspace}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("");

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$atomic");

  dispatchHistoryShortcut(editor.element(), "redo");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("");
});

test("blocks query selection and submission during programmatic composition events", async () => {
  const onSubmit = vi.fn<(snapshot: ComposerEditorSnapshot) => void>();
  const { screen } = await renderEditor([skill("alpha", "/alpha")], { onSubmit });
  const editor = screen.getByRole("combobox", { name: "Message" });
  const root = editor.element();

  await editor.fill("$alp");
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  root.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  await expect
    .element(screen.getByRole("listbox", { name: "Typeahead menu" }))
    .not.toBeInTheDocument();
  root.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    }),
  );
  expect(onSubmit).not.toHaveBeenCalled();
});

test("consumes only the first Enter immediately following composition end", async () => {
  const onSubmit = vi.fn<(snapshot: ComposerEditorSnapshot) => void>();
  const { screen } = await renderEditor([], {
    guardCompositionEndEnter: true,
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });
  const root = editor.element();

  await editor.fill("中文");
  root.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文" }));
  await screen.user.keyboard("{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();

  await screen.user.keyboard("{Enter}");
  expect(onSubmit).toHaveBeenCalledOnce();
  const submittedSnapshot = onSubmit.mock.calls.at(0)?.at(0);
  if (submittedSnapshot == null) {
    throw new Error("guarded composition submit must provide an editor snapshot");
  }
  expect(submittedSnapshot.textContent).toBe("中文");
  expect(compileComposerDraft(submittedSnapshot.editorState)).toEqual([
    { type: "text", text: "中文", text_elements: [] },
  ]);
});

test("shows invalid token text only when a complete ready catalog confirms its path is unavailable", async () => {
  const selectedSkill = skill(
    "canonical-skill",
    "/private/skills/canonical-skill/SKILL.md",
    "Friendly Skill",
  );
  const controllerRef = createRef<ComposerEditorController>();
  const renderForCatalog = (skillCatalog: SkillCatalogState) => (
    <ComposerEditor
      ariaLabel="Message"
      controllerRef={controllerRef}
      disabled={false}
      guardCompositionEndEnter={false}
      onSubmit={() => undefined}
      placeholder="Message Codex"
      skillCatalog={skillCatalog}
      skillValidity={{
        invalidPaths: invalidSelectedSkillPaths(skillCatalog, [selectedSkill.path]),
        statusText: "Invalid skill",
      }}
    />
  );
  const readyCatalog = catalog("ready", [selectedSkill]);
  const invalidCatalog = catalog("ready", []);
  const screen = await renderWithProviders(renderForCatalog(readyCatalog));
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$canonical");
  await screen.user.keyboard("{Enter}");
  const token = screen.getByText("$Friendly Skill", { exact: true });

  await screen.rerender(renderForCatalog(invalidCatalog));
  await expect.element(token).toHaveAttribute("aria-invalid", "true");
  await expect.element(token).toHaveAttribute("data-invalid-status", "(Invalid skill)");
  await expect.element(token).toHaveAttribute("aria-label", "$Friendly Skill, Invalid skill");
  await expect.element(token).toHaveClass("bg-danger-soft");
  await expect.element(token).toHaveClass("after:content-[attr(data-invalid-status)]");
  expect(token.element().textContent).toBe("$Friendly Skill");
  expect(getController(controllerRef).getSnapshot().textContent).toBe("$Friendly Skill");
  expect(token.element().outerHTML).not.toContain(selectedSkill.path);

  await screen.rerender(renderForCatalog(readyCatalog));
  await expect.element(token).not.toHaveAttribute("aria-invalid");
  await expect.element(token).not.toHaveAttribute("aria-label");
  await expect.element(token).not.toHaveAttribute("data-invalid-status");
  await expect.element(token).not.toHaveClass("bg-danger-soft");

  const unconfirmedCatalogs: SkillCatalogState[] = [
    catalog("refreshing", []),
    catalog("stale", []),
    catalog("failed", []),
    catalog("ready", [], 1),
  ];
  for (const skillCatalog of unconfirmedCatalogs) {
    await screen.rerender(renderForCatalog(invalidCatalog));
    await expect.element(token).toHaveAttribute("aria-invalid", "true");
    await screen.rerender(renderForCatalog(skillCatalog));
    await expect.element(token).not.toHaveAttribute("aria-invalid");
    await expect.element(token).not.toHaveAttribute("aria-label");
    await expect.element(token).not.toHaveAttribute("data-invalid-status");
    await expect.element(token).not.toHaveClass("bg-danger-soft");
  }
});

type RenderEditorOptions = Readonly<{
  guardCompositionEndEnter?: boolean;
  onSubmit?: (snapshot: ComposerEditorSnapshot) => void;
}>;

async function renderEditor(
  candidates: readonly SkillCatalogCandidate[],
  { guardCompositionEndEnter = false, onSubmit = () => undefined }: RenderEditorOptions = {},
) {
  const controllerRef = createRef<ComposerEditorController>();
  const skillCatalog: SkillCatalogState = {
    type: "ready",
    candidates,
    partialErrorCount: 0,
  };
  const screen = await renderWithProviders(
    <ComposerEditor
      ariaLabel="Message"
      controllerRef={controllerRef}
      disabled={false}
      guardCompositionEndEnter={guardCompositionEndEnter}
      onSubmit={onSubmit}
      placeholder="Message Codex"
      skillCatalog={skillCatalog}
    />,
  );
  await expect.poll(() => controllerRef.current).not.toBeNull();
  return { controllerRef, screen };
}

function catalog(
  type: SkillCatalogState["type"],
  candidates: readonly SkillCatalogCandidate[],
  partialErrorCount = 0,
): SkillCatalogState {
  const contents = { candidates, partialErrorCount };
  switch (type) {
    case "initialLoading":
      return { type: "initialLoading", ...contents };
    case "ready":
      return { type: "ready", ...contents };
    case "refreshing":
      return { type: "refreshing", ...contents };
    case "stale":
      return { type: "stale", ...contents };
    case "failed":
      return { type: "failed", ...contents };
  }
}

function skill(
  name: string,
  path: string,
  displayName = name,
  description = `${name} description`,
  scope: SkillCatalogCandidate["scope"] = "repo",
): SkillCatalogCandidate {
  return {
    name,
    path,
    description,
    scope,
    interface: { displayName, iconSmallUrl: null, iconLargeUrl: null },
  };
}

function getController(ref: RefObject<ComposerEditorController | null>): ComposerEditorController {
  if (ref.current == null) {
    throw new Error("composer controller must be ready");
  }
  return ref.current;
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
