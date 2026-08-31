import { createRef, useState, type CSSProperties, type RefObject } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  $createNodeSelection,
  $createRangeSelection,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  getNearestEditorFromDOMNode,
} from "lexical";

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
  "keeps keyboard navigation at the candidate scroll boundaries across catalog states",
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
    const scrollRegion = listbox.element().querySelector("[data-skill-menu-scroll-region]");
    const styledListbox = listbox.element().querySelector('[data-slot="list-box"]');
    if (!(scrollRegion instanceof HTMLElement) || !(styledListbox instanceof HTMLUListElement)) {
      throw new Error("skill menu must expose its candidate scroll and listbox geometry");
    }
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
    await expect.poll(() => scrollRegion.scrollHeight > scrollRegion.clientHeight).toBe(true);
    expect(scrollRegion.scrollTop).toBe(0);

    await screen.user.keyboard("{ArrowUp}");

    await expect.element(lastOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", lastOption.element().id);
    const maximumScrollTop = scrollRegion.scrollHeight - scrollRegion.clientHeight;
    await expect
      .poll(() => {
        const scrollBounds = scrollRegion.getBoundingClientRect();
        const optionBounds = lastOption.element().getBoundingClientRect();
        const scrollStyle = getComputedStyle(scrollRegion);
        const listboxStyle = getComputedStyle(styledListbox);
        return {
          bannerOutsideScrollRegion: banner == null || !scrollRegion.contains(banner.element()),
          boxShadow: getComputedStyle(lastOption.element()).boxShadow,
          edgeClearance: scrollBounds.bottom - optionBounds.bottom,
          listboxPaddingBottom: listboxStyle.paddingBottom,
          listboxPaddingTop: listboxStyle.paddingTop,
          maximumScrollTop,
          scrollPaddingBottom: scrollStyle.scrollPaddingBottom,
          scrollPaddingTop: scrollStyle.scrollPaddingTop,
          scrollTop: scrollRegion.scrollTop,
        };
      })
      .toEqual({
        bannerOutsideScrollRegion: true,
        boxShadow: expectedActiveRing,
        edgeClearance: 6,
        listboxPaddingBottom: "6px",
        listboxPaddingTop: "6px",
        maximumScrollTop,
        scrollPaddingBottom: "6px",
        scrollPaddingTop: "6px",
        scrollTop: maximumScrollTop,
      });
    await expect.element(editor).toHaveFocus();
    await expect.poll(bannerIsVisible).toBe(true);

    await screen.user.keyboard("{ArrowDown}");

    await expect.element(firstOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", firstOption.element().id);
    await expect
      .poll(() => {
        const scrollBounds = scrollRegion.getBoundingClientRect();
        const optionBounds = firstOption.element().getBoundingClientRect();
        return {
          bannerOutsideScrollRegion: banner == null || !scrollRegion.contains(banner.element()),
          boxShadow: getComputedStyle(firstOption.element()).boxShadow,
          edgeClearance: optionBounds.top - scrollBounds.top,
          scrollTop: scrollRegion.scrollTop,
        };
      })
      .toEqual({
        bannerOutsideScrollRegion: true,
        boxShadow: expectedActiveRing,
        edgeClearance: 6,
        scrollTop: 0,
      });
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
  const plainOption = listbox.getByRole("option", { name: /plain description/ }).element();
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
  const activeOption = listbox.getByRole("option", { name: /skill-00/ }).element();
  const hoveredOption = listbox.getByRole("option", { name: /skill-19/ }).element();
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

type SkillNavigationDirection = "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp";
type SkillNavigationLayout = "double" | "explicit" | "inline" | "narrow" | "only" | "soft-wrap";

const nativeSkillNavigationTargetCases: readonly NativeTargetCase[] = [
  { direction: "ArrowRight", layout: "inline", textDirection: "ltr", target: "chip" },
  { direction: "ArrowLeft", layout: "inline", textDirection: "rtl", target: "chip" },
  { direction: "ArrowDown", layout: "explicit", textDirection: "ltr", target: "chip" },
  { direction: "ArrowUp", layout: "explicit", textDirection: "rtl", target: "chip" },
  { direction: "ArrowDown", layout: "soft-wrap", textDirection: "ltr", target: "chip" },
  { direction: "ArrowUp", layout: "soft-wrap", textDirection: "rtl", target: "chip" },
  { direction: "ArrowDown", layout: "narrow", textDirection: "ltr", target: "chip" },
  { direction: "ArrowUp", layout: "narrow", textDirection: "rtl", target: "chip" },
  {
    direction: "ArrowLeft",
    layout: "inline",
    pointKind: "ordinary",
    textDirection: "ltr",
    target: "outside",
  },
  {
    direction: "ArrowDown",
    layout: "explicit",
    pointKind: "ordinary",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowUp",
    layout: "explicit",
    pointKind: "ordinary",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowRight",
    layout: "inline",
    pointKind: "whitespace",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowUp",
    layout: "explicit",
    pointKind: "ordinary",
    textDirection: "ltr",
    target: "outside",
  },
  {
    direction: "ArrowDown",
    layout: "explicit",
    pointKind: "line-end",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowLeft",
    layout: "soft-wrap",
    pointKind: "ordinary",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowRight",
    layout: "soft-wrap",
    pointKind: "whitespace",
    textDirection: "ltr",
    target: "outside",
  },
  {
    direction: "ArrowDown",
    layout: "explicit",
    pointKind: "line-start",
    textDirection: "ltr",
    target: "outside",
  },
];

test.for(nativeSkillNavigationTargetCases)(
  "proves native skill chip navigation targets without side effects $layout-$textDirection-$direction-$target",
  async ({ direction, layout, pointKind, target, textDirection }) => {
    const outsideControl =
      target === "outside"
        ? await readOutsideNavigationControl({
            direction,
            layout,
            pointKind,
            target,
            textDirection,
          })
        : null;
    const fixture = await renderSkillNavigationFixture(layout, textDirection);
    const targetHost = fixture.tokenHosts[0];
    if (targetHost == null) throw new Error("native target fixture requires one skill host");
    const discoveredStart =
      target === "chip" &&
      (layout === "narrow" || layout === "soft-wrap") &&
      (direction === "ArrowDown" || direction === "ArrowUp")
        ? await findNativeSkillEntryStartAddress(
            fixture.editor,
            targetHost,
            layout,
            direction,
            textDirection,
          )
        : null;
    const point =
      outsideControl != null
        ? resolveNavigationPointAddress(fixture.editor, outsideControl.start)
        : discoveredStart != null
          ? resolveNavigationPointAddress(fixture.editor, discoveredStart)
          : findSkillNavigationStart(fixture.editor, layout, direction, target, textDirection);
    await setPublicCaret(fixture.editor, point);

    const beforeSelection = readDomSelectionPoint(fixture.editor);
    const startRect = caretRect(point);
    const beforeFocus = fixture.editor.ownerDocument.activeElement;
    const beforeScroll = readNavigationScroll(fixture.editor);
    applyNativeSelectionModify(fixture.editor, direction);
    const nativeTarget = readDomSelectionPoint(fixture.editor);
    expect(nativeTarget.node).not.toBeNull();
    expect(
      nativeTarget.node === beforeSelection.node && nativeTarget.offset === beforeSelection.offset,
    ).toBe(false);
    if (nativeTarget.node == null) throw new Error("native probe must remain inside the editor");
    const targetRect = caretRect({ node: nativeTarget.node, offset: nativeTarget.offset });
    expect(isUsableNavigationRect(targetRect)).toBe(true);
    const actualControlTarget =
      outsideControl == null ? null : readNavigationPointAddress(fixture.editor, nativeTarget);
    expect(actualControlTarget).toEqual(outsideControl?.target ?? null);
    const targetClassification =
      target === "chip"
        ? nativePathTargetsSkill(
            fixture.editor,
            targetHost,
            startRect,
            point,
            { node: nativeTarget.node, offset: nativeTarget.offset },
            targetRect,
            direction,
          )
        : nativePathIsClearlyOutsideSkill(
            startRect,
            targetRect,
            targetHost.getBoundingClientRect(),
          );
    expect(targetClassification).toBe(true);
    expect(fixture.editor.ownerDocument.activeElement).toBe(beforeFocus);
    expect(readNavigationScroll(fixture.editor)).toEqual(beforeScroll);
    expect(targetHost.getAttribute("contenteditable")).toBe("false");
    await fixture.screen.unmount();
  },
);

const skillNavigationEntryCases: readonly NavigationEntryCase[] = [
  { direction: "ArrowRight", layout: "inline", textDirection: "ltr", target: "chip" },
  { direction: "ArrowLeft", layout: "inline", textDirection: "ltr", target: "chip" },
  { direction: "ArrowRight", layout: "inline", textDirection: "rtl", target: "chip" },
  { direction: "ArrowLeft", layout: "inline", textDirection: "rtl", target: "chip" },
  { direction: "ArrowDown", layout: "explicit", textDirection: "ltr", target: "chip" },
  { direction: "ArrowUp", layout: "explicit", textDirection: "ltr", target: "chip" },
  { direction: "ArrowDown", layout: "explicit", textDirection: "rtl", target: "chip" },
  { direction: "ArrowUp", layout: "explicit", textDirection: "rtl", target: "chip" },
  { direction: "ArrowDown", layout: "soft-wrap", textDirection: "ltr", target: "chip" },
  { direction: "ArrowUp", layout: "soft-wrap", textDirection: "rtl", target: "chip" },
  { direction: "ArrowDown", layout: "narrow", textDirection: "ltr", target: "chip" },
  { direction: "ArrowUp", layout: "narrow", textDirection: "rtl", target: "chip" },
  {
    direction: "ArrowDown",
    layout: "narrow",
    resizeWidth: "9rem",
    textDirection: "ltr",
    target: "chip",
  },
  {
    direction: "ArrowUp",
    layout: "narrow",
    resizeWidth: "20rem",
    textDirection: "rtl",
    target: "chip",
  },
  {
    direction: "ArrowLeft",
    layout: "inline",
    pointKind: "ordinary",
    textDirection: "ltr",
    target: "outside",
  },
  {
    direction: "ArrowRight",
    layout: "inline",
    pointKind: "whitespace",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowUp",
    layout: "explicit",
    pointKind: "ordinary",
    textDirection: "ltr",
    target: "outside",
  },
  {
    direction: "ArrowDown",
    layout: "explicit",
    pointKind: "line-end",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowLeft",
    layout: "soft-wrap",
    pointKind: "ordinary",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowRight",
    layout: "soft-wrap",
    pointKind: "whitespace",
    textDirection: "ltr",
    target: "outside",
  },
  {
    direction: "ArrowUp",
    layout: "explicit",
    pointKind: "ordinary",
    textDirection: "rtl",
    target: "outside",
  },
  {
    direction: "ArrowDown",
    layout: "explicit",
    pointKind: "line-start",
    textDirection: "ltr",
    target: "outside",
  },
];

test.for(skillNavigationEntryCases)(
  "moves through skill chips as four-direction atomic stops from text $layout-$textDirection-$direction-$target",
  async ({ direction, layout, pointKind, resizeWidth, target, textDirection }) => {
    const nativeSkillStart =
      target === "chip" && (layout === "narrow" || layout === "soft-wrap")
        ? await readNativeSkillEntryStartAddress({
            direction,
            layout,
            pointKind,
            resizeWidth,
            target,
            textDirection,
          })
        : null;
    const outsideControl =
      target === "outside"
        ? await readOutsideNavigationControl({
            direction,
            layout,
            pointKind,
            resizeWidth,
            target,
            textDirection,
          })
        : null;
    const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
    const fixture = await renderSkillNavigationFixture(layout, textDirection, { onSubmit });
    if (resizeWidth != null) {
      fixture.shell.style.width = resizeWidth;
      await nextNavigationFrame();
    }
    const targetHost = fixture.tokenHosts[0];
    const targetChip = fixture.chips[0];
    if (targetHost == null || targetChip == null) {
      throw new Error("navigation entry fixture requires one skill chip");
    }
    const point =
      outsideControl != null
        ? resolveNavigationPointAddress(fixture.editor, outsideControl.start)
        : nativeSkillStart != null
          ? resolveNavigationPointAddress(fixture.editor, nativeSkillStart)
          : findSkillNavigationStart(fixture.editor, layout, direction, target, textDirection);
    await setPublicCaret(fixture.editor, point);
    const before = readComposerNavigationState(fixture.controllerRef);
    const beforeScroll = readNavigationScroll(fixture.editor);

    const defaultPrevented = await pressSkillNavigationKey(
      fixture.editor,
      fixture.screen.user.keyboard,
      direction,
    );

    await expect.element(fixture.editor).toHaveFocus();
    expect(readComposerNavigationState(fixture.controllerRef)).toEqual(before);
    expect(readNavigationScroll(fixture.editor)).toEqual(beforeScroll);
    expect(onSubmit).not.toHaveBeenCalled();
    const finalPoint = readDomSelectionPoint(fixture.editor);
    expect(defaultPrevented).toBe(target === "chip");
    await expect.poll(() => targetChip.hasAttribute("data-selected")).toBe(target === "chip");
    await nextNavigationFrame();
    const selectedChips = fixture.chips.filter((chip) => chip.hasAttribute("data-selected"));
    expect(selectedChips).toEqual(target === "chip" ? [targetChip] : []);
    const selectionRangeCount = fixture.editor.ownerDocument.getSelection()?.rangeCount;
    expect(target === "chip" ? selectionRangeCount : 0).toBe(0);
    const actualOutsideTarget =
      target === "outside" ? readNavigationPointAddress(fixture.editor, finalPoint) : null;
    const expectedOutsideTarget = target === "outside" ? (outsideControl?.target ?? null) : null;
    expect(actualOutsideTarget).toEqual(expectedOutsideTarget);
  },
);

const selectedSkillExitCases: readonly Readonly<{
  direction: SkillNavigationDirection;
  layout: SkillNavigationLayout;
  textDirection: "ltr" | "rtl";
}>[] = (["ltr", "rtl"] as const).flatMap((textDirection) =>
  (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const).map((direction) => ({
    direction,
    layout: direction === "ArrowLeft" ? "inline" : direction === "ArrowRight" ? "only" : "explicit",
    textDirection,
  })),
);

test.for(selectedSkillExitCases)(
  "moves through skill chips as four-direction atomic stops from selection $layout-$textDirection-$direction",
  async ({ direction, layout, textDirection }) => {
    const visualEdge = direction === "ArrowLeft" || direction === "ArrowUp" ? "left" : "right";
    const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
    const fixture = await renderSkillNavigationFixture(layout, textDirection, { onSubmit });
    const targetHost = fixture.tokenHosts[0];
    const targetChip = fixture.chips[0];
    const trigger = fixture.triggers[0];
    if (targetHost == null || targetChip == null || trigger == null) {
      throw new Error("navigation exit fixture requires one skill chip");
    }
    const expectedVisualEdge = readSkillVisualEdgeAddress(fixture.editor, targetHost, visualEdge);
    trigger.click();
    await expect.element(targetChip).toHaveAttribute("data-selected");
    const before = readComposerNavigationState(fixture.controllerRef);
    const beforeScroll = readNavigationScroll(fixture.editor);

    const defaultPrevented = await pressSkillNavigationKey(
      fixture.editor,
      fixture.screen.user.keyboard,
      direction,
    );

    expect(defaultPrevented).toBe(true);
    await expect.element(targetChip).not.toHaveAttribute("data-selected");
    await expect.element(fixture.editor).toHaveFocus();
    expect(readComposerNavigationState(fixture.controllerRef)).toEqual(before);
    expect(readNavigationScroll(fixture.editor)).toEqual(beforeScroll);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(readSkillBoundary(fixture.editor, targetHost)).toBe(
      expectedVisualBoundary(direction, textDirection),
    );
    const point = readDomSelectionPoint(fixture.editor);
    if (point.node == null) throw new Error("navigation exit must leave a collapsed DOM caret");
    expect(readNavigationPointAddress(fixture.editor, point)).toEqual(expectedVisualEdge);
  },
);

const skillBoundarySecondStepCases = [
  { direction: "ArrowLeft", textDirection: "ltr" },
  { direction: "ArrowRight", textDirection: "rtl" },
  { direction: "ArrowUp", textDirection: "ltr" },
  { direction: "ArrowDown", textDirection: "rtl" },
] as const;

test.for(skillBoundarySecondStepCases)(
  "moves through skill chips as four-direction atomic stops on the next boundary step $textDirection-$direction",
  async ({ direction, textDirection }) => {
    const nativeControlTarget = await readUnownedBoundaryTarget(direction, textDirection);
    const fixture = await renderSkillNavigationFixture("explicit", textDirection);
    const targetHost = fixture.tokenHosts[0];
    const targetChip = fixture.chips[0];
    if (targetHost == null || targetChip == null) {
      throw new Error("boundary step fixture requires one skill chip");
    }
    await setPublicSkillBoundary(
      fixture.editor,
      targetHost,
      expectedVisualBoundary(direction, textDirection),
    );
    const defaultPrevented = await pressSkillNavigationKey(
      fixture.editor,
      fixture.screen.user.keyboard,
      direction,
    );

    expect(defaultPrevented).toBe(false);
    await expect.element(targetChip).not.toHaveAttribute("data-selected");
    const finalPoint = readDomSelectionPoint(fixture.editor);
    expect(readNavigationPointAddress(fixture.editor, finalPoint)).toEqual(nativeControlTarget);
  },
);

const consecutiveSkillCases = [
  { direction: "ArrowRight", origin: "between", targetIndex: 1 },
  { direction: "ArrowLeft", origin: "between", targetIndex: 0 },
  { direction: "ArrowRight", origin: "selected", targetIndex: 0 },
  { direction: "ArrowLeft", origin: "selected", targetIndex: 1 },
] as const;

test.for(consecutiveSkillCases)(
  "moves through skill chips as four-direction atomic stops for consecutive chips $origin-$direction",
  async ({ direction, origin, targetIndex }) => {
    const fixture = await renderSkillNavigationFixture("double", "ltr");
    const targetHost = fixture.tokenHosts[targetIndex];
    const targetChip = fixture.chips[targetIndex];
    if (targetHost == null || targetChip == null) {
      throw new Error("consecutive fixture requires both skill chips");
    }
    if (origin === "selected") {
      fixture.triggers[targetIndex]?.click();
    } else {
      const parent = targetHost.parentNode;
      if (!(parent instanceof Element)) throw new Error("consecutive chips require a parent");
      const hostIndex = Array.from(parent.childNodes).indexOf(targetHost);
      await setPublicCaret(fixture.editor, {
        node: parent,
        offset: direction === "ArrowRight" ? hostIndex : hostIndex + 1,
      });
    }

    await pressSkillNavigationKey(fixture.editor, fixture.screen.user.keyboard, direction);

    expect(selectionIsInsideSkillLabel(fixture.editor, fixture.tokenHosts)).toBe(false);
    const expectedBoundary = direction === "ArrowRight" ? "after" : "before";
    const actualBoundary = readSkillBoundary(fixture.editor, targetHost);
    expect(origin === "selected" ? actualBoundary : expectedBoundary).toBe(expectedBoundary);
    await expect
      .poll(() => (origin === "between" ? targetChip.hasAttribute("data-selected") : true))
      .toBe(true);
  },
);

const modifiedSkillNavigationCases = [
  { direction: "ArrowLeft", modifier: "Shift" },
  { direction: "ArrowRight", modifier: "Alt" },
  { direction: "ArrowUp", modifier: "Meta" },
  { direction: "ArrowDown", modifier: "Control" },
] as const;

test.for(modifiedSkillNavigationCases)(
  "moves through skill chips as four-direction atomic stops without owning $modifier-$direction",
  async ({ direction, modifier }) => {
    const fixture = await renderSkillNavigationFixture("inline", "ltr");
    const targetChip = fixture.chips[0];
    const trigger = fixture.triggers[0];
    if (targetChip == null || trigger == null) {
      throw new Error("modifier fixture requires one skill chip");
    }
    trigger.click();
    await expect.element(targetChip).toHaveAttribute("data-selected");
    const controller = getController(fixture.controllerRef);
    const selection = fixture.editor.ownerDocument.getSelection();
    const beforeSelection = {
      anchorNode: selection?.anchorNode ?? null,
      anchorOffset: selection?.anchorOffset ?? 0,
      focusNode: selection?.focusNode ?? null,
      focusOffset: selection?.focusOffset ?? 0,
      rangeCount: selection?.rangeCount ?? 0,
    };
    const beforeCapture = controller.capture();
    const beforeFocus = fixture.editor.ownerDocument.activeElement;
    const beforeScroll = readNavigationScroll(fixture.editor);
    const beforeState = controller.getSnapshot();

    const event = dispatchModifiedSkillNavigationKey(fixture.editor, direction, modifier);

    expect(event.defaultPrevented).toBe(false);
    await expect.element(targetChip).toHaveAttribute("data-selected");
    expect({
      anchorNode: selection?.anchorNode ?? null,
      anchorOffset: selection?.anchorOffset ?? 0,
      focusNode: selection?.focusNode ?? null,
      focusOffset: selection?.focusOffset ?? 0,
      rangeCount: selection?.rangeCount ?? 0,
    }).toEqual(beforeSelection);
    expect(controller.capture()).toEqual(beforeCapture);
    expect(fixture.editor.ownerDocument.activeElement).toBe(beforeFocus);
    expect(readNavigationScroll(fixture.editor)).toEqual(beforeScroll);
    expect(controller.getSnapshot()).toEqual(beforeState);
  },
);

const unownedSkillSelectionCases = [
  { direction: "ArrowDown", selectionKind: "non-collapsed-range" },
  { direction: "ArrowLeft", selectionKind: "non-skill-node" },
  { direction: "ArrowRight", selectionKind: "multiple-skill-nodes" },
  { direction: "ArrowUp", selectionKind: "stale-node" },
] as const;

test.for(unownedSkillSelectionCases)(
  "moves through skill chips as four-direction atomic stops without owning $selectionKind-$direction",
  async ({ direction, selectionKind }) => {
    const fixture = await renderSkillNavigationFixture("double", "ltr");
    const lexicalEditor = getNearestEditorFromDOMNode(fixture.editor);
    if (lexicalEditor == null) throw new Error("selection ownership fixture requires its editor");
    const textPoint = navigationTextPoint(fixture.editor, "left ", 1);

    await new Promise<void>((resolve) => {
      lexicalEditor.update(
        () => {
          switch (selectionKind) {
            case "non-collapsed-range": {
              const textNode = $getNearestNodeFromDOMNode(textPoint.node);
              if (textNode == null) throw new Error("range fixture requires a Lexical text node");
              const selection = $createRangeSelection();
              selection.anchor.set(textNode.getKey(), 1, "text");
              selection.focus.set(textNode.getKey(), 3, "text");
              $setSelection(selection);
              break;
            }
            case "non-skill-node": {
              const textNode = $getNearestNodeFromDOMNode(textPoint.node);
              if (textNode == null) throw new Error("node fixture requires a Lexical text node");
              const selection = $createNodeSelection();
              selection.add(textNode.getKey());
              $setSelection(selection);
              break;
            }
            case "multiple-skill-nodes": {
              const selection = $createNodeSelection();
              for (const host of fixture.tokenHosts) {
                const node = $getNearestNodeFromDOMNode(host);
                if (node == null) throw new Error("multiple-node fixture requires mounted skills");
                selection.add(node.getKey());
              }
              $setSelection(selection);
              break;
            }
            case "stale-node": {
              const selection = $createNodeSelection();
              selection.add("unavailable-skill-node");
              $setSelection(selection);
              break;
            }
          }
        },
        { onUpdate: resolve },
      );
    });
    lexicalEditor.getEditorState().read(() => {
      const selection = $getSelection();
      const selectionMatchesKind =
        selectionKind === "non-collapsed-range"
          ? $isRangeSelection(selection) && !selection.isCollapsed()
          : $isNodeSelection(selection);
      expect(selectionMatchesKind).toBe(true);
    });
    const beforeCapture = getController(fixture.controllerRef).capture();
    const beforeFocus = fixture.editor.ownerDocument.activeElement;
    const beforeScroll = readNavigationScroll(fixture.editor);

    const event = dispatchSkillNavigationKey(fixture.editor, direction);

    expect(event.defaultPrevented).toBe(false);
    expect(getController(fixture.controllerRef).capture()).toEqual(beforeCapture);
    expect(fixture.editor.ownerDocument.activeElement).toBe(beforeFocus);
    expect(readNavigationScroll(fixture.editor)).toEqual(beforeScroll);
  },
);

test.for(["ArrowUp", "ArrowDown"] as const)(
  "moves through skill chips as four-direction atomic stops while typeahead owns $0",
  async (direction) => {
    const { controllerRef, screen } = await renderEditor([
      skill("alpha", "/skills/alpha/SKILL.md", "Alpha"),
      skill("beta", "/skills/beta/SKILL.md", "Beta"),
    ]);
    const editor = screen.getByRole("combobox", { name: "Message" });
    const editorElement = editor.element();
    if (!(editorElement instanceof HTMLElement)) {
      throw new Error("typeahead navigation requires an HTML editor");
    }
    await editor.fill("$");
    const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
    const alphaOption = listbox.getByRole("option", { name: /Alpha/ });
    const betaOption = listbox.getByRole("option", { name: /Beta/ });
    await expect.element(alphaOption).toHaveAttribute("aria-selected", "true");
    await expect.element(betaOption).toHaveAttribute("aria-selected", "false");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", alphaOption.element().id);

    const defaultPrevented = await pressSkillNavigationKey(
      editorElement,
      screen.user.keyboard,
      direction,
    );

    expect(defaultPrevented).toBe(true);
    await expect.element(editor).toHaveFocus();
    await expect.element(listbox).toBeVisible();
    await expect.element(alphaOption).toHaveAttribute("aria-selected", "false");
    await expect.element(betaOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", betaOption.element().id);
    expect(getController(controllerRef).getSnapshot().textContent).toBe("$");
    expect(screen.container.querySelector('[data-slot="chip"]')).toBeNull();
  },
);

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

test.each([
  {
    arrow: "ArrowRight",
    direction: "ltr",
    logicalExit: "after",
    logicalStart: "before",
    textAfter: " right",
    textBefore: "left ",
  },
  {
    arrow: "ArrowLeft",
    direction: "ltr",
    logicalExit: "before",
    logicalStart: "after",
    textAfter: " right",
    textBefore: "left ",
  },
  {
    arrow: "ArrowRight",
    direction: "rtl",
    logicalExit: "before",
    logicalStart: "after",
    textAfter: " שמאל",
    textBefore: "ימין ",
  },
  {
    arrow: "ArrowLeft",
    direction: "rtl",
    logicalExit: "after",
    logicalStart: "before",
    textAfter: " שמאל",
    textBefore: "ימין ",
  },
] as const)(
  "moves through skill tokens as two-step visual-direction caret stops",
  async ({ arrow, direction, logicalExit, logicalStart, textAfter, textBefore }) => {
    const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
    const selectedSkill = skill("atomic", "/skills/atomic/SKILL.md", "Atomic");
    const { controllerRef, screen } = await renderEditor([selectedSkill], { onSubmit });
    const editor = screen.getByRole("combobox", { name: "Message" });
    const initialText = `${textBefore}$ato${textAfter}`;

    await editor.fill(initialText);
    setCollapsedCaret(editor.element(), initialText, textBefore.length + "$ato".length);
    await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
    await screen.user.keyboard("{Enter}");

    const trigger = screen.getByRole("button", { name: /Atomic/i });
    const triggerElement = trigger.element();
    const chip = triggerElement.querySelector('[data-slot="chip"]');
    if (!(chip instanceof HTMLSpanElement)) {
      throw new Error("selected skill must render a HeroUI Chip");
    }
    const tokenHost = triggerElement.parentElement;
    if (!(tokenHost instanceof HTMLSpanElement)) {
      throw new Error("selected skill trigger must render inside its Lexical decorator host");
    }
    const tooltip = screen.getByRole("tooltip");
    const expectedText = `${textBefore}$Atomic${textAfter}`;
    const expectedCanonicalText = `${textBefore}$atomic${textAfter}`;
    const expectedSkillInput = {
      type: "skill" as const,
      name: selectedSkill.name,
      path: selectedSkill.path,
    };

    await expect
      .poll(() => getController(controllerRef).getSnapshot().textContent)
      .toBe(expectedText);
    expect(getComputedStyle(tokenHost).direction).toBe(direction);
    expect(getController(controllerRef).capture().input).toEqual([
      { type: "text", text: expectedCanonicalText, text_elements: [] },
      expectedSkillInput,
    ]);
    await expect.element(editor).toHaveFocus();
    await expect.element(chip).not.toHaveAttribute("data-selected");
    await expect.element(tooltip).not.toBeInTheDocument();

    setCollapsedCaretAtSkillSide(editor.element(), tokenHost, logicalStart);
    await expect
      .poll(() => collapsedCaretSideOfSkill(editor.element(), tokenHost))
      .toBe(logicalStart);
    await screen.user.keyboard(`{${arrow}}`);

    await expect.element(editor).toHaveFocus();
    await expect.element(chip).toHaveAttribute("data-selected");
    await expect.element(tooltip).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await screen.user.keyboard(`{${arrow}}`);

    await expect.element(editor).toHaveFocus();
    await expect.element(chip).not.toHaveAttribute("data-selected");
    await expect.element(tooltip).not.toBeInTheDocument();
    await expect
      .poll(() => collapsedCaretSideOfSkill(editor.element(), tokenHost))
      .toBe(logicalExit);
    expect(onSubmit).not.toHaveBeenCalled();

    await screen.user.keyboard("x");

    const textAfterInsertion =
      logicalExit === "before"
        ? `${textBefore}x$Atomic${textAfter}`
        : `${textBefore}$Atomicx${textAfter}`;
    const canonicalTextAfterInsertion =
      logicalExit === "before"
        ? `${textBefore}x$atomic${textAfter}`
        : `${textBefore}$atomicx${textAfter}`;
    await expect
      .poll(() => getController(controllerRef).getSnapshot().textContent)
      .toBe(textAfterInsertion);
    await expect.element(trigger).toBeInTheDocument();
    await expect.element(chip).not.toHaveAttribute("data-selected");
    await expect.element(tooltip).not.toBeInTheDocument();
    expect(getController(controllerRef).getSnapshot().selectedSkillPaths).toEqual([
      selectedSkill.path,
    ]);
    expect(getController(controllerRef).capture().input).toEqual([
      { type: "text", text: canonicalTextAfterInsertion, text_elements: [] },
      expectedSkillInput,
    ]);
    expect(onSubmit).not.toHaveBeenCalled();
  },
);

test("keeps the native caret hidden when a pointer click selects a skill token", async () => {
  const selectedSkill = skill("atomic", "/skills/atomic/SKILL.md", "Atomic");
  const { controllerRef, screen } = await renderEditor([selectedSkill]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  const initialText = "abc $ato def";

  await editor.fill(initialText);
  await editor.click();
  setCollapsedCaret(editor.element(), initialText, "abc $ato".length);
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Enter}");

  const trigger = screen.getByRole("button", { name: /Atomic/i });
  const chip = trigger.element().querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement)) {
    throw new Error("selected skill must render a HeroUI Chip");
  }
  const snapshotBeforeSelection = getController(controllerRef).getSnapshot();
  await expect.element(editor).toHaveFocus();
  await expect.element(chip).not.toHaveAttribute("data-selected");

  await trigger.click();

  await expect.element(editor).toHaveFocus();
  await expect.element(chip).toHaveAttribute("data-selected");
  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBeforeSelection);
  await expect.poll(() => collapsedCaretOffset(editor.element())).toBeNull();
});

test("vertically centers an inline skill chip with adjacent text", async () => {
  const selectedSkill = skill("alignment", "/skills/alignment/SKILL.md", "Alignment");
  const { screen } = await renderEditor([selectedSkill]);
  const editor = screen.getByRole("combobox", { name: "Message" });
  const initialText = "abc $ali def";

  await editor.fill(initialText);
  setCollapsedCaret(editor.element(), initialText, "abc $ali".length);
  await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
  await screen.user.keyboard("{Enter}");

  const trigger = screen.getByRole("button", { name: /Alignment/i });
  const triggerElement = trigger.element();
  const tokenHost = triggerElement.parentElement;
  const chip = triggerElement.querySelector('[data-slot="chip"]');
  if (!(tokenHost instanceof HTMLSpanElement) || !(chip instanceof HTMLSpanElement)) {
    throw new Error("selected skill must render as an inline HeroUI Chip");
  }

  const chipBounds = chip.getBoundingClientRect();
  const chipCenter = chipBounds.top + chipBounds.height / 2;
  const leftTextBounds = adjacentVisibleTextCharacterRect(tokenHost, "before");
  const rightTextBounds = adjacentVisibleTextCharacterRect(tokenHost, "after");
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

  const trigger = screen.getByRole("button", { name: /Friendly Review/i });
  await expect.element(trigger).toHaveAccessibleName(/^(?=.*Friendly Review)(?=.*details?).*$/i);
  await expect.element(trigger).toHaveAttribute("tabindex", "0");
  const triggerElement = trigger.element();
  expect(triggerElement.tagName).toBe("SPAN");
  const decoratorHost = triggerElement.parentElement;
  expect(decoratorHost?.tagName).toBe("SPAN");
  expect(decoratorHost?.getAttribute("contenteditable")).toBe("false");
  const chip = triggerElement.querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement))
    throw new Error("selected skill must render a HeroUI Chip");
  expect(chip.classList).toContain("chip--sm");
  expect(chip.classList).toContain("chip--secondary");
  expect(chip.querySelector('[data-slot="chip-label"]')?.textContent).toBe("$Friendly Review");
  expect(chip.querySelector("button")).toBeNull();
  expect(triggerElement.textContent).toBe("$Friendly Review");
  expect(triggerElement.outerHTML).not.toContain(selectedSkill.path);
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "$review", text_elements: [] },
    { type: "skill", name: selectedSkill.name, path: selectedSkill.path },
  ]);

  const editorBounds = editor.element().getBoundingClientRect();
  const triggerBounds = triggerElement.getBoundingClientRect();
  expect(triggerBounds.left).toBeGreaterThanOrEqual(editorBounds.left - 1);
  expect(triggerBounds.right).toBeLessThanOrEqual(editorBounds.right + 1);
  const bodyOverflow = getComputedStyle(document.body).overflow;
  const rootOverflow = getComputedStyle(document.documentElement).overflow;
  const documentScrollWidth = document.documentElement.scrollWidth;

  await userEvent.unhover(document.body);
  await userEvent.hover(trigger);
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

test("uses real keyboard focus traversal and Space/Backspace on the skill trigger", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const selectedSkill = skill(
    "keyboard-trigger",
    "/skills/keyboard-trigger/SKILL.md",
    "Keyboard Trigger",
  );
  const { controllerRef, screen } = await renderEditor([selectedSkill], { onSubmit });
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$keyboard");
  await screen.user.keyboard("{Enter}");

  const trigger = screen.getByRole("button", { name: /Keyboard Trigger/i });
  const chip = trigger.element().querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement))
    throw new Error("selected skill must render a HeroUI Chip");
  const tooltip = screen.getByRole("tooltip");
  const snapshotBeforeSelection = getController(controllerRef).getSnapshot();
  await expect.element(editor).toHaveFocus();
  await expect.element(chip).not.toHaveAttribute("data-selected");

  await screen.user.tab();
  await expect.element(trigger).toHaveFocus();
  await expect.element(tooltip).toBeVisible();
  await expect.element(chip).not.toHaveAttribute("data-selected");

  await screen.user.tab({ shift: true });
  await expect.element(editor).toHaveFocus();
  await expect.element(tooltip).not.toBeInTheDocument();
  await expect.element(chip).not.toHaveAttribute("data-selected");

  await screen.user.tab();
  await expect.element(trigger).toHaveFocus();
  await screen.user.keyboard(" ");
  await expect.element(editor).toHaveFocus();
  await expect.element(tooltip).not.toBeInTheDocument();
  await expect.element(chip).toHaveAttribute("data-selected");
  expect(onSubmit).not.toHaveBeenCalled();
  expect(getController(controllerRef).getSnapshot()).toEqual(snapshotBeforeSelection);

  await screen.user.tab();
  await expect.element(trigger).toHaveFocus();
  await expect.element(tooltip).toBeVisible();
  await screen.user.keyboard("{Backspace}");
  await expect.element(editor).toHaveFocus();
  await expect.element(trigger).not.toBeInTheDocument();
  await expect.element(tooltip).not.toBeInTheDocument();
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("");

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Keyboard Trigger");
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "$keyboard-trigger", text_elements: [] },
    {
      type: "skill",
      name: selectedSkill.name,
      path: selectedSkill.path,
    },
  ]);
});

test("uses the skill trigger to select, replace, delete, and restore one atomic token", async () => {
  const onSubmit = vi.fn<ComposerEditorProps["onSubmit"]>();
  const { controllerRef, screen } = await renderEditor(
    [skill("atomic-trigger", "/skills/atomic-trigger/SKILL.md", "Atomic Trigger")],
    { onSubmit },
  );
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$atomic");
  await screen.user.keyboard("{Enter}");
  let trigger = screen.getByRole("button", { name: /Atomic Trigger/i });
  trigger.element().focus();
  await expect.element(trigger).toHaveFocus();
  let tooltip = screen.getByRole("tooltip");
  await expect.element(tooltip).toBeVisible();
  await screen.user.keyboard("{Escape}");
  await expect.element(tooltip).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();

  editor.element().focus();
  await expect.element(editor).toHaveFocus();
  trigger.element().focus();
  tooltip = screen.getByRole("tooltip");
  await expect.element(tooltip).toBeVisible();

  await screen.user.keyboard("{Enter}");
  await expect.element(editor).toHaveFocus();
  await expect.element(tooltip).not.toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
  await screen.user.keyboard("replacement");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("replacement");
  expect(getController(controllerRef).capture().input).toEqual([
    { type: "text", text: "replacement", text_elements: [] },
  ]);

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().textContent)
    .toBe("$Atomic Trigger");
  trigger = screen.getByRole("button", { name: /Atomic Trigger/i });
  trigger.element().focus();
  await screen.user.keyboard("{Delete}");
  await expect.element(editor).toHaveFocus();
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
  const trigger = screen.getByRole("button", { name: /Friendly Skill/i });
  const triggerElement = trigger.element();
  const chip = triggerElement.querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement))
    throw new Error("selected skill must render a HeroUI Chip");

  await screen.rerender(renderForCatalog(invalidCatalog));
  await expect.element(triggerElement).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(triggerElement)
    .toHaveAccessibleName(/^(?=.*Friendly Skill)(?=.*Invalid skill)(?=.*details?).*$/i);
  expect(chip.classList).toContain("chip--danger");
  expect(chip.classList).toContain("chip--soft");
  expect(triggerElement.textContent).toBe("$Friendly Skill");
  expect(getController(controllerRef).getSnapshot().textContent).toBe("$Friendly Skill");
  expect(triggerElement.outerHTML).not.toContain(selectedSkill.path);
  await userEvent.unhover(document.body);
  await userEvent.hover(triggerElement);
  const invalidTooltip = screen.getByRole("tooltip");
  await expect.element(invalidTooltip, { timeout: 2_500 }).toHaveTextContent("Invalid skill");
  await expect.element(invalidTooltip).toHaveTextContent("missing-location");
  expect(invalidTooltip.element().textContent).not.toContain("/private/");
  expect(invalidTooltip.element().textContent).not.toContain("SKILL.md");
  await userEvent.unhover(document.body);
  await expect.element(invalidTooltip).not.toBeInTheDocument();

  await screen.rerender(renderForCatalog(readyCatalog));
  await expect.element(triggerElement).not.toHaveAttribute("aria-invalid");
  await expect.element(triggerElement).toHaveAccessibleName(/details?/i);
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
  await userEvent.hover(triggerElement);
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
    await expect.element(triggerElement).toHaveAttribute("aria-invalid", "true");
    await screen.rerender(renderForCatalog(skillCatalog));
    await expect.element(triggerElement).not.toHaveAttribute("aria-invalid");
    await expect.element(triggerElement).toHaveAccessibleName(/details?/i);
    expect(chip.classList).not.toContain("chip--danger");
  }

  await screen.rerender(renderForCatalog(readyCatalog, true));
  await expect.element(editor).toHaveAttribute("contenteditable", "false");
  await expect.element(triggerElement).toHaveAttribute("tabindex", "-1");
  await userEvent.hover(triggerElement);
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
    .element(screen.getByRole("button", { name: /Alpha Shared/i }))
    .toHaveAttribute("aria-invalid", "true");
  await expect
    .element(screen.getByRole("button", { name: /Beta Shared/i }))
    .toHaveAttribute("aria-invalid", "true");

  const expectPathDetails = async (
    triggerName: RegExp,
    expectedPath: string,
    tabCount: 1 | 2,
  ): Promise<void> => {
    editor.element().focus();
    await expect.element(editor).toHaveFocus();
    await expect.element(screen.getByRole("tooltip")).not.toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: triggerName });
    const chip = trigger.element().querySelector('[data-slot="chip"]');
    if (!(chip instanceof HTMLSpanElement))
      throw new Error("selected skill must render a HeroUI Chip");
    const wasSelected = chip.hasAttribute("data-selected");
    await expect.poll(() => chip.hasAttribute("data-selected")).toBe(wasSelected);
    await screen.user.tab();
    if (tabCount === 2) await screen.user.tab();
    await expect.element(trigger).toHaveFocus();
    await expect.poll(() => chip.hasAttribute("data-selected")).toBe(wasSelected);
    const pathParagraph = screen.getByText(expectedPath, { exact: true });
    await expect.element(pathParagraph).toBeVisible();
    expect(pathParagraph.element().tagName).toBe("P");
    const tooltip = pathParagraph.element().closest('[role="tooltip"]');
    if (!(tooltip instanceof HTMLElement))
      throw new Error("selected skill path must render inside a Tooltip");
    expect(tooltip.textContent).not.toContain("/private/");
    expect(tooltip.textContent).not.toContain("SKILL.md");
    editor.element().focus();
    await expect.element(editor).toHaveFocus();
    await expect.element(pathParagraph).not.toBeInTheDocument();
    await expect.element(tooltip).not.toBeInTheDocument();
    await expect.poll(() => chip.hasAttribute("data-selected")).toBe(wasSelected);
  };

  await expectPathDetails(/Alpha Shared/i, "alpha/shared", 1);
  await expectPathDetails(/Beta Shared/i, "beta/shared", 2);

  const siblingTrigger = screen.getByRole("button", { name: /Beta Shared/i });
  await siblingTrigger.click();
  await screen.user.keyboard("{Backspace}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(/Alpha Shared/i, "shared", 1);

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual(selectedPaths);
  await expectPathDetails(/Alpha Shared/i, "alpha/shared", 1);
  await expectPathDetails(/Beta Shared/i, "beta/shared", 2);

  dispatchHistoryShortcut(editor.element(), "redo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(/Alpha Shared/i, "shared", 1);

  expect(getController(controllerRef).restore(collidingDraft)).toEqual({ type: "restored" });
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual(selectedPaths);
  await expectPathDetails(/Alpha Shared/i, "alpha/shared", 1);
  await expectPathDetails(/Beta Shared/i, "beta/shared", 2);

  expect(getController(controllerRef).restore(singleDraft)).toEqual({ type: "restored" });
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(/Alpha Shared/i, "shared", 1);
});

type NavigationPoint = Readonly<{ node: Node; offset: number }>;
type NavigationPointKind = "line-end" | "line-start" | "ordinary" | "whitespace";

type NativeTargetCase = Readonly<{
  direction: SkillNavigationDirection;
  layout: SkillNavigationLayout;
  pointKind?: NavigationPointKind;
  target: "chip" | "outside";
  textDirection: "ltr" | "rtl";
}>;

type NavigationEntryCase = NativeTargetCase & Readonly<{ resizeWidth?: string }>;

type NavigationPointAddress = Readonly<{ offset: number; path: readonly number[] }>;
type OutsideNavigationControl = Readonly<{
  start: NavigationPointAddress;
  target: NavigationPointAddress;
}>;

async function renderSkillNavigationFixture(
  layout: SkillNavigationLayout,
  textDirection: "ltr" | "rtl",
  {
    onSubmit = () => undefined,
    width,
  }: Readonly<{
    onSubmit?: ComposerEditorProps["onSubmit"];
    width?: string;
  }> = {},
) {
  const candidates = [
    skill("alpha", "/skills/alpha/SKILL.md", "Alpha"),
    skill("beta", "/skills/beta/SKILL.md", "Beta"),
    skill(
      "extraordinarily-long-skill",
      "/skills/extraordinarily-long-skill/SKILL.md",
      "Extraordinarily long skill chip",
    ),
  ];
  const { controllerRef, screen } = await renderEditor(candidates, { onSubmit });
  const editor = screen.getByRole("combobox", { name: "Message" });
  const editorElement = editor.element();
  if (!(editorElement instanceof HTMLElement)) {
    throw new Error("navigation fixture requires an HTML editor");
  }
  const shell = editorElement.closest(".w-96");
  if (!(shell instanceof HTMLElement)) throw new Error("navigation fixture requires its shell");
  shell.style.width =
    width ?? (layout === "narrow" ? (textDirection === "rtl" ? "15rem" : "14rem") : "22rem");
  editorElement.dir = textDirection;

  const initialText = (() => {
    switch (layout) {
      case "double":
        return "left $al$be right";
      case "explicit":
        return "outside upper first\noutside upper second\n开始调研\n$al\naab\noutside lower first\noutside lower second";
      case "inline":
        return textDirection === "rtl"
          ? "מילים רגילות מימין $al מילים רגילות משמאל"
          : "left words $al right words";
      case "narrow":
        return textDirection === "rtl"
          ? "מילים רגילות ארוכות שממלאות את השורה החזותית הראשונה לפני $extra מילים רגילות נוספות שממשיכות ונשברות לשורה נוספת"
          : "prefix words $extra suffix words";
      case "only":
        return "$al";
      case "soft-wrap":
        return textDirection === "rtl"
          ? "מילים רגילות ארוכות שממלאות את השורה החזותית הראשונה לפני $al מילים רגילות נוספות שממשיכות ונשברות לשורה נוספת"
          : "ordinary leading words that fill the first visual line before $al ordinary trailing words that wrap again";
      default:
        throw new Error(`unsupported navigation fixture layout: ${String(layout)}`);
    }
  })();
  await editor.fill(initialText);
  const queries =
    layout === "double"
      ? (["$al", "$be"] as const)
      : ([layout === "narrow" ? "$extra" : "$al"] as const);
  for (const query of queries) {
    await setPublicCaretAtText(editorElement, query, query.length);
    await expect.element(screen.getByRole("listbox", { name: "Typeahead menu" })).toBeVisible();
    await screen.user.keyboard("{Enter}");
  }
  await nextNavigationFrame();

  const triggers = Array.from(editorElement.querySelectorAll<HTMLElement>('[role="button"]'));
  const tokenHosts = triggers.map((trigger) => {
    const host = trigger.parentElement;
    if (!(host instanceof HTMLSpanElement) || host.getAttribute("contenteditable") !== "false") {
      throw new Error("navigation fixture requires Lexical skill hosts");
    }
    const parentBlock = host.parentElement;
    if (!(parentBlock instanceof HTMLElement)) {
      throw new Error("navigation fixture requires each skill host parent block");
    }
    parentBlock.style.direction = textDirection;
    if (getComputedStyle(host).direction !== textDirection) {
      throw new Error("navigation fixture did not apply the requested visual direction");
    }
    return host;
  });
  const chips = triggers.map((trigger) => {
    const chip = trigger.querySelector('[data-slot="chip"]');
    if (!(chip instanceof HTMLSpanElement)) {
      throw new Error("navigation fixture requires HeroUI skill chips");
    }
    return chip;
  });
  if (tokenHosts.length !== (layout === "double" ? 2 : 1)) {
    throw new Error("navigation fixture did not insert the expected skills");
  }
  editorElement.focus({ preventScroll: true });
  return { chips, controllerRef, editor: editorElement, screen, shell, tokenHosts, triggers };
}

async function setPublicCaretAtText(
  root: HTMLElement,
  needle: string,
  offsetInNeedle: number,
): Promise<void> {
  await setPublicCaret(root, navigationTextPoint(root, needle, offsetInNeedle));
}

function navigationTextPoint(
  root: HTMLElement,
  needle: string,
  offsetInNeedle: number,
): NavigationPoint {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node instanceof Text) {
    if (node.parentElement?.closest('[contenteditable="false"]') == null) {
      const start = node.data.indexOf(needle);
      if (start >= 0) {
        return { node, offset: start + offsetInNeedle };
      }
    }
    node = walker.nextNode();
  }
  throw new Error(`navigation fixture text not found: ${needle}`);
}

async function setPublicCaret(root: HTMLElement, point: NavigationPoint): Promise<void> {
  const selection = root.ownerDocument.getSelection();
  if (selection == null) throw new Error("navigation fixture requires a DOM Selection");
  root.focus({ preventScroll: true });
  const range = root.ownerDocument.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  await nextNavigationFrame();
  const current = readDomSelectionPoint(root);
  expect(current.node).toBe(point.node);
  expect(current.offset).toBe(point.offset);
}

function findSkillNavigationStart(
  root: HTMLElement,
  layout: SkillNavigationLayout,
  direction: SkillNavigationDirection,
  target: "chip" | "outside",
  textDirection: "ltr" | "rtl",
): NavigationPoint {
  if (target === "chip") {
    if (layout === "explicit") {
      return direction === "ArrowDown"
        ? navigationTextPoint(root, "开始调研", 1)
        : navigationTextPoint(root, "aab", 1);
    }
    if (layout === "inline") {
      const startsBeforeChip = (direction === "ArrowRight") === (textDirection === "ltr");
      const leading = textDirection === "ltr" ? "left words " : "מילים רגילות מימין ";
      const trailing = textDirection === "ltr" ? " right words" : " מילים רגילות משמאל";
      return startsBeforeChip
        ? navigationTextPoint(root, leading, leading.length)
        : navigationTextPoint(root, trailing, 0);
    }
    throw new Error("wrapped skill entry requires a native-control start address");
  }
  throw new Error("outside navigation requires an independent control start address");
}

function caretRect(point: NavigationPoint): DOMRect {
  const document = point.node.ownerDocument;
  if (document == null) throw new Error("navigation point requires an owner document");
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  const collapsed = range.getBoundingClientRect();
  if (collapsed.height > 0) return collapsed;
  if (!(point.node instanceof Text) || point.node.length === 0) return collapsed;
  const direction = getComputedStyle(point.node.parentElement ?? document.body).direction;
  if (point.offset < point.node.length) {
    range.setEnd(point.node, point.offset + 1);
    const character = range.getBoundingClientRect();
    return new DOMRect(
      direction === "rtl" ? character.right : character.left,
      character.top,
      0,
      character.height,
    );
  }
  range.setStart(point.node, point.offset - 1);
  const character = range.getBoundingClientRect();
  return new DOMRect(
    direction === "rtl" ? character.left : character.right,
    character.top,
    0,
    character.height,
  );
}

function isUsableNavigationRect(rect: DOMRect): boolean {
  return (
    rect.height > 0 &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.right) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom)
  );
}

function caretPointFromCoordinates(
  root: HTMLElement,
  x: number,
  y: number,
): NavigationPoint | null {
  const position = root.ownerDocument.caretPositionFromPoint(x, y);
  if (position == null || !root.contains(position.offsetNode)) return null;
  return { node: position.offsetNode, offset: position.offset };
}

function pointTouchesSkillHost(point: NavigationPoint, host: HTMLElement): boolean {
  if (host.contains(point.node)) return true;
  const parent = host.parentNode;
  if (parent == null || point.node !== parent) return false;
  const hostIndex = Array.from(parent.childNodes).indexOf(host);
  return point.offset === hostIndex || point.offset === hostIndex + 1;
}

function rangeBetweenNavigationPoints(
  document: Document,
  start: NavigationPoint,
  target: NavigationPoint,
): Range {
  const startRange = document.createRange();
  startRange.setStart(start.node, start.offset);
  startRange.collapse(true);
  const targetRange = document.createRange();
  targetRange.setStart(target.node, target.offset);
  targetRange.collapse(true);
  const range = document.createRange();
  if (startRange.compareBoundaryPoints(Range.START_TO_START, targetRange) <= 0) {
    range.setStart(start.node, start.offset);
    range.setEnd(target.node, target.offset);
  } else {
    range.setStart(target.node, target.offset);
    range.setEnd(start.node, start.offset);
  }
  return range;
}

function nativePathTargetsSkill(
  root: HTMLElement,
  host: HTMLElement,
  start: DOMRect,
  startPoint: NavigationPoint,
  targetPoint: NavigationPoint,
  target: DOMRect,
  direction: SkillNavigationDirection,
): boolean {
  if (pointTouchesSkillHost(targetPoint, host)) return true;
  if (direction === "ArrowLeft" || direction === "ArrowRight") {
    const range = rangeBetweenNavigationPoints(root.ownerDocument, startPoint, targetPoint);
    if (!range.collapsed && range.intersectsNode(host)) return true;
  }
  const skill = host.getBoundingClientRect();
  const hit = caretPointFromCoordinates(
    root,
    direction === "ArrowUp" || direction === "ArrowDown"
      ? start.left
      : direction === "ArrowLeft"
        ? skill.right
        : skill.left,
    direction === "ArrowLeft" || direction === "ArrowRight"
      ? start.top + start.height / 2
      : direction === "ArrowUp"
        ? skill.bottom
        : skill.top,
  );
  if (hit == null || !pointTouchesSkillHost(hit, host)) return false;
  switch (direction) {
    case "ArrowLeft":
      return start.left >= skill.right && target.left <= skill.right;
    case "ArrowRight":
      return start.right <= skill.left && target.right >= skill.left;
    case "ArrowUp":
      return start.top >= skill.bottom && target.top <= skill.bottom;
    case "ArrowDown":
      return start.bottom <= skill.top && target.bottom >= skill.top;
  }
}

function nativePathIsClearlyOutsideSkill(start: DOMRect, target: DOMRect, skill: DOMRect): boolean {
  return (
    (start.right <= skill.left && target.right <= skill.left) ||
    (start.left >= skill.right && target.left >= skill.right) ||
    (start.bottom <= skill.top && target.bottom <= skill.top) ||
    (start.top >= skill.bottom && target.top >= skill.bottom)
  );
}

function readDomSelectionPoint(root: HTMLElement): Readonly<{
  node: Node | null;
  offset: number;
}> {
  const selection = root.ownerDocument.getSelection();
  if (
    selection == null ||
    !selection.isCollapsed ||
    selection.anchorNode == null ||
    !root.contains(selection.anchorNode)
  ) {
    return { node: null, offset: 0 };
  }
  return { node: selection.anchorNode, offset: selection.anchorOffset };
}

function readNavigationPointAddress(
  root: HTMLElement,
  point: Readonly<{ node: Node | null; offset: number }>,
): NavigationPointAddress {
  if (point.node == null || !root.contains(point.node)) {
    throw new Error("navigation target must remain inside the editor");
  }
  const path: number[] = [];
  let node = point.node;
  while (node !== root) {
    const parent = node.parentNode;
    if (parent == null) throw new Error("navigation target must have an editor-relative path");
    let index = -1;
    for (let childIndex = 0; childIndex < parent.childNodes.length; childIndex += 1) {
      if (parent.childNodes.item(childIndex) === node) {
        index = childIndex;
        break;
      }
    }
    if (index < 0) throw new Error("navigation target path must contain each child");
    path.unshift(index);
    node = parent;
  }
  return { offset: point.offset, path };
}

function resolveNavigationPointAddress(
  root: HTMLElement,
  address: NavigationPointAddress,
): NavigationPoint {
  let node: Node = root;
  for (const index of address.path) {
    if (index < 0 || index >= node.childNodes.length)
      throw new Error("navigation start address must resolve in the rebuilt editor");
    node = node.childNodes.item(index);
  }
  return { node, offset: address.offset };
}

async function findNativeSkillEntryStartAddress(
  root: HTMLElement,
  host: HTMLElement,
  layout: "narrow" | "soft-wrap",
  direction: "ArrowDown" | "ArrowUp",
  textDirection: "ltr" | "rtl",
): Promise<NavigationPointAddress> {
  const sourceText =
    layout === "narrow"
      ? direction === "ArrowDown"
        ? "prefix words "
        : " מילים רגילות נוספות שממשיכות ונשברות לשורה נוספת"
      : direction === "ArrowDown"
        ? textDirection === "ltr"
          ? "ordinary leading words that fill the first visual line before "
          : "מילים רגילות ארוכות שממלאות את השורה החזותית הראשונה לפני "
        : textDirection === "ltr"
          ? " ordinary trailing words that wrap again"
          : " מילים רגילות נוספות שממשיכות ונשברות לשורה נוספת";
  const sourceStart = navigationTextPoint(root, sourceText, 0);
  if (!(sourceStart.node instanceof Text)) {
    throw new Error("native skill entry source must be editable text");
  }
  for (let offset = 0; offset <= sourceText.length; offset += 1) {
    const point = { node: sourceStart.node, offset: sourceStart.offset + offset };
    await setPublicCaret(root, point);
    const startRect = caretRect(point);
    const startAddress = readNavigationPointAddress(root, point);
    applyNativeSelectionModify(root, direction);
    const target = readDomSelectionPoint(root);
    if (target.node == null) continue;
    const targetRect = caretRect({ node: target.node, offset: target.offset });
    if (
      nativePathTargetsSkill(
        root,
        host,
        startRect,
        point,
        { node: target.node, offset: target.offset },
        targetRect,
        direction,
      )
    ) {
      return startAddress;
    }
  }
  throw new Error(`native control found no ${layout} ${textDirection} ${direction} skill stop`);
}

async function readNativeSkillEntryStartAddress({
  direction,
  layout,
  resizeWidth,
  textDirection,
}: NavigationEntryCase): Promise<NavigationPointAddress> {
  if (
    (layout !== "narrow" && layout !== "soft-wrap") ||
    (direction !== "ArrowDown" && direction !== "ArrowUp")
  ) {
    throw new Error("native start discovery only supports vertical wrapped skill cases");
  }
  const fixture = await renderSkillNavigationFixture(layout, textDirection);
  if (resizeWidth != null) {
    fixture.shell.style.width = resizeWidth;
    await nextNavigationFrame();
  }
  const host = fixture.tokenHosts[0];
  if (host == null) throw new Error("native start discovery requires one skill host");
  const address = await findNativeSkillEntryStartAddress(
    fixture.editor,
    host,
    layout,
    direction,
    textDirection,
  );
  await fixture.screen.unmount();
  return address;
}

function readSkillVisualEdgeAddress(
  root: HTMLElement,
  host: HTMLElement,
  edge: "left" | "right",
): NavigationPointAddress {
  const hostRect = host.getBoundingClientRect();
  const hostRange = root.ownerDocument.createRange();
  hostRange.selectNode(host);
  const rangeRect = hostRange.getBoundingClientRect();
  expect(hostRect.width).toBeGreaterThan(0);
  expect(hostRect.height).toBeGreaterThan(0);
  expect(rangeRect.width).toBeGreaterThan(0);
  expect(rangeRect.height).toBeGreaterThan(0);
  expect(
    rangeRect.left < hostRect.right &&
      rangeRect.right > hostRect.left &&
      rangeRect.top < hostRect.bottom &&
      rangeRect.bottom > hostRect.top,
  ).toBe(true);

  const parent = host.parentNode;
  if (!(parent instanceof HTMLElement)) {
    throw new Error("skill visual edge requires an HTML parent");
  }
  const hostIndex = Array.from(parent.childNodes).indexOf(host);
  if (hostIndex < 0) throw new Error("skill visual edge requires a mounted host");
  const direction = getComputedStyle(parent).direction;
  if (direction !== "ltr" && direction !== "rtl") {
    throw new Error(`skill visual edge requires ltr or rtl, received ${direction}`);
  }
  const isLogicalBefore = (edge === "left") === (direction === "ltr");
  return readNavigationPointAddress(root, {
    node: parent,
    offset: hostIndex + (isLogicalBefore ? 0 : 1),
  });
}

function outsideNavigationSource({
  direction,
  layout,
  pointKind,
  textDirection,
}: NavigationEntryCase): Readonly<{
  pointKind: NavigationPointKind;
  targetText?: string;
  text: string;
}> {
  if (pointKind == null) throw new Error("outside navigation requires a declared point kind");
  if (layout === "explicit") {
    return direction === "ArrowUp"
      ? { pointKind, targetText: "outside lower first", text: "outside lower second" }
      : { pointKind, targetText: "outside upper second", text: "outside upper first" };
  }
  const text =
    layout === "soft-wrap"
      ? textDirection === "ltr"
        ? "ordinary leading words that fill the first visual line before "
        : "מילים רגילות ארוכות שממלאות את השורה החזותית הראשונה לפני "
      : textDirection === "ltr"
        ? "left words"
        : "מילים רגילות מימין";
  return { pointKind, text };
}

function outsideOffsetMatchesKind(
  text: string,
  offset: number,
  kind: NavigationPointKind,
): boolean {
  const before = text[offset - 1] ?? "";
  const after = text[offset] ?? "";
  switch (kind) {
    case "line-start":
      return offset === 0;
    case "line-end":
      return offset === text.length;
    case "ordinary":
      return /\S/u.test(before) && /\S/u.test(after);
    case "whitespace":
      return /\s/u.test(before) || /\s/u.test(after);
  }
}

function pointFallsWithinNavigationText(
  root: HTMLElement,
  point: NavigationPoint,
  text: string,
): boolean {
  const start = navigationTextPoint(root, text, 0);
  const end = navigationTextPoint(root, text, text.length);
  const pointRange = root.ownerDocument.createRange();
  pointRange.setStart(point.node, point.offset);
  pointRange.collapse(true);
  const startRange = root.ownerDocument.createRange();
  startRange.setStart(start.node, start.offset);
  startRange.collapse(true);
  const endRange = root.ownerDocument.createRange();
  endRange.setStart(end.node, end.offset);
  endRange.collapse(true);
  return (
    pointRange.compareBoundaryPoints(Range.START_TO_START, startRange) >= 0 &&
    pointRange.compareBoundaryPoints(Range.START_TO_START, endRange) <= 0
  );
}

async function discoverOutsideNavigationStart(
  fixture: Awaited<ReturnType<typeof renderSkillNavigationFixture>>,
  navigationCase: NavigationEntryCase,
): Promise<NavigationPointAddress> {
  const { direction } = navigationCase;
  const { pointKind, targetText, text } = outsideNavigationSource(navigationCase);
  const sourceStart = navigationTextPoint(fixture.editor, text, 0);
  if (!(sourceStart.node instanceof Text)) {
    throw new Error("outside navigation source must be editable text");
  }
  const skillHost = fixture.tokenHosts[0];
  if (skillHost == null) throw new Error("outside navigation requires one skill host");
  for (let offset = 0; offset <= text.length; offset += 1) {
    if (!outsideOffsetMatchesKind(text, offset, pointKind)) continue;
    const point = { node: sourceStart.node, offset: sourceStart.offset + offset };
    await setPublicCaret(fixture.editor, point);
    const startRect = caretRect(point);
    const startAddress = readNavigationPointAddress(fixture.editor, point);
    applyNativeSelectionModify(fixture.editor, direction);
    const target = readDomSelectionPoint(fixture.editor);
    if (
      target.node == null ||
      fixture.tokenHosts.some((host) => host.contains(target.node)) ||
      (target.node === point.node && target.offset === point.offset) ||
      (targetText != null &&
        !pointFallsWithinNavigationText(
          fixture.editor,
          { node: target.node, offset: target.offset },
          targetText,
        ))
    ) {
      continue;
    }
    const targetRect = caretRect({ node: target.node, offset: target.offset });
    if (nativePathIsClearlyOutsideSkill(startRect, targetRect, skillHost.getBoundingClientRect())) {
      return startAddress;
    }
  }
  throw new Error(
    `native control found no ${navigationCase.layout} ${navigationCase.textDirection} ${direction} outside stop`,
  );
}

async function readOutsideNavigationControl(
  navigationCase: NavigationEntryCase,
): Promise<OutsideNavigationControl> {
  const discovery = await renderSkillNavigationFixture(
    navigationCase.layout,
    navigationCase.textDirection,
  );
  if (navigationCase.resizeWidth != null) {
    discovery.shell.style.width = navigationCase.resizeWidth;
    await nextNavigationFrame();
  }
  const start = await discoverOutsideNavigationStart(discovery, navigationCase);
  await discovery.screen.unmount();

  const control = await renderSkillNavigationFixture(
    navigationCase.layout,
    navigationCase.textDirection,
  );
  const { direction, resizeWidth } = navigationCase;
  if (resizeWidth != null) {
    control.shell.style.width = resizeWidth;
    await nextNavigationFrame();
  }
  const point = resolveNavigationPointAddress(control.editor, start);
  await setPublicCaret(control.editor, point);
  const startRect = caretRect(point);
  applyNativeSelectionModify(control.editor, direction);
  const targetPoint = readDomSelectionPoint(control.editor);
  const skillHost = control.tokenHosts[0];
  if (
    targetPoint.node == null ||
    skillHost == null ||
    control.tokenHosts.some((host) => host.contains(targetPoint.node))
  ) {
    throw new Error("outside control target must remain outside every skill label");
  }
  const targetRect = caretRect({ node: targetPoint.node, offset: targetPoint.offset });
  const { targetText } = outsideNavigationSource(navigationCase);
  if (
    targetText != null &&
    !pointFallsWithinNavigationText(
      control.editor,
      { node: targetPoint.node, offset: targetPoint.offset },
      targetText,
    )
  ) {
    throw new Error("outside control target must land on its declared adjacent line");
  }
  if (!nativePathIsClearlyOutsideSkill(startRect, targetRect, skillHost.getBoundingClientRect())) {
    throw new Error("outside control path must remain entirely on one side of the skill rect");
  }
  const target = readNavigationPointAddress(control.editor, targetPoint);
  await control.screen.unmount();
  return { start, target };
}

async function readUnownedBoundaryTarget(
  direction: SkillNavigationDirection,
  textDirection: "ltr" | "rtl",
): Promise<NavigationPointAddress> {
  const fixture = await renderSkillNavigationFixture("explicit", textDirection);
  const targetHost = fixture.tokenHosts[0];
  if (targetHost == null) throw new Error("boundary control requires one skill host");
  await setPublicSkillBoundary(
    fixture.editor,
    targetHost,
    expectedVisualBoundary(direction, textDirection),
  );
  applyNativeSelectionModify(fixture.editor, direction);
  const address = readNavigationPointAddress(fixture.editor, readDomSelectionPoint(fixture.editor));
  await fixture.screen.unmount();
  return address;
}

function readNavigationScroll(root: HTMLElement) {
  const view = root.ownerDocument.defaultView;
  const outer = root.closest(".w-96");
  if (!(outer instanceof HTMLElement)) {
    throw new Error("navigation fixture requires an outer scroll container");
  }
  return {
    editorLeft: root.scrollLeft,
    editorTop: root.scrollTop,
    outerLeft: outer.scrollLeft,
    outerTop: outer.scrollTop,
    windowX: view?.scrollX ?? 0,
    windowY: view?.scrollY ?? 0,
  };
}

function readComposerNavigationState(ref: RefObject<ComposerEditorController | null>) {
  return getController(ref).capture();
}

async function pressSkillNavigationKey(
  editor: HTMLElement,
  keyboard: (text: string) => Promise<void>,
  direction: SkillNavigationDirection,
): Promise<boolean> {
  let observedEvent: KeyboardEvent | undefined;
  const observe = (event: KeyboardEvent): void => {
    if (event.key === direction) observedEvent = event;
  };
  editor.addEventListener("keydown", observe, true);
  try {
    await keyboard(`{${direction}}`);
    await nextNavigationFrame();
  } finally {
    editor.removeEventListener("keydown", observe, true);
  }
  return observedEvent?.defaultPrevented ?? false;
}

function dispatchModifiedSkillNavigationKey(
  editor: HTMLElement,
  direction: SkillNavigationDirection,
  modifier: "Alt" | "Control" | "Meta" | "Shift",
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    altKey: modifier === "Alt",
    bubbles: true,
    cancelable: true,
    ctrlKey: modifier === "Control",
    key: direction,
    metaKey: modifier === "Meta",
    shiftKey: modifier === "Shift",
  });
  editor.dispatchEvent(event);
  return event;
}

function dispatchSkillNavigationKey(
  editor: HTMLElement,
  direction: SkillNavigationDirection,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: direction,
  });
  editor.dispatchEvent(event);
  return event;
}

function expectedVisualBoundary(
  direction: SkillNavigationDirection,
  textDirection: "ltr" | "rtl",
): SkillCaretSide {
  const visualLeft = direction === "ArrowLeft" || direction === "ArrowUp";
  return visualLeft === (textDirection === "ltr") ? "before" : "after";
}

function readSkillBoundary(root: HTMLElement, tokenHost: HTMLElement): SkillCaretSide | null {
  const point = readDomSelectionPoint(root);
  const parent = tokenHost.parentNode;
  if (parent == null) return null;
  const hostIndex = Array.from(parent.childNodes).indexOf(tokenHost);
  if (point.node === parent) {
    if (point.offset === hostIndex) return "before";
    if (point.offset === hostIndex + 1) return "after";
    return null;
  }
  const previousSibling = tokenHost.previousSibling;
  if (previousSibling != null) {
    const beforeText = findAdjacentText(previousSibling, "before");
    if (point.node === beforeText && point.offset === beforeText.length) return "before";
  }
  const nextSibling = tokenHost.nextSibling;
  if (nextSibling != null) {
    const afterText = findAdjacentText(nextSibling, "after");
    if (point.node === afterText && point.offset === 0) return "after";
  }
  return null;
}

async function setPublicSkillBoundary(
  root: HTMLElement,
  tokenHost: HTMLElement,
  side: SkillCaretSide,
): Promise<void> {
  const parent = tokenHost.parentNode;
  if (!(parent instanceof Element)) throw new Error("skill boundary requires an element parent");
  const hostIndex = Array.from(parent.childNodes).indexOf(tokenHost);
  await setPublicCaret(root, {
    node: parent,
    offset: side === "before" ? hostIndex : hostIndex + 1,
  });
}

function selectionIsInsideSkillLabel(
  root: HTMLElement,
  tokenHosts: readonly HTMLElement[],
): boolean {
  const point = readDomSelectionPoint(root);
  return point.node != null && tokenHosts.some((host) => host.contains(point.node));
}

async function nextNavigationFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

function applyNativeSelectionModify(root: HTMLElement, direction: SkillNavigationDirection): void {
  const selection = root.ownerDocument.getSelection();
  if (selection == null) throw new Error("native navigation requires a DOM Selection");
  selection.modify(
    "move",
    direction === "ArrowLeft"
      ? "left"
      : direction === "ArrowRight"
        ? "right"
        : direction === "ArrowUp"
          ? "backward"
          : "forward",
    direction === "ArrowLeft" || direction === "ArrowRight" ? "character" : "line",
  );
}

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

function setCollapsedCaretAtSkillSide(
  root: Element,
  tokenHost: HTMLElement,
  side: SkillCaretSide,
): void {
  const adjacentNode = side === "before" ? tokenHost.previousSibling : tokenHost.nextSibling;
  const adjacentText = findAdjacentText(adjacentNode, side);
  const selection = root.ownerDocument.getSelection();
  if (selection == null) {
    throw new Error("composer editor document must provide a Selection");
  }
  const range = root.ownerDocument.createRange();
  range.setStart(adjacentText, side === "before" ? adjacentText.length : 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  root.ownerDocument.dispatchEvent(new Event("selectionchange"));
}

function collapsedCaretSideOfSkill(root: Element, tokenHost: HTMLElement): SkillCaretSide | null {
  const selection = root.ownerDocument.getSelection();
  if (
    selection == null ||
    !selection.isCollapsed ||
    selection.anchorNode == null ||
    !root.contains(selection.anchorNode)
  ) {
    return null;
  }

  const parent = tokenHost.parentNode;
  if (parent != null && selection.anchorNode === parent) {
    const hostIndex = Array.from(parent.childNodes).indexOf(tokenHost);
    if (hostIndex >= 0 && selection.anchorOffset === hostIndex) return "before";
    if (hostIndex >= 0 && selection.anchorOffset === hostIndex + 1) return "after";
  }

  const beforeText = findAdjacentText(tokenHost.previousSibling, "before");
  if (selection.anchorNode === beforeText && selection.anchorOffset === beforeText.length) {
    return "before";
  }
  const afterText = findAdjacentText(tokenHost.nextSibling, "after");
  if (selection.anchorNode === afterText && selection.anchorOffset === 0) {
    return "after";
  }
  return null;
}

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
