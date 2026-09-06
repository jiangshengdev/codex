import { createRef, useState, type CSSProperties, type RefObject } from "react";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  getNearestEditorFromDOMNode,
} from "lexical";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { renderWithProviders } from "@/utils/test-utils";
import type { AppLocale } from "@/i18n";
import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";

import {
  ComposerEditor,
  type ComposerEditorController,
  type ComposerEditorProps,
} from "../ComposerEditor";
import type { ComposerDraft } from "../composerDraft";
import { dispatchCompositionEnd } from "./composerEditorCompositionBrowserTestSupport";

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

test("keeps controller, draft, history, composition, and typeahead state independent per editor", async () => {
  const firstControllerRef = createRef<ComposerEditorController>();
  const secondControllerRef = createRef<ComposerEditorController>();
  const firstSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const secondSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const screen = await renderWithProviders(
    <IndependentEditorsFixture
      firstControllerRef={firstControllerRef}
      firstSubmit={firstSubmit}
      secondControllerRef={secondControllerRef}
      secondSubmit={secondSubmit}
    />,
  );
  await expect.poll(() => firstControllerRef.current).not.toBeNull();
  await expect.poll(() => secondControllerRef.current).not.toBeNull();
  const firstEditor = screen.getByRole("combobox", { name: "First message" });
  const secondEditor = screen.getByRole("combobox", { name: "Second message" });
  const firstController = getController(firstControllerRef);
  const secondController = getController(secondControllerRef);

  expect(firstController).not.toBe(secondController);
  expect(firstController.getRootElement()).toBe(firstEditor.element());
  expect(secondController.getRootElement()).toBe(secondEditor.element());

  await firstEditor.fill("first");
  await screen.user.keyboard("!");
  setCollapsedCaret(firstEditor.element(), "first!", 3);
  await expect.poll(() => collapsedCaretOffset(firstEditor.element())).toBe(3);
  await secondEditor.fill("second");
  setCollapsedCaret(secondEditor.element(), "second", 2);
  await expect.poll(() => collapsedCaretOffset(secondEditor.element())).toBe(2);
  firstController.focus();
  await expect.poll(() => collapsedCaretOffset(firstEditor.element())).toBe(3);
  secondController.focus();
  await expect.poll(() => collapsedCaretOffset(secondEditor.element())).toBe(2);
  dispatchHistoryShortcut(firstEditor.element(), "undo");
  await expect.poll(() => firstController.getSnapshot().textContent).toBe("first");
  expect(secondController.getSnapshot().textContent).toBe("second");

  await firstEditor.fill("$alp");
  const firstMenu = screen
    .getByRole("region", { name: "First skill suggestions" })
    .getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(firstMenu).toBeVisible();
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => firstController.getSnapshot().textContent).toBe("$alpha");
  expect(secondController.getSnapshot().textContent).toBe("second");

  firstEditor.element().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  await secondEditor.click();
  await screen.user.keyboard("{Enter}");
  expect(firstSubmit).not.toHaveBeenCalled();
  expect(secondSubmit).toHaveBeenCalledOnce();
  expect(secondSubmit.mock.calls[0]).toEqual([secondController.capture(), "ordinary"]);
  firstEditor.element().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
});

test("shows the empty placeholder and keeps growing multiline input scrollable and reachable", async () => {
  const { controllerRef, screen } = await renderEditor([]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  const editorElement = editor.element();
  const placeholder = screen.getByText("Message Codex", { exact: true });
  await expect.element(placeholder).toBeVisible();
  const emptyHeight = editorElement.getBoundingClientRect().height;

  await editor.fill("M");
  await expect.element(placeholder).not.toBeInTheDocument();

  const lines = Array.from({ length: 40 }, (_, index) => `line ${String(index)}`).join("\n");
  await editor.fill(lines);
  await expect
    .poll(() => editorElement.getBoundingClientRect().height)
    .toBeGreaterThan(emptyHeight);
  await expect.poll(() => editorElement.scrollHeight > editorElement.clientHeight).toBe(true);
  const lineIsVisible = (line: string): boolean => {
    const walker = editorElement.ownerDocument.createTreeWalker(
      editorElement,
      NodeFilter.SHOW_TEXT,
    );
    let node = walker.nextNode();
    while (node != null) {
      if (node instanceof Text) {
        const start = node.data.indexOf(line);
        if (start >= 0) {
          const range = editorElement.ownerDocument.createRange();
          range.setStart(node, start);
          range.setEnd(node, start + line.length);
          const lineBounds = range.getBoundingClientRect();
          const editorBounds = editorElement.getBoundingClientRect();
          const target = editorElement.ownerDocument.elementFromPoint(
            lineBounds.left + lineBounds.width / 2,
            lineBounds.top + lineBounds.height / 2,
          );
          return (
            lineBounds.height > 0 &&
            lineBounds.top >= editorBounds.top - 1 &&
            lineBounds.bottom <= editorBounds.bottom + 1 &&
            target != null &&
            editorElement.contains(target)
          );
        }
      }
      node = walker.nextNode();
    }
    return false;
  };
  await screen.user.keyboard("{ArrowUp>40/}");
  await expect.poll(() => lineIsVisible("line 0")).toBe(true);
  const firstLineScrollTop = editorElement.scrollTop;
  await screen.user.keyboard("{ArrowDown>40/}");
  await expect.poll(() => editorElement.scrollTop).toBeGreaterThan(0);
  await expect.poll(() => editorElement.scrollTop).toBeGreaterThan(firstLineScrollTop);
  await expect.poll(() => lineIsVisible("line 39")).toBe(true);
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe(lines);

  await editor.fill("unbroken".repeat(200));
  await expect.poll(() => editorElement.scrollWidth <= editorElement.clientWidth + 1).toBe(true);
  await editor.fill("");
  await expect.element(placeholder).toBeVisible();
});

test("contains rich-text format, drop, and closed-menu Escape without losing selection", async () => {
  const { controllerRef, screen } = await renderEditor([]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  const root = editor.element();

  await editor.fill("alpha beta");
  await editor.click();
  const lexicalEditor = getNearestEditorFromDOMNode(root);
  if (lexicalEditor == null) throw new Error("composer root must belong to a Lexical editor");
  lexicalEditor.update(() => {
    const firstText = $getRootTextNode();
    firstText.select(0, 5);
  });
  await expect.poll(() => root.ownerDocument.getSelection()?.toString()).toBe("alpha");
  const snapshotBefore = getController(controllerRef).getSnapshot();
  const lexicalSelectionBefore = readRangeSelection(root);
  const domSelectionBefore = readDomSelectionState(root);

  expect(lexicalEditor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")).toBe(true);
  expect(lexicalEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")).toBe(true);

  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBefore);
  expect(readRangeSelection(root)).toEqual(lexicalSelectionBefore);
  expect(readDomSelectionState(root)).toEqual(domSelectionBefore);
  await expect.element(editor).toHaveFocus();
  await expect.element(editor).toHaveTextContent("alpha beta");

  const drop = new DragEvent("drop", { bubbles: true, cancelable: true });
  root.dispatchEvent(drop);

  expect(drop.defaultPrevented).toBe(true);
  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBefore);
  expect(readRangeSelection(root)).toEqual(lexicalSelectionBefore);
  expect(readDomSelectionState(root)).toEqual(domSelectionBefore);
  await expect.element(editor).toHaveFocus();

  await screen.user.keyboard("{Escape}");

  await expect.element(editor).toHaveFocus();
  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBefore);
  expect(readRangeSelection(root)).toEqual(lexicalSelectionBefore);
  expect(readDomSelectionState(root)).toEqual(domSelectionBefore);
});

test("submits a plain-text capture without letting Enter rewrite the editor snapshot", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor([], { onSubmit });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("Hello");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("Hello");
  const snapshotBeforeSubmit = getController(controllerRef).getSnapshot();

  await screen.user.keyboard("{Enter}");

  expect(onSubmit).toHaveBeenCalledOnce();
  const submittedCapture = onSubmit.mock.calls[0]?.[0];
  if (submittedCapture == null) {
    throw new Error("plain text submit must provide a composer capture");
  }
  expect(onSubmit.mock.calls.at(0)?.at(1)).toBe("ordinary");
  expect(getController(controllerRef).getSnapshot()).toBe(snapshotBeforeSubmit);
  expect(submittedCapture.textContent).toBe("Hello");
  expect(submittedCapture.input).toEqual([{ type: "text", text: "Hello", text_elements: [] }]);
});

test.each([
  {
    platform: "MacIntel",
    ariaShortcut: "Meta+Enter",
    guideModifiers: { metaKey: true },
    ordinaryModifiers: { ctrlKey: true },
  },
  {
    platform: "Win32",
    ariaShortcut: "Control+Enter",
    guideModifiers: { ctrlKey: true },
    ordinaryModifiers: { metaKey: true },
  },
])(
  "uses only the $ariaShortcut guide chord on $platform",
  async ({ ariaShortcut, guideModifiers, ordinaryModifiers, platform }) => {
    await withNavigatorPlatform(platform, async () => {
      const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
      const { controllerRef, screen } = await renderEditor([], { onSubmit });
      const editor = screen.getByRole("combobox", { name: "Message" });

      await expect.element(editor).toHaveAttribute("aria-keyshortcuts", ariaShortcut);
      await editor.fill("Guide this");
      await expect
        .poll(() => getController(controllerRef).getSnapshot().textContent)
        .toBe("Guide this");
      dispatchEnterShortcut(editor.element(), guideModifiers);
      expect(onSubmit).toHaveBeenCalledOnce();
      const guideCall = onSubmit.mock.calls.at(-1);
      expect(guideCall?.[0].textContent).toBe("Guide this");
      expect(guideCall?.[1]).toBe("guide");

      onSubmit.mockClear();
      dispatchEnterShortcut(editor.element(), ordinaryModifiers);
      expect(onSubmit).toHaveBeenCalledOnce();
      const ordinaryCall = onSubmit.mock.calls.at(-1);
      expect(ordinaryCall?.[0].textContent).toBe("Guide this");
      expect(ordinaryCall?.[1]).toBe("ordinary");

      onSubmit.mockClear();
      dispatchEnterShortcut(editor.element(), { ...guideModifiers, altKey: true });
      expect(onSubmit).toHaveBeenCalledOnce();
      const modifiedCall = onSubmit.mock.calls.at(-1);
      expect(modifiedCall?.[0].textContent).toBe("Guide this");
      expect(modifiedCall?.[1]).toBe("ordinary");

      onSubmit.mockClear();
      const currentController = getController(controllerRef);
      const currentCapture = currentController.capture();
      expect(currentController.clearIfCurrent(currentCapture)).toBe(true);
      await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("");
      dispatchEnterShortcut(editor.element(), guideModifiers);
      expect(onSubmit).toHaveBeenCalledOnce();
      const emptyGuideCall = onSubmit.mock.calls.at(-1);
      expect(emptyGuideCall?.[0].textContent).toBe("");
      expect(emptyGuideCall?.[1]).toBe("guide");

      onSubmit.mockClear();
      await editor.fill("Line");
      dispatchEnterShortcut(editor.element(), { ...guideModifiers, shiftKey: true });
      expect(onSubmit).not.toHaveBeenCalled();
      // Synthetic dispatch does not perform the browser's default edit; the real-keyboard
      // Shift+Enter test above owns the line-break assertion.
    });
  },
);

test("does not clear edits made after a composer capture", async () => {
  const { controllerRef, screen } = await renderEditor([]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("captured");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("captured");
  const capture = getController(controllerRef).capture();
  await screen.user.keyboard(" later");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("captured later");

  expect(getController(controllerRef).clearIfCurrent(capture)).toBe(false);
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("captured later");
});

test("restores a new editor session with the caret at the end and fresh history", async () => {
  const selectedSkill = skill(
    "canonical-restore",
    "/skills/canonical-restore/SKILL.md",
    "Restored Skill",
  );
  const { controllerRef, screen } = await renderEditor([selectedSkill]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$canonical");
  await screen.user.keyboard("{Enter}");
  await screen.user.keyboard(" tail");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Restored Skill tail");
  const capture = getController(controllerRef).capture();
  await editor.fill("old session");
  await screen.user.keyboard("!");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("old session!");

  expect(getController(controllerRef).restore(capture.draft)).toEqual({ type: "restored" });
  await expect.element(screen.getByText("$Restored Skill", { exact: true })).toBeInTheDocument();
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Restored Skill tail");
  expect(getController(controllerRef).getSnapshot().selectedSkillPaths).toEqual([
    selectedSkill.path,
  ]);
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "$canonical-restore tail", text_elements: [] },
    { type: "skill", name: selectedSkill.name, path: selectedSkill.path },
  ]);
  await expect
    .poll(() => {
      const root = editor.element();
      const textElements = root.querySelectorAll<HTMLElement>('[data-lexical-text="true"]');
      const lastTextNode = textElements.item(textElements.length - 1).firstChild;
      const selection = root.ownerDocument.getSelection();
      return (
        lastTextNode instanceof Text &&
        selection?.isCollapsed === true &&
        selection.anchorNode === lastTextNode &&
        selection.anchorOffset === lastTextNode.length
      );
    })
    .toBe(true);

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Restored Skill tail");

  await screen.user.keyboard("!");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Restored Skill tail!");
  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Restored Skill tail");
});

test("rejects an invalid opaque draft without changing content or clearing history", async () => {
  const { controllerRef, screen } = await renderEditor([]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("current");
  await screen.user.keyboard(" draft");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("current draft");

  expect(getController(controllerRef).restore({} as ComposerDraft)).toEqual({
    type: "invalidDraft",
  });
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("current draft");

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .not.toBe("current draft");
});

test("blocks query selection and submission during programmatic composition events", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
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
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { screen } = await renderEditor([], {
    guardCompositionEndEnter: true,
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });
  const root = editor.element();

  await editor.fill("中文");
  root.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  dispatchCompositionEnd(root, "中文");
  await screen.user.keyboard("{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();

  await screen.user.keyboard("{Enter}");
  expect(onSubmit).toHaveBeenCalledOnce();
  const submittedSnapshot = onSubmit.mock.calls[0]?.[0];
  if (submittedSnapshot == null) {
    throw new Error("guarded composition submit must provide an editor snapshot");
  }
  expect(onSubmit.mock.calls.at(0)?.at(1)).toBe("ordinary");
  expect(submittedSnapshot.textContent).toBe("中文");
  expect(submittedSnapshot.input).toEqual([{ type: "text", text: "中文", text_elements: [] }]);
});

test("applies composition-end suppression before the guide shortcut intent", async () => {
  await withNavigatorPlatform("MacIntel", async () => {
    const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
    const { screen } = await renderEditor([], {
      guardCompositionEndEnter: true,
      onSubmit,
    });
    const editor = screen.getByRole("combobox", { name: "Message" });
    const root = editor.element();

    await editor.fill("中文");
    root.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    dispatchCompositionEnd(root, "中文");
    dispatchEnterShortcut(root, { metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    dispatchEnterShortcut(root, { metaKey: true });
    expect(onSubmit).toHaveBeenCalledOnce();
    const guideCall = onSubmit.mock.calls.at(-1);
    expect(guideCall?.[0].textContent).toBe("中文");
    expect(guideCall?.[1]).toBe("guide");
  });
});

type RenderEditorOptions = Readonly<{
  guardCompositionEndEnter?: boolean;
  locale?: AppLocale;
  onSubmit?: ComposerEditorProps["onSubmit"];
}>;

async function renderEditor(
  candidates: readonly SkillCatalogCandidate[],
  {
    guardCompositionEndEnter = false,
    locale = "en",
    onSubmit = () => undefined,
  }: RenderEditorOptions = {},
) {
  const controllerRef = createRef<ComposerEditorController>();
  const skillCatalog: SkillCatalogState = {
    type: "ready",
    candidates,
    partialErrorCount: 0,
  };
  const screen = await renderWithProviders(
    <ComposerEditorFixture
      ariaLabel="Message"
      controllerRef={controllerRef}
      disabled={false}
      guardCompositionEndEnter={guardCompositionEndEnter}
      onSubmit={onSubmit}
      placeholder="Message Codex"
      skillCatalog={skillCatalog}
    />,
    { locale },
  );
  await expect.poll(() => controllerRef.current).not.toBeNull();
  return { controllerRef, screen };
}

function ComposerEditorFixture(props: Omit<ComposerEditorProps, "skillMenuParent">) {
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);

  return (
    <div className="w-96 max-w-full">
      <div ref={setSkillMenuParent} style={fixtureSkillMenuParentStyle} />
      <ComposerEditor {...props} skillMenuParent={skillMenuParent} />
    </div>
  );
}

function IndependentEditorsFixture({
  firstControllerRef,
  firstSubmit,
  secondControllerRef,
  secondSubmit,
}: Readonly<{
  firstControllerRef: RefObject<ComposerEditorController | null>;
  firstSubmit: ComposerEditorProps["onSubmit"];
  secondControllerRef: RefObject<ComposerEditorController | null>;
  secondSubmit: ComposerEditorProps["onSubmit"];
}>) {
  const [firstMenuParent, setFirstMenuParent] = useState<HTMLElement | null>(null);
  const [secondMenuParent, setSecondMenuParent] = useState<HTMLElement | null>(null);
  const skillCatalog = catalog("ready", [skill("alpha", "/alpha")]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div
          aria-label="First skill suggestions"
          ref={setFirstMenuParent}
          role="region"
          style={fixtureSkillMenuParentStyle}
        />
        <ComposerEditor
          ariaLabel="First message"
          controllerRef={firstControllerRef}
          disabled={false}
          guardCompositionEndEnter={false}
          onSubmit={firstSubmit}
          placeholder="First message"
          skillCatalog={skillCatalog}
          skillMenuParent={firstMenuParent}
        />
      </div>
      <div>
        <div
          aria-label="Second skill suggestions"
          ref={setSecondMenuParent}
          role="region"
          style={fixtureSkillMenuParentStyle}
        />
        <ComposerEditor
          ariaLabel="Second message"
          controllerRef={secondControllerRef}
          disabled={false}
          guardCompositionEndEnter={false}
          onSubmit={secondSubmit}
          placeholder="Second message"
          skillCatalog={skillCatalog}
          skillMenuParent={secondMenuParent}
        />
      </div>
    </div>
  );
}

const fixtureSkillMenuParentStyle = {
  "--composer-skill-menu-max-height": "18rem",
} as CSSProperties;

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

type SkillCatalogCandidateWithInterface = SkillCatalogCandidate &
  Readonly<{ interface: NonNullable<SkillCatalogCandidate["interface"]> }>;

function skill(
  name: string,
  path: string,
  displayName = name,
  description = `${name} description`,
  scope: SkillCatalogCandidate["scope"] = "repo",
): SkillCatalogCandidateWithInterface {
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

function $getRootTextNode() {
  const node = $getRoot().getFirstDescendant();
  if (!$isTextNode(node)) throw new Error("composer must begin with a text node");
  return node;
}

function readRangeSelection(root: Element) {
  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) throw new Error("composer root must belong to a Lexical editor");
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return { type: "other" as const };
    return {
      anchorKey: selection.anchor.key,
      anchorOffset: selection.anchor.offset,
      focusKey: selection.focus.key,
      focusOffset: selection.focus.offset,
      type: "range" as const,
    };
  });
}

function readDomSelectionState(root: Element) {
  const selection = root.ownerDocument.getSelection();
  return {
    anchorOffset: selection?.anchorOffset ?? null,
    collapsed: selection?.isCollapsed ?? null,
    focusOffset: selection?.focusOffset ?? null,
    insideRoot:
      selection?.anchorNode != null &&
      selection.focusNode != null &&
      root.contains(selection.anchorNode) &&
      root.contains(selection.focusNode),
    text: selection?.toString() ?? "",
  };
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
type EnterShortcutModifiers = Readonly<
  Partial<Pick<KeyboardEvent, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">>
>;

function dispatchEnterShortcut(element: Element, modifiers: EnterShortcutModifiers): void {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      ...modifiers,
    }),
  );
}

async function withNavigatorPlatform(platform: string, run: () => Promise<void>): Promise<void> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform,
  });
  try {
    await run();
  } finally {
    if (originalDescriptor == null) {
      Reflect.deleteProperty(navigator, "platform");
    } else {
      Object.defineProperty(navigator, "platform", originalDescriptor);
    }
  }
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
