import { createRef, useState, type CSSProperties, type RefObject } from "react";
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  $setSelection,
  COMPOSITION_END_COMMAND,
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
import { SkillNode } from "../SkillNode";
import { invalidSelectedSkillPaths } from "../../composerTurnControl/composerTurnControlModel";

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

test("opens the full accessible skill list and keeps editor focus", async () => {
  const candidates = Array.from({ length: 25 }, (_, index) =>
    skill(`skill-${String(index).padStart(2, "0")}`, `/skills/${String(index)}`),
  );
  const { controllerRef, screen } = await renderEditor(candidates);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox).toBeVisible();
  await expect.poll(() => listbox.getByRole("option").length).toBe(candidates.length);
  await expect.element(editor).toHaveAttribute("aria-autocomplete", "list");
  await expect.element(editor).toHaveAttribute("aria-expanded", "true");
  await expect.element(editor).toHaveAttribute("aria-controls", listbox.element().id);
  const activeOption = listbox.getByRole("option").first();
  const styledListbox = listbox.element().querySelector("ul.list-box");
  if (!(styledListbox instanceof HTMLUListElement)) {
    throw new Error("skill options must use the HeroUI listbox styles");
  }
  expect(screen.container.querySelectorAll('[role="listbox"]')).toHaveLength(1);
  expect(styledListbox.children).toHaveLength(candidates.length);
  expect(Array.from(styledListbox.children).every((child) => child.role === "option")).toBe(true);
  expect(listbox.element().querySelector('[role="group"], [role="separator"]')).toBeNull();
  expect(styledListbox.classList).toContain("list-box--default");
  expect(styledListbox.getAttribute("data-slot")).toBe("list-box");
  await expect.element(activeOption).toHaveClass("list-box-item", "list-box-item--default");
  await expect.element(activeOption).toHaveAttribute("data-slot", "list-box-item");
  await expect.element(editor).toHaveAttribute("aria-activedescendant", activeOption.element().id);
  await expect.element(activeOption).toHaveAttribute("aria-selected", "true");
  await expect.element(activeOption).toHaveAttribute("data-active", "true");
  await expect.element(activeOption).not.toHaveAttribute("data-focus-visible");
  await expect.element(editor).toHaveFocus();
  expect(getController(controllerRef).getRootElement()).toBe(editor.element());
});

test("uses a clipped Select popover surface with one nested scroll owner", async () => {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    skill(`skill-${String(index).padStart(2, "0")}`, `/skills/${String(index)}`),
  );
  const { screen } = await renderEditor(candidates);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox.getByRole("option", { name: /skill-00/ })).toBeVisible();
  const menuSurface = listbox.element().querySelector("[data-skill-menu-surface]");
  if (!(menuSurface instanceof HTMLElement)) {
    throw new Error("skill menu must render a popover surface");
  }
  const scrollRegions = listbox.element().querySelectorAll("[data-skill-menu-scroll-region]");
  expect(scrollRegions).toHaveLength(1);
  const scrollRegion = scrollRegions.item(0);
  if (!(scrollRegion instanceof HTMLElement)) {
    throw new Error("skill menu must render a nested scroll region");
  }
  expect(scrollRegion).not.toBe(menuSurface);
  expect(menuSurface.contains(scrollRegion)).toBe(true);
  expect(menuSurface.classList).toContain("select__popover");
  expect(scrollRegion.getAttribute("data-scrollbar")).toBe("thin");

  const scrollOwners = [menuSurface, ...menuSurface.querySelectorAll<HTMLElement>("*")].filter(
    (element) => ["auto", "scroll"].includes(getComputedStyle(element).overflowY),
  );
  expect(scrollOwners).toEqual([scrollRegion]);

  const styledListbox = menuSurface.querySelector('[data-slot="list-box"]');
  const styledItem = menuSurface.querySelector('[data-slot="list-box-item"]');
  if (!(styledListbox instanceof HTMLUListElement) || !(styledItem instanceof HTMLLIElement)) {
    throw new Error("skill menu must expose Select listbox styling slots");
  }

  const overlayProbe = document.createElement("div");
  overlayProbe.className = "rounded-3xl bg-overlay";
  overlayProbe.style.boxShadow = "var(--shadow-overlay)";
  document.body.append(overlayProbe);
  const menuStyle = getComputedStyle(menuSurface);
  const scrollStyle = getComputedStyle(scrollRegion);
  const overlayStyle = getComputedStyle(overlayProbe);
  expect(menuStyle.backgroundColor).toBe(overlayStyle.backgroundColor);
  expect(menuStyle.boxShadow).toBe(overlayStyle.boxShadow);
  expect(menuStyle.borderRadius).toBe(overlayStyle.borderRadius);
  expect(menuStyle.borderTopWidth).toBe("0px");
  expect(menuStyle.borderRightWidth).toBe("0px");
  expect(menuStyle.borderBottomWidth).toBe("0px");
  expect(menuStyle.borderLeftWidth).toBe("0px");
  expect(menuStyle.overflowX).toBe("hidden");
  expect(menuStyle.overflowY).toBe("hidden");
  expect(scrollStyle.overflowX).toBe("hidden");
  expect(scrollStyle.overflowY).toBe("auto");
  expect(scrollStyle.overscrollBehaviorY).toBe("contain");
  const scrollbarProbe = document.createElement("div");
  scrollbarProbe.className = "scrollbar-thin";
  scrollbarProbe.setAttribute("data-scrollbar", "thin");
  document.body.append(scrollbarProbe);
  const scrollbarProbeStyle = getComputedStyle(scrollbarProbe);
  expect(scrollStyle.getPropertyValue("--scrollbar-width").trim()).toBe("thin");
  expect(scrollStyle.scrollbarWidth).toBe(scrollbarProbeStyle.scrollbarWidth);
  scrollbarProbe.remove();
  expect(menuStyle.animationName).toBe("none");
  expect(menuStyle.animationDuration).toBe("0s");
  expect(menuStyle.transitionDuration).toBe("0s");
  overlayProbe.remove();

  const listboxStyle = getComputedStyle(styledListbox);
  const itemStyle = getComputedStyle(styledItem);
  expect(listboxStyle.paddingTop).toBe("6px");
  expect(listboxStyle.paddingRight).toBe("6px");
  expect(listboxStyle.paddingBottom).toBe("6px");
  expect(listboxStyle.paddingLeft).toBe("6px");
  expect(itemStyle.paddingRight).toBe("10px");
  expect(itemStyle.paddingLeft).toBe("10px");
  expect(menuSurface.hasAttribute("data-entering")).toBe(false);
  expect(menuSurface.hasAttribute("data-exiting")).toBe(false);

  const expectNoMask = (element: HTMLElement): void => {
    const style = getComputedStyle(element);
    expect(style.maskImage).toBe("none");
    const webkitMaskImage = style.getPropertyValue("-webkit-mask-image");
    expect(["", "none"]).toContain(webkitMaskImage);
  };
  expectNoMask(menuSurface);
  await expect.poll(() => scrollRegion.scrollHeight > scrollRegion.clientHeight).toBe(true);
  const maximumScrollTop = scrollRegion.scrollHeight - scrollRegion.clientHeight;
  scrollRegion.scrollTop = 0;
  await expect.poll(() => scrollRegion.scrollTop).toBe(0);
  expectNoMask(scrollRegion);
  scrollRegion.scrollTop = maximumScrollTop / 2;
  await expect
    .poll(() => Math.abs(scrollRegion.scrollTop - maximumScrollTop / 2))
    .toBeLessThanOrEqual(1);
  expectNoMask(scrollRegion);
  scrollRegion.scrollTop = maximumScrollTop;
  await expect
    .poll(() => Math.abs(scrollRegion.scrollTop - maximumScrollTop))
    .toBeLessThanOrEqual(1);
  expectNoMask(scrollRegion);

  await screen.user.keyboard("{Escape}");
  await expect.element(listbox).not.toBeInTheDocument();
  expect(screen.container.querySelector("[data-skill-menu-surface]")).toBeNull();
});

test.for([
  {
    bannerText: null,
    partialErrorCount: 0,
    type: "ready",
  },
  {
    bannerText: "Refreshing skills…",
    partialErrorCount: 0,
    type: "refreshing",
  },
  {
    bannerText: "Showing saved skills because refresh failed",
    partialErrorCount: 0,
    type: "stale",
  },
  {
    bannerText: "Some skills could not be loaded",
    partialErrorCount: 1,
    type: "ready",
  },
] as const)(
  "keeps keyboard wrap, active ARIA, focus, and catalog banners across catalog states",
  async ({ bannerText, partialErrorCount, type }) => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      skill(
        `boundary-${String(index).padStart(2, "0")}`,
        `/skills/boundary-${String(index).padStart(2, "0")}/SKILL.md`,
      ),
    );
    const controllerRef = createRef<ComposerEditorController>();
    const screen = await renderWithProviders(
      <ComposerEditorFixture
        ariaLabel="Message"
        controllerRef={controllerRef}
        disabled={false}
        guardCompositionEndEnter={false}
        onSubmit={() => undefined}
        placeholder="Message Codex"
        skillCatalog={catalog(type, candidates, partialErrorCount)}
      />,
    );
    const editor = screen.getByRole("combobox", { name: "Message" });

    await editor.fill("$");

    const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
    await expect.element(listbox).toBeVisible();
    await expect.poll(() => listbox.getByRole("option").length).toBe(candidates.length);
    const firstOption = listbox.getByRole("option").first();
    const lastOption = listbox.getByRole("option").last();
    await expect.element(lastOption).toHaveAccessibleName(/boundary-24/);
    const banner = bannerText == null ? null : screen.getByText(bannerText, { exact: true });
    const bannerIsVisible = (): boolean => banner == null || banner.element().checkVisibility();
    await expect.poll(() => listbox.getByRole("status").length).toBe(banner == null ? 0 : 1);
    await expect.poll(bannerIsVisible).toBe(true);
    const focusRingProbe = document.createElement("div");
    focusRingProbe.className = "status-focused";
    document.body.append(focusRingProbe);
    const expectedActiveRing = getComputedStyle(focusRingProbe).boxShadow;
    focusRingProbe.remove();
    expect(expectedActiveRing).not.toBe("none");

    await expect.element(firstOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", firstOption.element().id);
    await expect.element(editor).toHaveFocus();

    await screen.user.keyboard("{ArrowUp}");

    await expect.element(lastOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", lastOption.element().id);
    await expect
      .poll(() => getComputedStyle(lastOption.element()).boxShadow)
      .toBe(expectedActiveRing);
    await expect.element(editor).toHaveFocus();
    await expect.poll(bannerIsVisible).toBe(true);

    await screen.user.keyboard("{ArrowDown}");

    await expect.element(firstOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", firstOption.element().id);
    await expect
      .poll(() => getComputedStyle(firstOption.element()).boxShadow)
      .toBe(expectedActiveRing);
    await expect.element(editor).toHaveFocus();
    await expect.poll(bannerIsVisible).toBe(true);
  },
);

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

test.each([
  {
    labels: { admin: "Admin", repo: "Repository", system: "System", user: "User" },
    locale: "en" as const,
  },
  {
    labels: { admin: "管理员", repo: "仓库", system: "系统", user: "用户" },
    locale: "zh-CN" as const,
  },
])("always shows localized source labels in $locale", async ({ labels, locale }) => {
  const candidates = [
    skill("admin-skill", "/hidden/admin-parent/SKILL.md", "Admin skill", undefined, "admin"),
    skill("repo-skill", "/hidden/repo-parent/SKILL.md", "Repo skill", undefined, "repo"),
    skill("system-skill", "/hidden/system-parent/SKILL.md", "System skill", undefined, "system"),
    skill("user-skill", "/hidden/user-parent/SKILL.md", "User skill", undefined, "user"),
  ];
  const { controllerRef, screen } = await renderEditor(candidates, { locale });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect
    .poll(() =>
      listbox
        .getByRole("option")
        .elements()
        .map((option) => option.querySelector("span")?.textContent),
    )
    .toEqual(["Repo skill", "User skill", "Admin skill", "System skill"]);
  for (const candidate of candidates) {
    const label = labels[candidate.scope];
    const displayName = candidate.interface.displayName ?? candidate.name;
    const description = candidate.description;
    const option = listbox.getByRole("option", { name: new RegExp(displayName) });
    await expect.element(option).toBeVisible();
    await expect
      .element(option)
      .toHaveAccessibleName(new RegExp(`${displayName}.*${label}.*${description}`));

    const mainRow = option.element().firstElementChild;
    const sourceLabel = mainRow?.lastElementChild;
    if (!(mainRow instanceof HTMLDivElement) || !(sourceLabel instanceof HTMLSpanElement)) {
      throw new Error("skill option must place its source label in the main row");
    }
    expect(sourceLabel.textContent).toBe(label);
    expect(sourceLabel.classList).toContain("shrink-0");
    expect(sourceLabel.classList).toContain("text-xs");
    expect(sourceLabel.classList).toContain("text-muted");
    expect(option.element().textContent).not.toContain(candidate.path);
    expect(option.element().outerHTML).not.toContain("hidden/");
  }

  await screen.user.keyboard("{Enter}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Repo skill");
  expect(getController(controllerRef).getSnapshot().selectedSkillPaths).toEqual([
    "/hidden/repo-parent/SKILL.md",
  ]);
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "$repo-skill", text_elements: [] },
    { type: "skill", name: "repo-skill", path: "/hidden/repo-parent/SKILL.md" },
  ]);
});

test("progressively discloses canonical names and only collision paths", async () => {
  const { screen } = await renderEditor([
    skill("plain", "/unique/plain/SKILL.md", "plain", "plain description", "system"),
    skill("friendly", "/unique/friendly/SKILL.md", "Friendly", "friendly description", "user"),
    skill("shared", "/user/shared/SKILL.md", "Shared", "user shared description", "user"),
    skill("shared", "/repo/shared/SKILL.md", "Shared", "repo shared description", "repo"),
    skill("review", "/first/review/SKILL.md", "First Review", "first review description", "repo"),
    skill(
      "review",
      "/second/review/SKILL.md",
      "Second Review",
      "second review description",
      "user",
    ),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  const plainOptionLocator = listbox.getByRole("option", { name: /plain description/ });
  await expect.element(plainOptionLocator).toBeVisible();
  const plainOption = plainOptionLocator.element();
  const friendlyOption = listbox.getByRole("option", { name: /friendly description/ }).element();
  const userSharedOption = listbox
    .getByRole("option", { name: /user shared description/ })
    .element();
  const repoSharedOption = listbox
    .getByRole("option", { name: /repo shared description/ })
    .element();
  const firstReviewOption = listbox
    .getByRole("option", { name: /first review description/ })
    .element();
  const secondReviewOption = listbox
    .getByRole("option", { name: /second review description/ })
    .element();

  expect(plainOption.textContent).not.toContain("$plain");
  expect(plainOption.firstElementChild?.textContent).toContain("System");
  expect(plainOption.textContent).not.toContain("unique/plain");
  expect(friendlyOption.textContent).toContain("$friendly");
  expect(friendlyOption.firstElementChild?.textContent).toContain("User");
  for (const [option, sourceLabel, path] of [
    [userSharedOption, "User", "user/shared"],
    [repoSharedOption, "Repository", "repo/shared"],
    [firstReviewOption, "Repository", "first/review"],
    [secondReviewOption, "User", "second/review"],
  ] as const) {
    expect(option.firstElementChild?.textContent).toContain(sourceLabel);
    expect(option.firstElementChild?.textContent).not.toContain(path);
    expect(option.children.item(1)?.textContent).toBe(path);
    expect(option.children.item(1)?.textContent).not.toContain(sourceLabel);
  }
  expect(listbox.element().outerHTML).not.toContain("SKILL.md");
  expect(listbox.element().querySelector("[aria-describedby]")).toBeNull();
  expect(screen.container.querySelector("[data-skill-menu-details]")).toBeNull();
  expect(screen.container.querySelector("[data-skill-menu-detail-preview]")).toBeNull();
});

test("lays out one-line descriptions and collision paths without horizontal overflow", async () => {
  const longDisplayName = `Friendly ${"unbroken".repeat(20)}`;
  const longDescription = "A naturally wrapping description with useful detail. ".repeat(12);
  const longPath = `/skills/${"path-token".repeat(30)}/SKILL.md`;
  const firstCollisionParent = `first-${"collision".repeat(20)}`;
  const secondCollisionParent = `second-${"collision".repeat(20)}`;
  const { screen } = await renderEditor([
    skill("a-canonical-skill", longPath, longDisplayName, longDescription, "repo"),
    skill("z-empty", "/skills/empty/SKILL.md", "Empty description", "   ", "system"),
    skill(
      "collision",
      `/skills/${firstCollisionParent}/shared/SKILL.md`,
      "First Collision",
      "first collision description",
      "user",
    ),
    skill(
      "collision",
      `/skills/${secondCollisionParent}/shared/SKILL.md`,
      "Second Collision",
      "second collision description",
      "repo",
    ),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  const longOptionLocator = listbox.getByRole("option", { name: /a-canonical-skill/ });
  const emptyOptionLocator = listbox.getByRole("option", { name: /z-empty/ });
  const collisionOptionLocator = listbox.getByRole("option", {
    name: /first collision description/,
  });
  await expect.element(longOptionLocator).toBeVisible();
  await expect.element(emptyOptionLocator).toBeVisible();
  await expect.element(collisionOptionLocator).toBeVisible();
  const longOption = longOptionLocator.element();
  const emptyOption = emptyOptionLocator.element();
  const collisionOption = collisionOptionLocator.element();
  const description = longOption.querySelector("[data-skill-description]");
  if (!(description instanceof HTMLElement)) {
    throw new Error("long skill description must render");
  }
  const descriptionStyle = getComputedStyle(description);
  const lineHeight = Number.parseFloat(descriptionStyle.lineHeight);

  await expect.element(listbox.getByText(longDisplayName, { exact: true })).toBeVisible();
  await expect.element(listbox.getByText("$a-canonical-skill", { exact: true })).toBeVisible();
  const longMainRow = longOption.firstElementChild;
  const longNameRegion = longMainRow?.firstElementChild;
  const longSourceLabel = longMainRow?.lastElementChild;
  if (
    !(longMainRow instanceof HTMLDivElement) ||
    !(longNameRegion instanceof HTMLDivElement) ||
    !(longSourceLabel instanceof HTMLSpanElement)
  ) {
    throw new Error("long skill option must retain its main-row source layout");
  }
  expect(longNameRegion.classList).toContain("min-w-0");
  expect(longNameRegion.classList).toContain("flex-1");
  expect(longSourceLabel.textContent).toBe("Repository");
  expect(longSourceLabel.classList).toContain("shrink-0");
  expect(longOption.outerHTML).not.toContain(longPath);
  expect(description.getBoundingClientRect().height).toBeLessThanOrEqual(lineHeight + 1);
  expect(emptyOption.querySelector("[data-skill-description]")).toBeNull();
  expect(collisionOption.firstElementChild?.textContent).toContain("User");
  expect(collisionOption.children.item(1)?.textContent).toBe(`${firstCollisionParent}/shared`);
  expect(collisionOption.firstElementChild?.textContent).not.toContain(firstCollisionParent);
  expect(collisionOption.outerHTML).not.toContain("SKILL.md");
  await expect.poll(() => longOption.getBoundingClientRect().width).toBeLessThanOrEqual(384);
  await expect
    .poll(() => {
      const optionBounds = longOption.getBoundingClientRect();
      const sourceBounds = longSourceLabel.getBoundingClientRect();
      return sourceBounds.width > 0 && sourceBounds.right <= optionBounds.right + 1;
    })
    .toBe(true);
  await expect.poll(() => longMainRow.scrollWidth <= longMainRow.clientWidth + 1).toBe(true);
  await expect
    .poll(() => listbox.element().scrollWidth <= listbox.element().clientWidth + 1)
    .toBe(true);
  await expect.poll(() => longOption.scrollWidth <= longOption.clientWidth + 1).toBe(true);
  await expect
    .poll(() => collisionOption.scrollWidth <= collisionOption.clientWidth + 1)
    .toBe(true);
  const scrollRegion = screen.container.querySelector("[data-skill-menu-scroll-region]");
  if (!(scrollRegion instanceof HTMLElement)) {
    throw new Error("skill scroll region must render");
  }
  expect(getComputedStyle(scrollRegion).overflowY).toBe("auto");
  expect(scrollRegion.getAttribute("data-scrollbar")).toBe("thin");
  await expect.poll(() => scrollRegion.scrollWidth <= scrollRegion.clientWidth + 1).toBe(true);
  expect(screen.container.querySelector("[data-skill-menu-details]")).toBeNull();
  expect(listbox.element().querySelector('[role="separator"]')).toBeNull();
});

test("keeps HeroUI hover visual-only and active styling stronger than hover", async () => {
  await userEvent.unhover(document.body);
  const { controllerRef, screen } = await renderEditor([
    skill("alpha", "/skills/alpha/SKILL.md", "Alpha", "Alpha description", "repo"),
    skill("beta", "/skills/beta/SKILL.md", "Beta", "Beta description", "repo"),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");
  await screen.user.keyboard("{ArrowDown}");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  const alphaOption = listbox.getByRole("option", { name: /Alpha/ }).element();
  const betaOption = listbox.getByRole("option", { name: /Beta/ }).element();
  await expect.element(alphaOption).toHaveAttribute("aria-selected", "false");
  await expect.element(betaOption).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(
      () =>
        getComputedStyle(betaOption).backgroundColor !==
        getComputedStyle(alphaOption).backgroundColor,
    )
    .toBe(true);
  const defaultBackground = getComputedStyle(alphaOption).backgroundColor;
  const activeBackground = getComputedStyle(betaOption).backgroundColor;
  const neutralBackgroundProbe = document.createElement("div");
  neutralBackgroundProbe.className = "bg-default";
  document.body.append(neutralBackgroundProbe);
  expect(activeBackground).toBe(getComputedStyle(neutralBackgroundProbe).backgroundColor);
  neutralBackgroundProbe.remove();
  const focusRingProbe = document.createElement("div");
  focusRingProbe.className = "status-focused";
  document.body.append(focusRingProbe);
  const expectedActiveRing = getComputedStyle(focusRingProbe).boxShadow;
  focusRingProbe.remove();
  expect(expectedActiveRing).not.toBe("none");
  await expect.poll(() => getComputedStyle(betaOption).boxShadow).toBe(expectedActiveRing);
  await expect.element(alphaOption).not.toHaveAttribute("data-hovered");
  await expect.element(betaOption).not.toHaveAttribute("data-hovered");

  await userEvent.hover(alphaOption);
  await expect
    .poll(() => getComputedStyle(alphaOption).backgroundColor)
    .not.toBe(defaultBackground);
  const hoverBackground = getComputedStyle(alphaOption).backgroundColor;
  expect(hoverBackground).toBe(activeBackground);
  expect(getComputedStyle(alphaOption).boxShadow).toBe("none");
  await expect.element(alphaOption).not.toHaveAttribute("data-hovered");
  await expect.element(alphaOption).toHaveAttribute("aria-selected", "false");
  await expect.element(betaOption).toHaveAttribute("aria-selected", "true");
  await expect.element(editor).toHaveFocus();

  await userEvent.hover(betaOption);
  await expect.poll(() => getComputedStyle(betaOption).backgroundColor).toBe(activeBackground);
  await expect.poll(() => getComputedStyle(betaOption).boxShadow).toBe(expectedActiveRing);
  await expect.element(betaOption).not.toHaveAttribute("data-focus-visible");
  expect(screen.container.querySelector("[data-skill-menu-detail-preview]")).toBeNull();
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$Beta");
  await userEvent.unhover(document.body);
});

test("does not scroll back to an offscreen active candidate on pointer hover", async () => {
  await userEvent.unhover(document.body);
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
  const activeOptionLocator = listbox.getByRole("option", { name: /skill-00/ });
  const hoveredOptionLocator = listbox.getByRole("option", { name: /skill-19/ });
  await expect.element(activeOptionLocator).toBeVisible();
  await expect.element(hoveredOptionLocator).toBeVisible();
  const activeOption = activeOptionLocator.element();
  const hoveredOption = hoveredOptionLocator.element();
  const scrollRegion = screen.container.querySelector("[data-skill-menu-scroll-region]");
  if (!(scrollRegion instanceof HTMLElement)) {
    throw new Error("skill scroll region must render");
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

  await userEvent.hover(hoveredOption);
  await expect.element(hoveredOption).not.toHaveAttribute("data-hovered");
  await expect
    .poll(() => Math.abs(scrollRegion.scrollTop - scrollTopBeforeHover))
    .toBeLessThanOrEqual(1);
  await expect.element(activeOption).toHaveAttribute("aria-selected", "true");
  await expect.element(hoveredOption).toHaveAttribute("aria-selected", "false");

  await screen.user.keyboard("{Enter}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$skill-00");
  await userEvent.unhover(document.body);
});

test("uses the same replacement for pointer selection and retains editor focus", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor([skill("pointer", "/pointer")], {
    onSubmit,
  });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$poi");
  const option = screen.getByRole("option", { name: /pointer/ });
  await expect.element(option).toHaveClass("list-box-item", "list-box-item--default");
  expect(getComputedStyle(option.element()).transitionProperty).toContain("transform");
  await option.click();

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
  const optionLocator = screen.getByRole("option", { name: /touch/ });
  await expect.element(optionLocator).toBeVisible();
  const option = optionLocator.element();
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

test.for(["ArrowUp", "ArrowDown"] as const)(
  "keeps typeahead ownership of $0",
  async (direction) => {
    const { controllerRef, screen } = await renderEditor([
      skill("alpha", "/skills/alpha/SKILL.md", "Alpha"),
      skill("beta", "/skills/beta/SKILL.md", "Beta"),
    ]);
    const editor = screen.getByRole("combobox", { name: "Message" });
    await editor.fill("$");
    const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
    const alphaOption = listbox.getByRole("option", { name: /Alpha/ });
    const betaOption = listbox.getByRole("option", { name: /Beta/ });
    await expect.element(alphaOption).toHaveAttribute("aria-selected", "true");
    await expect.element(betaOption).toHaveAttribute("aria-selected", "false");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", alphaOption.element().id);

    await screen.user.keyboard(`{${direction}}`);

    await expect.element(editor).toHaveFocus();
    await expect.element(listbox).toBeVisible();
    await expect.element(alphaOption).toHaveAttribute("aria-selected", "false");
    await expect.element(betaOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", betaOption.element().id);
    expect(getController(controllerRef).getSnapshot().textContent).toBe("$");
    expect(screen.container.querySelector('[data-slot="chip"]')).toBeNull();
  },
);

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

test("vertically centers an inline skill chip with adjacent text", async () => {
  const selectedSkill = skill("alignment", "/skills/alignment/SKILL.md", "Alignment");
  const { screen } = await renderEditor([selectedSkill]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  const initialText = "abc $ali def";

  await editor.fill(initialText);
  setCollapsedCaret(editor.element(), initialText, "abc $ali".length);
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Enter}");

  const host = screen.getByRole("group", { name: /Alignment/i });
  const hostElement = host.element();
  const chip = hostElement.querySelector('[data-slot="chip"]');
  if (!(hostElement instanceof HTMLSpanElement) || !(chip instanceof HTMLSpanElement)) {
    throw new Error("selected skill must render as an inline HeroUI Chip");
  }

  const chipBounds = chip.getBoundingClientRect();
  const chipCenter = chipBounds.top + chipBounds.height / 2;
  const leftTextBounds = adjacentVisibleTextCharacterRect(hostElement, "before");
  const rightTextBounds = adjacentVisibleTextCharacterRect(hostElement, "after");
  const centerOffsets = {
    left: chipCenter - (leftTextBounds.top + leftTextBounds.height / 2),
    right: chipCenter - (rightTextBounds.top + rightTextBounds.height / 2),
  };
  const maximumCenterOffset = Math.max(Math.abs(centerOffsets.left), Math.abs(centerOffsets.right));

  expect(
    maximumCenterOffset,
    `skill chip center offsets in CSS px: ${JSON.stringify(centerOffsets)}`,
  ).toBeLessThanOrEqual(1);
});

test("renders an inline HeroUI skill chip whose tooltip discloses only catalog-backed details", async () => {
  const selectedSkill: SkillCatalogCandidate = {
    ...skill(
      "review",
      "/workspace/repo/review/SKILL.md",
      "Friendly Review",
      "Fallback description",
      "repo",
    ),
    shortDescription: "Current catalog summary",
    interface: {
      displayName: "Friendly Review",
      iconSmallUrl: null,
      iconLargeUrl: null,
      shortDescription: "Preferred interface summary",
    },
  };
  const { controllerRef, screen } = await renderEditor([
    selectedSkill,
    skill(
      "review",
      "/workspace/user/review/SKILL.md",
      "Other Review",
      "Other review description",
      "user",
    ),
  ]);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$Friendly");
  await screen.user.keyboard("{Enter}");

  const host = screen.getByRole("group", { name: /Friendly Review/i });
  await expect.element(host).toHaveAccessibleName(/Friendly Review/i);
  await expect.element(host).not.toHaveAttribute("role", "math");
  const hostElement = host.element();
  expect(hostElement.tagName).toBe("SPAN");
  expect(hostElement.getAttribute("contenteditable")).toBe("false");
  const chip = hostElement.querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement))
    throw new Error("selected skill must render a HeroUI Chip");
  const tooltipTrigger = chip.parentElement;
  if (!(tooltipTrigger instanceof HTMLElement)) {
    throw new Error("selected skill chip must render inside a Tooltip trigger");
  }
  expect(tooltipTrigger.getAttribute("role")).toBe("presentation");
  expect(tooltipTrigger.getAttribute("tabindex")).toBe("-1");
  expect(hostElement.querySelector('button, [role="button"], [role="math"]')).toBeNull();
  expect(chip.classList).toContain("chip--sm");
  expect(chip.classList).toContain("chip--secondary");
  expect(chip.querySelector('[data-slot="chip-label"]')?.textContent).toBe("$Friendly Review");
  expect(chip.querySelector("button")).toBeNull();
  expect(hostElement.textContent).toBe("$Friendly Review");
  expect(hostElement.outerHTML).not.toContain(selectedSkill.path);
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "$review", text_elements: [] },
    { type: "skill", name: selectedSkill.name, path: selectedSkill.path },
  ]);

  const editorBounds = editor.element().getBoundingClientRect();
  const triggerBounds = tooltipTrigger.getBoundingClientRect();
  expect(triggerBounds.left).toBeGreaterThanOrEqual(editorBounds.left - 1);
  expect(triggerBounds.right).toBeLessThanOrEqual(editorBounds.right + 1);
  const bodyOverflow = getComputedStyle(document.body).overflow;
  const rootOverflow = getComputedStyle(document.documentElement).overflow;
  const documentScrollWidth = document.documentElement.scrollWidth;

  await userEvent.unhover(document.body);
  await userEvent.hover(tooltipTrigger);
  const tooltip = screen.getByRole("tooltip");
  await expect.element(tooltip, { timeout: 300 }).toBeVisible();
  await expect.element(tooltip).toHaveTextContent("Friendly Review");
  await expect.element(tooltip).toHaveTextContent("$review");
  await expect.element(tooltip).toHaveTextContent("Repository");
  await expect.element(tooltip).toHaveTextContent("Preferred interface summary");
  await expect.element(tooltip).toHaveTextContent("repo/review");
  expect(tooltip.element().textContent).not.toContain("Fallback description");
  expect(tooltip.element().textContent).not.toContain("/workspace/");
  expect(tooltip.element().textContent).not.toContain("SKILL.md");
  expect(tooltip.element().getBoundingClientRect().width).toBeLessThanOrEqual(321);
  expect(tooltip.element().scrollWidth).toBeLessThanOrEqual(tooltip.element().clientWidth + 1);
  expect(getComputedStyle(document.body).overflow).toBe(bodyOverflow);
  expect(getComputedStyle(document.documentElement).overflow).toBe(rootOverflow);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(documentScrollWidth + 1);

  await userEvent.unhover(document.body);
  await expect.element(tooltip).not.toBeInTheDocument();
});

test("skips the skill host during Tab traversal without opening its tooltip", async () => {
  const selectedSkill = skill(
    "keyboard-trigger",
    "/skills/keyboard-trigger/SKILL.md",
    "Keyboard Trigger",
  );
  const controllerRef = createRef<ComposerEditorController>();
  const screen = await renderWithProviders(
    <div>
      <ComposerEditorFixture
        ariaLabel="Message"
        controllerRef={controllerRef}
        disabled={false}
        guardCompositionEndEnter={false}
        onSubmit={() => undefined}
        placeholder="Message Codex"
        skillCatalog={catalog("ready", [selectedSkill])}
      />
      <input aria-label="After composer" type="text" />
    </div>,
  );
  await expect.poll(() => controllerRef.current).not.toBeNull();
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$keyboard");
  await screen.user.keyboard("{Enter}");

  const host = screen.getByRole("group", { name: /Keyboard Trigger/i });
  const chip = host.element().querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement))
    throw new Error("selected skill must render a HeroUI Chip");
  const tooltipTrigger = chip.parentElement;
  if (!(tooltipTrigger instanceof HTMLElement)) {
    throw new Error("selected skill chip must render inside a Tooltip trigger");
  }
  const afterComposer = screen.getByRole("textbox", { name: "After composer" });
  const snapshotBeforeSelection = getController(controllerRef).getSnapshot();
  await expect.element(editor).toHaveFocus();
  await expect.element(host).not.toHaveAttribute("data-selected");
  await expect.element(chip).not.toHaveAttribute("data-selected");
  expect(tooltipTrigger.getAttribute("tabindex")).toBe("-1");

  await screen.user.tab();
  await expect.element(afterComposer).toHaveFocus();
  await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
  expect(readNodeSelectionSize(editor.element())).toBeNull();
  await expect.element(host).not.toHaveAttribute("data-selected");
  await expect.element(chip).not.toHaveAttribute("data-selected");
  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBeforeSelection);
});

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
  const failedListbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  expect(failedListbox.getByRole("option").length).toBe(0);
  const retryButton = screen.getByRole("button", { name: "Retry" });
  await expect.element(editor).toHaveFocus();
  await screen.user.keyboard("{Shift>}{Tab}{/Shift}");
  await expect.element(retryButton).toHaveFocus();
  await screen.user.keyboard("{Enter}");
  expect(onRetrySkillCatalog).toHaveBeenCalledOnce();

  await screen.rerender(renderForCatalog(catalog("failed", []), true));
  await expect.element(editor).toHaveAttribute("contenteditable", "false");
  await expect
    .element(screen.getByRole("listbox", { name: "Typeahead menu" }))
    .not.toBeInTheDocument();
});

test("shows invalid chip details only when a complete ready catalog confirms its path is unavailable", async () => {
  const selectedSkill = skill(
    "canonical-skill",
    "/private/skills/missing-location/SKILL.md",
    "Friendly Skill",
  );
  const controllerRef = createRef<ComposerEditorController>();
  const renderForCatalog = (skillCatalog: SkillCatalogState, disabled = false) => (
    <ComposerEditorFixture
      ariaLabel="Message"
      controllerRef={controllerRef}
      disabled={disabled}
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
  const host = screen.getByRole("group", { name: /Friendly Skill/i });
  const hostElement = host.element();
  const chip = hostElement.querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement))
    throw new Error("selected skill must render a HeroUI Chip");

  await screen.rerender(renderForCatalog(invalidCatalog));
  await expect.element(hostElement).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(hostElement)
    .toHaveAccessibleName(/^(?=.*Friendly Skill)(?=.*Invalid skill).*$/i);
  expect(chip.classList).toContain("chip--danger");
  expect(chip.classList).toContain("chip--soft");
  expect(hostElement.textContent).toBe("$Friendly Skill");
  expect(getController(controllerRef).getSnapshot().textContent).toBe("$Friendly Skill");
  expect(hostElement.outerHTML).not.toContain(selectedSkill.path);
  await userEvent.unhover(document.body);
  await userEvent.hover(chip);
  const invalidTooltip = screen.getByRole("tooltip");
  await expect.element(invalidTooltip, { timeout: 2_500 }).toHaveTextContent("Invalid skill");
  await expect.element(invalidTooltip).toHaveTextContent("missing-location");
  expect(invalidTooltip.element().textContent).not.toContain("/private/");
  expect(invalidTooltip.element().textContent).not.toContain("SKILL.md");
  await userEvent.unhover(document.body);
  await expect.element(invalidTooltip).not.toBeInTheDocument();

  await screen.rerender(renderForCatalog(readyCatalog));
  await expect.element(hostElement).not.toHaveAttribute("aria-invalid");
  await expect.element(hostElement).toHaveAccessibleName(/Friendly Skill/i);
  expect(chip.classList).toContain("chip--secondary");
  expect(chip.classList).not.toContain("chip--danger");
  const refreshedSkill: SkillCatalogCandidate = {
    ...selectedSkill,
    interface: {
      ...selectedSkill.interface,
      shortDescription: "Refreshed catalog summary",
    },
  };
  await screen.rerender(renderForCatalog(catalog("ready", [refreshedSkill])));
  await userEvent.unhover(document.body);
  await userEvent.hover(chip);
  const refreshedTooltip = screen.getByRole("tooltip");
  await expect
    .element(refreshedTooltip, { timeout: 2_500 })
    .toHaveTextContent("Refreshed catalog summary");
  expect(refreshedTooltip.element().textContent).not.toContain("missing-location");
  await userEvent.unhover(document.body);
  await expect.element(refreshedTooltip).not.toBeInTheDocument();

  const unconfirmedCatalogs: SkillCatalogState[] = [
    catalog("refreshing", []),
    catalog("stale", []),
    catalog("failed", []),
    catalog("ready", [], 1),
  ];
  for (const skillCatalog of unconfirmedCatalogs) {
    await screen.rerender(renderForCatalog(invalidCatalog));
    await expect.element(hostElement).toHaveAttribute("aria-invalid", "true");
    await screen.rerender(renderForCatalog(skillCatalog));
    await expect.element(hostElement).not.toHaveAttribute("aria-invalid");
    await expect.element(hostElement).toHaveAccessibleName(/Friendly Skill/i);
    expect(chip.classList).not.toContain("chip--danger");
  }

  await screen.rerender(renderForCatalog(readyCatalog, true));
  await expect.element(editor).toHaveAttribute("contenteditable", "false");
  await expect.element(hostElement).toHaveAttribute("aria-disabled", "true");
  const tooltipTrigger = chip.parentElement;
  if (!(tooltipTrigger instanceof HTMLElement)) {
    throw new Error("selected skill chip must render inside a Tooltip trigger");
  }
  expect(tooltipTrigger.getAttribute("tabindex")).toBe("-1");
  const disabledSnapshot = getController(controllerRef).getSnapshot();
  const disabledSelectionSize = readNodeSelectionSize(editor.element());
  chip.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, cancelable: true }));
  editor.element().dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      data: "replacement",
      inputType: "insertText",
    }),
  );
  editor
    .element()
    .dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Delete" }),
    );
  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", "replacement");
  editor
    .element()
    .dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  expect(readNodeSelectionSize(editor.element())).toBe(disabledSelectionSize);
  expect(getController(controllerRef).getSnapshot()).toEqual(disabledSnapshot);
  expect(hostElement.textContent).toBe("$Friendly Skill");
  await userEvent.hover(chip);
  await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
});

test("reprojects invalid sibling collision paths through delete, undo, redo, and draft restore", async () => {
  const primary = skill("shared", "/private/alpha/shared/SKILL.md", "Alpha Shared");
  const sibling = skill("shared", "/private/beta/shared/SKILL.md", "Beta Shared");
  const selectedPaths = [primary.path, sibling.path];
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
        invalidPaths: invalidSelectedSkillPaths(skillCatalog, selectedPaths),
        statusText: "Invalid skill",
      }}
    />
  );
  const primaryCatalog = catalog("ready", [primary]);
  const collidingCatalog = catalog("ready", [primary, sibling]);
  const emptyCatalog = catalog("ready", []);
  const screen = await renderWithProviders(renderForCatalog(primaryCatalog));
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$Alpha");
  await screen.user.keyboard("{Enter}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  const singleDraft = getController(controllerRef).capture().draft;

  await screen.rerender(renderForCatalog(collidingCatalog));
  await screen.user.keyboard(" $Beta");
  await screen.user.keyboard("{Enter}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual(selectedPaths);
  const collidingDraft = getController(controllerRef).capture().draft;

  await screen.rerender(renderForCatalog(emptyCatalog));
  await expect
    .element(screen.getByRole("group", { name: /Alpha Shared/i }))
    .toHaveAttribute("aria-invalid", "true");
  await expect
    .element(screen.getByRole("group", { name: /Beta Shared/i }))
    .toHaveAttribute("aria-invalid", "true");

  const expectPathDetails = async (triggerName: RegExp, expectedPath: string): Promise<void> => {
    await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
    const host = screen.getByRole("group", { name: triggerName });
    const chip = host.element().querySelector('[data-slot="chip"]');
    if (!(chip instanceof HTMLSpanElement))
      throw new Error("selected skill must render a HeroUI Chip");
    const tooltipTrigger = chip.parentElement;
    if (!(tooltipTrigger instanceof HTMLElement)) {
      throw new Error("selected skill chip must render inside a Tooltip trigger");
    }
    const wasSelected = chip.hasAttribute("data-selected");
    await expect.poll(() => chip.hasAttribute("data-selected")).toBe(wasSelected);
    await userEvent.unhover(document.body);
    await userEvent.hover(tooltipTrigger);
    await expect.poll(() => chip.hasAttribute("data-selected")).toBe(wasSelected);
    const pathParagraph = screen.getByText(expectedPath, { exact: true });
    await expect.element(pathParagraph).toBeVisible();
    expect(pathParagraph.element().tagName).toBe("P");
    const tooltip = pathParagraph.element().closest('[role="tooltip"]');
    if (!(tooltip instanceof HTMLElement))
      throw new Error("selected skill path must render inside a Tooltip");
    expect(tooltip.textContent).not.toContain("/private/");
    expect(tooltip.textContent).not.toContain("SKILL.md");
    await userEvent.unhover(document.body);
    await expect.element(pathParagraph).not.toBeInTheDocument();
    await expect.element(tooltip).not.toBeInTheDocument();
    await expect.poll(() => chip.hasAttribute("data-selected")).toBe(wasSelected);
  };

  await expectPathDetails(/Alpha Shared/i, "alpha/shared");
  await expectPathDetails(/Beta Shared/i, "beta/shared");

  const siblingHost = screen.getByRole("group", { name: /Beta Shared/i });
  await siblingHost.getByText("$Beta Shared", { exact: true }).click();
  await screen.user.keyboard("{Backspace}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(/Alpha Shared/i, "shared");

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual(selectedPaths);
  await expectPathDetails(/Alpha Shared/i, "alpha/shared");
  await expectPathDetails(/Beta Shared/i, "beta/shared");

  dispatchHistoryShortcut(editor.element(), "redo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(/Alpha Shared/i, "shared");

  expect(getController(controllerRef).restore(collidingDraft)).toEqual({ type: "restored" });
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual(selectedPaths);
  await expectPathDetails(/Alpha Shared/i, "alpha/shared");
  await expectPathDetails(/Beta Shared/i, "beta/shared");

  expect(getController(controllerRef).restore(singleDraft)).toEqual({ type: "restored" });
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(/Alpha Shared/i, "shared");
});

type RenderEditorOptions = Readonly<{
  guardCompositionEndEnter?: boolean;
  locale?: AppLocale;
  onSubmit?: ComposerEditorProps["onSubmit"];
}>;

function dispatchCompositionEnd(root: Element, data: string): void {
  const event = new CompositionEvent("compositionend", { bubbles: true, data });
  root.dispatchEvent(event);

  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) {
    throw new Error("composition root must belong to a Lexical editor");
  }
  if (editor.isComposing()) {
    editor.dispatchCommand(COMPOSITION_END_COMMAND, event);
  }
}

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

function readNodeSelectionSize(root: Element): number | null {
  const editor = getNearestEditorFromDOMNode(root);
  if (editor == null) throw new Error("composer root must belong to a Lexical editor");
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    return $isNodeSelection(selection) ? selection.getNodes().length : null;
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

type SkillCaretSide = "after" | "before";

function findAdjacentText(node: ChildNode | null, side: SkillCaretSide): Text {
  if (node instanceof Text) {
    return node;
  }
  if (!(node instanceof Element)) {
    throw new Error(`selected skill must have ${side} text content`);
  }
  const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  if (side === "before") {
    let nextText = walker.nextNode();
    while (nextText != null) {
      text = nextText;
      nextText = walker.nextNode();
    }
  }
  if (!(text instanceof Text)) {
    throw new Error(`selected skill must have ${side} text content`);
  }
  return text;
}

function adjacentVisibleTextCharacterRect(tokenHost: HTMLElement, side: SkillCaretSide): DOMRect {
  const adjacentNode = side === "before" ? tokenHost.previousSibling : tokenHost.nextSibling;
  const text = findAdjacentText(adjacentNode, side);
  const characterIndex =
    side === "before"
      ? Array.from(text.data.matchAll(/\S/gu)).at(-1)?.index
      : text.data.search(/\S/u);
  if (characterIndex == null || characterIndex < 0) {
    throw new Error(`selected skill must have visible ${side} text content`);
  }

  const range = tokenHost.ownerDocument.createRange();
  range.setStart(text, characterIndex);
  range.setEnd(text, characterIndex + 1);
  return range.getBoundingClientRect();
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
