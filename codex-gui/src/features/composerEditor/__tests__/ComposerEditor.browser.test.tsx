import { createRef, useState, type CSSProperties, type RefObject } from "react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import { renderWithProviders } from "@/utils/test-utils";
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
import { invalidSelectedSkillPaths } from "../../composerTurnControl/composerTurnControlModel";

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
  const activeOption = listbox.getByRole("option").first();
  await expect.element(editor).toHaveAttribute("aria-activedescendant", activeOption.element().id);
  await expect.element(activeOption).toHaveAttribute("aria-selected", "true");
  await expect.element(editor).toHaveFocus();
  expect(getController(controllerRef).getRootElement()).toBe(editor.element());
});

test("keeps a drawer-placed skill menu inside its dialog and returns focus after selection", async () => {
  const controllerRef = createRef<ComposerEditorController>();
  const screen = await renderWithProviders(
    <DrawerEditorFixture
      candidates={Array.from({ length: 20 }, (_, index) =>
        skill(`drawer-${String(index).padStart(2, "0")}`, `/drawer/${String(index)}`),
      )}
      controllerRef={controllerRef}
    />,
  );
  const dialog = screen.getByRole("dialog", { name: "Edit pending input" });
  const editor = dialog.getByRole("combobox", { name: "Pending message" });

  await editor.fill("$drawer-01");

  const menuParent = dialog.getByRole("region", { name: "Skill suggestions" });
  const listbox = dialog.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox).toBeVisible();
  expect(menuParent.element().contains(listbox.element())).toBe(true);
  const menuSurface = listbox.element().querySelector("[data-skill-menu-surface]");
  if (!(menuSurface instanceof HTMLElement)) {
    throw new Error("drawer skill menu surface must render inside its anchor");
  }
  await expect
    .poll(() => {
      const dialogBounds = dialog.element().getBoundingClientRect();
      const editorBounds = editor.element().getBoundingClientRect();
      const hostBounds = menuParent.element().getBoundingClientRect();
      const anchorBounds = listbox.element().getBoundingClientRect();
      const menuBounds = menuSurface.getBoundingClientRect();
      return (
        anchorBounds.top >= editorBounds.bottom &&
        anchorBounds.bottom <= hostBounds.bottom &&
        menuBounds.bottom <= hostBounds.bottom &&
        hostBounds.bottom <= dialogBounds.bottom
      );
    })
    .toBe(true);

  await listbox.getByRole("option", { name: /drawer-01/ }).click();
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$drawer-01");
  await expect.element(editor).toHaveFocus();
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

test("keeps simultaneous typeahead ids and keyboard ownership scoped to each editor", async () => {
  const firstControllerRef = createRef<ComposerEditorController>();
  const secondControllerRef = createRef<ComposerEditorController>();
  const screen = await renderWithProviders(
    <IndependentEditorsFixture
      firstControllerRef={firstControllerRef}
      firstSubmit={() => undefined}
      secondControllerRef={secondControllerRef}
      secondSubmit={() => undefined}
    />,
  );
  await expect.poll(() => firstControllerRef.current).not.toBeNull();
  await expect.poll(() => secondControllerRef.current).not.toBeNull();
  const firstEditor = screen.getByRole("combobox", { name: "First message" });
  const secondEditor = screen.getByRole("combobox", { name: "Second message" });
  const firstController = getController(firstControllerRef);
  const secondController = getController(secondControllerRef);

  await firstEditor.fill("$alp");
  const firstDraft = firstController.capture().draft;
  await secondEditor.fill("$alp");
  expect(firstController.restore(firstDraft)).toEqual({ type: "restored" });

  const firstMenu = screen
    .getByRole("region", { name: "First skill suggestions" })
    .getByRole("listbox", { name: "Typeahead menu" });
  const secondMenu = screen
    .getByRole("region", { name: "Second skill suggestions" })
    .getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(firstMenu).toBeVisible();
  await expect.element(secondMenu).toBeVisible();
  const firstOption = firstMenu.getByRole("option", { name: /alpha/ });
  const secondOption = secondMenu.getByRole("option", { name: /alpha/ });
  await expect.element(firstEditor).toHaveAttribute("aria-controls", firstMenu.element().id);
  await expect.element(secondEditor).toHaveAttribute("aria-controls", secondMenu.element().id);
  await expect
    .element(firstEditor)
    .toHaveAttribute("aria-activedescendant", firstOption.element().id);
  await expect
    .element(secondEditor)
    .toHaveAttribute("aria-activedescendant", secondOption.element().id);
  expect(firstMenu.element().id).not.toBe(secondMenu.element().id);
  expect(firstOption.element().id).not.toBe(secondOption.element().id);

  firstController.focus();
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => firstController.getSnapshot().textContent).toBe("$alpha");
  await expect.element(firstMenu).not.toBeInTheDocument();
  await expect.element(secondMenu).toBeVisible();
  expect(secondController.getSnapshot().textContent).toBe("$alp");

  expect(firstController.restore(firstDraft)).toEqual({ type: "restored" });
  await expect.element(firstMenu).toBeVisible();
  secondController.focus();
  await screen.user.keyboard("{Escape}");
  await expect.element(secondMenu).not.toBeInTheDocument();
  await expect.element(firstMenu).toBeVisible();
  expect(firstController.getSnapshot().textContent).toBe("$alp");
});

test("consumes typeahead Escape before an enclosing dialog key handler", async () => {
  const onDialogEscape = vi.fn<() => void>();
  const screen = await renderWithProviders(
    <DrawerEditorFixture
      candidates={[skill("alpha", "/alpha")]}
      controllerRef={createRef<ComposerEditorController>()}
      onDialogEscape={onDialogEscape}
    />,
  );
  const editor = screen.getByRole("combobox", { name: "Pending message" });

  await editor.fill("$");
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Escape}");

  await expect
    .element(screen.getByRole("listbox", { name: "Typeahead menu" }))
    .not.toBeInTheDocument();
  expect(onDialogEscape).not.toHaveBeenCalled();
  await expect.element(editor).toHaveFocus();
});

test("aligns its placeholder and bounds multiline growth to its own scroll area", async () => {
  const { screen } = await renderEditor([]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  const editorElement = editor.element();
  const placeholder = screen.getByText("Message Codex", { exact: true });
  const placeholderCharacterRect = firstTextCharacterRect(placeholder.element());
  const emptyHeight = editorElement.getBoundingClientRect().height;

  const emptyStyle = getComputedStyle(editorElement);
  const lineHeight = Number.parseFloat(emptyStyle.lineHeight);
  expect(emptyHeight).toBeGreaterThanOrEqual(lineHeight * 3);

  await editor.fill("M");
  const firstCharacterRect = firstTextCharacterRect(editorElement);
  expect(Math.abs(firstCharacterRect.left - placeholderCharacterRect.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstCharacterRect.top - placeholderCharacterRect.top)).toBeLessThanOrEqual(1);

  await editor.fill("one\ntwo\nthree\nfour");
  await expect
    .poll(() => editorElement.getBoundingClientRect().height)
    .toBeGreaterThan(emptyHeight);
  const fourLineHeight = editorElement.getBoundingClientRect().height;

  await editor.fill(Array.from({ length: 20 }, (_, index) => `line ${String(index)}`).join("\n"));
  await expect
    .poll(() => editorElement.getBoundingClientRect().height)
    .toBeGreaterThan(fourLineHeight);
  const cappedHeight = editorElement.getBoundingClientRect().height;
  const cappedStyle = getComputedStyle(editorElement);
  const eightLineBoxHeight =
    Number.parseFloat(cappedStyle.lineHeight) * 8 +
    Number.parseFloat(cappedStyle.paddingTop) +
    Number.parseFloat(cappedStyle.paddingBottom);
  await expect.poll(() => editorElement.scrollHeight > editorElement.clientHeight).toBe(true);
  expect(cappedHeight).toBeGreaterThanOrEqual(fourLineHeight);
  expect(cappedHeight).toBeLessThanOrEqual(
    Math.min(eightLineBoxHeight, window.innerHeight * 0.3) + 1,
  );
  expect(cappedStyle.overflowY).toBe("auto");
  editorElement.scrollTop = editorElement.scrollHeight;
  expect(editorElement.scrollTop).toBeGreaterThan(0);

  await editor.fill("unbroken".repeat(200));
  await expect.poll(() => editorElement.scrollWidth <= editorElement.clientWidth + 1).toBe(true);
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
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
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
  await expect.poll(() => collapsedCaretOffset(editor.element())).toBe(17);
  await expect.element(editor).toHaveAttribute("aria-expanded", "true");
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Enter}");

  expect(onSubmit).not.toHaveBeenCalled();
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("before $Friendly after");
  expect(getController(controllerRef).capture().input).toEqual([
    {
      type: "text",
      text: "before $canonical-match after",
      text_elements: [],
    },
    { type: "skill", name: "canonical-match", path: "/canonical" },
  ]);
});

test("uses Tab to choose, Escape to close, and Shift Enter only to add a line break", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
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
      await editor.fill("");
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

test("keeps the typeahead Enter owner ahead of the guide shortcut", async () => {
  await withNavigatorPlatform("MacIntel", async () => {
    const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
    const { controllerRef, screen } = await renderEditor([skill("alpha", "/alpha")], {
      onSubmit,
    });
    const editor = screen.getByRole("combobox", { name: "Message" });

    await editor.fill("$alp");
    await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
    dispatchEnterShortcut(editor.element(), { metaKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
    await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$alpha");
  });
});

test("shows authoritative source labels for every candidate and parent paths for duplicate display names", async () => {
  const { screen } = await renderEditor([
    skill("first", "/user/shared/SKILL.md", "Shared", "first description", "user"),
    skill("second", "/repo/shared/SKILL.md", "Shared", "second description", "repo"),
    skill("unique", "/unique/SKILL.md", "Unique", "unique description", "system"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$sh");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox.getByText(/User · user\/shared/)).toBeVisible();
  await expect.element(listbox.getByText(/Repository · repo\/shared/)).toBeVisible();
  await editor.fill("$unique");
  await expect.element(listbox.getByRole("option", { name: /Unique/ })).toBeVisible();
  await expect.element(listbox.getByText("System", { exact: true })).toBeVisible();
});

test("lays out candidate identity and clamps natural description wrapping without horizontal overflow", async () => {
  const longDisplayName = `Friendly ${"unbroken".repeat(20)}`;
  const longDescription = "A naturally wrapping description with useful detail. ".repeat(12);
  const longPath = `/skills/${"path-token".repeat(30)}/SKILL.md`;
  const { screen } = await renderEditor([
    skill("a-canonical-skill", longPath, longDisplayName, longDescription, "user"),
    skill("z-empty", "/skills/empty/SKILL.md", "Empty description", "   ", "system"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  const longOptionLocator = listbox.getByRole("option", { name: /a-canonical-skill/ });
  const emptyOptionLocator = listbox.getByRole("option", { name: /z-empty/ });
  await expect.element(longOptionLocator).toBeVisible();
  await expect.element(emptyOptionLocator).toBeVisible();
  const longOption = longOptionLocator.element();
  const emptyOption = emptyOptionLocator.element();
  const description = longOption.querySelector("[data-skill-description]");
  if (!(description instanceof HTMLElement)) {
    throw new Error("long skill description must render");
  }
  const descriptionStyle = getComputedStyle(description);
  const lineHeight = Number.parseFloat(descriptionStyle.lineHeight);

  await expect.element(listbox.getByText(longDisplayName, { exact: true })).toBeVisible();
  await expect.element(listbox.getByText("$a-canonical-skill", { exact: true })).toBeVisible();
  await expect.element(listbox.getByText("User", { exact: true })).toBeVisible();
  expect(description.getBoundingClientRect().height).toBeGreaterThan(lineHeight);
  expect(description.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight * 2 + 1);
  expect(emptyOption.querySelector("[data-skill-description]")).toBeNull();
  await expect
    .poll(() => listbox.element().scrollWidth <= listbox.element().clientWidth + 1)
    .toBe(true);
  await expect.poll(() => longOption.scrollWidth <= longOption.clientWidth + 1).toBe(true);
  const details = screen.container.querySelector("[data-skill-menu-details]");
  const detailPreview = screen.container.querySelector("[data-skill-menu-detail-preview]");
  const scrollRegion = screen.container.querySelector("[data-skill-menu-scroll-region]");
  if (
    !(details instanceof HTMLElement) ||
    !(detailPreview instanceof HTMLElement) ||
    !(scrollRegion instanceof HTMLElement)
  ) {
    throw new Error("skill scroll region and active details must render");
  }
  expect(scrollRegion.contains(details)).toBe(false);
  expect(getComputedStyle(scrollRegion).overflowY).toBe("auto");
  expect(scrollRegion.getAttribute("data-scrollbar")).toBe("thin");
  expect(detailPreview.textContent).toBe(`User · ${longPath}`);
  await expect.element(screen.getByRole("separator")).toBeVisible();
  await expect.poll(() => details.scrollWidth <= details.clientWidth + 1).toBe(true);
});

test("previews pointer hover without changing the keyboard active candidate or its description", async () => {
  const { controllerRef, screen } = await renderEditor([
    skill("alpha", "/skills/alpha/SKILL.md", "Alpha", "Alpha description", "user"),
    skill("beta", "/skills/beta/SKILL.md", "Beta", "Beta description", "repo"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");
  await screen.user.keyboard("{ArrowDown}");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  const alphaOption = listbox.getByRole("option", { name: /Alpha/ }).element();
  const betaOption = listbox.getByRole("option", { name: /Beta/ }).element();
  const preview = screen.container.querySelector("[data-skill-menu-detail-preview]");
  if (!(preview instanceof HTMLElement)) {
    throw new Error("skill detail preview must render");
  }
  await userEvent.unhover(alphaOption);
  await expect.element(alphaOption).not.toHaveAttribute("data-hovered");
  await expect.element(betaOption).not.toHaveAttribute("data-hovered");
  await expect.element(betaOption).toHaveAttribute("aria-selected", "true");
  expect(preview.textContent).toBe("Repository · /skills/beta/SKILL.md");

  alphaOption.dispatchEvent(
    new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
  );
  await expect.element(alphaOption).toHaveAttribute("data-hovered", "true");
  await expect.element(alphaOption).toHaveAttribute("aria-selected", "false");
  await expect.element(betaOption).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => preview.textContent).toBe("User · /skills/alpha/SKILL.md");
  expect(getComputedStyle(alphaOption).boxShadow).not.toBe("none");

  const activeDetailsId = betaOption.getAttribute("aria-describedby");
  const activeDetails = activeDetailsId == null ? null : document.getElementById(activeDetailsId);
  expect(activeDetails?.textContent).toBe("Repository · /skills/beta/SKILL.md");

  alphaOption.dispatchEvent(
    new PointerEvent("pointerout", {
      bubbles: true,
      pointerType: "mouse",
      relatedTarget: document.body,
    }),
  );
  await expect.element(alphaOption).not.toHaveAttribute("data-hovered");
  await expect.poll(() => preview.textContent).toBe("Repository · /skills/beta/SKILL.md");

  alphaOption.dispatchEvent(
    new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
  );
  await expect.poll(() => preview.textContent).toBe("User · /skills/alpha/SKILL.md");
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$Beta");
});

test("does not scroll back to an offscreen active candidate when pointer hover previews a visible option", async () => {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    skill(
      `skill-${String(index).padStart(2, "0")}`,
      `/skills/${String(index).padStart(2, "0")}/SKILL.md`,
    ),
  );
  const { controllerRef, screen } = await renderEditor(candidates);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  const activeOption = listbox.getByRole("option", { name: /skill-00/ }).element();
  const hoveredOption = listbox.getByRole("option", { name: /skill-19/ }).element();
  const scrollRegion = screen.container.querySelector("[data-skill-menu-scroll-region]");
  const preview = screen.container.querySelector("[data-skill-menu-detail-preview]");
  if (!(scrollRegion instanceof HTMLElement) || !(preview instanceof HTMLElement)) {
    throw new Error("skill scroll region and detail preview must render");
  }

  scrollRegion.scrollTop = scrollRegion.scrollHeight;
  await expect.poll(() => scrollRegion.scrollTop).toBeGreaterThan(0);
  await expect
    .poll(() => {
      const activeBounds = activeOption.getBoundingClientRect();
      const scrollBounds = scrollRegion.getBoundingClientRect();
      return activeBounds.bottom <= scrollBounds.top || activeBounds.top >= scrollBounds.bottom;
    })
    .toBe(true);
  const scrollTopBeforeHover = scrollRegion.scrollTop;

  hoveredOption.dispatchEvent(
    new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }),
  );
  await expect.element(hoveredOption).toHaveAttribute("data-hovered", "true");
  await expect.poll(() => preview.textContent).toBe("Repository · /skills/19/SKILL.md");
  await expect
    .poll(() => Math.abs(scrollRegion.scrollTop - scrollTopBeforeHover))
    .toBeLessThanOrEqual(1);
  await expect.element(activeOption).toHaveAttribute("aria-selected", "true");
  await expect.element(hoveredOption).toHaveAttribute("aria-selected", "false");

  await screen.user.keyboard("{Enter}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$skill-00");
});

test("uses the same replacement for pointer selection and retains editor focus", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
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

test("uses touch pointer down to select without moving focus from the editor", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor([skill("touch", "/skills/touch/SKILL.md")], {
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$tou");
  const option = screen.getByRole("option", { name: /touch/ }).element();
  option.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      cancelable: true,
      isPrimary: true,
      pointerType: "touch",
    }),
  );

  expect(onSubmit).not.toHaveBeenCalled();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$touch");
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
  root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文" }));
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
    root.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文" }));
    dispatchEnterShortcut(root, { metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();

    dispatchEnterShortcut(root, { metaKey: true });
    expect(onSubmit).toHaveBeenCalledOnce();
    const guideCall = onSubmit.mock.calls.at(-1);
    expect(guideCall?.[0].textContent).toBe("中文");
    expect(guideCall?.[1]).toBe("guide");
  });
});

test("preserves catalog loading, refresh, partial error, total error, retry, empty, and disabled semantics", async () => {
  const controllerRef = createRef<ComposerEditorController>();
  const onRetrySkillCatalog = vi.fn<() => void>();
  const renderForCatalog = (skillCatalog: SkillCatalogState, disabled = false) => (
    <ComposerEditorFixture
      ariaLabel="Message"
      controllerRef={controllerRef}
      disabled={disabled}
      guardCompositionEndEnter={false}
      onRetrySkillCatalog={onRetrySkillCatalog}
      onSubmit={() => undefined}
      placeholder="Message Codex"
      skillCatalog={skillCatalog}
    />
  );
  const screen = await renderWithProviders(renderForCatalog(catalog("initialLoading", [])));
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");
  await expect.element(screen.getByText("Loading skills…", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("No matching skills")).not.toBeInTheDocument();

  const availableSkill = skill("available", "/skills/available/SKILL.md");
  await screen.rerender(renderForCatalog(catalog("refreshing", [availableSkill])));
  await expect.element(screen.getByText("Refreshing skills…", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: /available/ })).toBeVisible();

  await screen.rerender(renderForCatalog(catalog("stale", [availableSkill])));
  await expect
    .element(screen.getByText("Showing saved skills because refresh failed", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Retry" })).toBeVisible();

  await screen.rerender(renderForCatalog(catalog("ready", [], 1)));
  await expect
    .element(screen.getByText("Some skills could not be loaded", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("No matching skills", { exact: true })).toBeVisible();

  await screen.rerender(renderForCatalog(catalog("ready", [])));
  await expect.element(screen.getByText("Some skills could not be loaded")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No matching skills", { exact: true })).toBeVisible();

  await screen.rerender(renderForCatalog(catalog("failed", [])));
  await expect
    .element(screen.getByText("Skills could not be loaded", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("No matching skills")).not.toBeInTheDocument();
  await screen.getByRole("button", { name: "Retry" }).click();
  expect(onRetrySkillCatalog).toHaveBeenCalledOnce();

  await screen.rerender(renderForCatalog(catalog("failed", []), true));
  await expect.element(editor).toHaveAttribute("contenteditable", "false");
  await expect
    .element(screen.getByRole("listbox", { name: "Typeahead menu" }))
    .not.toBeInTheDocument();
});

test("shows invalid token text only when a complete ready catalog confirms its path is unavailable", async () => {
  const selectedSkill = skill(
    "canonical-skill",
    "/private/skills/canonical-skill/SKILL.md",
    "Friendly Skill",
  );
  const controllerRef = createRef<ComposerEditorController>();
  const renderForCatalog = (skillCatalog: SkillCatalogState) => (
    <ComposerEditorFixture
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
  onSubmit?: ComposerEditorProps["onSubmit"];
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
    <ComposerEditorFixture
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

function ComposerEditorFixture(props: Omit<ComposerEditorProps, "skillMenuParent">) {
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);

  return (
    <div className="w-96 max-w-full">
      <div ref={setSkillMenuParent} style={fixtureSkillMenuParentStyle} />
      <ComposerEditor {...props} skillMenuParent={skillMenuParent} />
    </div>
  );
}

function DrawerEditorFixture({
  candidates,
  controllerRef,
  onDialogEscape,
}: Readonly<{
  candidates: readonly SkillCatalogCandidate[];
  controllerRef: RefObject<ComposerEditorController | null>;
  onDialogEscape?: () => void;
}>) {
  const [skillMenuParent, setSkillMenuParent] = useState<HTMLElement | null>(null);

  return (
    <div
      aria-label="Edit pending input"
      className="h-56 w-96 max-w-full overflow-hidden"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onDialogEscape?.();
        }
      }}
      role="dialog"
    >
      <ComposerEditor
        ariaLabel="Pending message"
        controllerRef={controllerRef}
        disabled={false}
        guardCompositionEndEnter={false}
        onSubmit={() => undefined}
        placeholder="Edit pending message"
        skillCatalog={catalog("ready", candidates)}
        skillMenuParent={skillMenuParent}
        skillMenuPlacement="below"
      />
      <div
        aria-label="Skill suggestions"
        ref={setSkillMenuParent}
        role="region"
        style={drawerSkillMenuParentStyle}
      />
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

const drawerSkillMenuParentStyle = {
  "--composer-skill-menu-max-height": "6rem",
  height: "var(--composer-skill-menu-max-height)",
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

function firstTextCharacterRect(root: Element): DOMRect {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNode = walker.nextNode();
  if (!(textNode instanceof Text) || textNode.length === 0) {
    throw new Error("element must contain a non-empty Text node");
  }

  const range = root.ownerDocument.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 1);
  return range.getBoundingClientRect();
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
