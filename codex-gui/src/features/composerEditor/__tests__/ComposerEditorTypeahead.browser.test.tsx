import { createRef, useState, type CSSProperties, type RefObject } from "react";
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
    const scrollRegions = listbox.element().querySelectorAll("[data-skill-menu-scroll-region]");
    expect(scrollRegions).toHaveLength(1);
    const scrollRegion = scrollRegions.item(0);
    const styledListboxes = listbox.element().querySelectorAll('[data-slot="list-box"]');
    expect(styledListboxes).toHaveLength(1);
    const styledListbox = styledListboxes.item(0);
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
