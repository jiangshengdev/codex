import { createRef, useState, type CSSProperties, type RefObject } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";

import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";
import { renderWithProviders } from "@/utils/test-utils";

import { ComposerEditor, type ComposerEditorController } from "../ComposerEditor";
import {
  catalog,
  ComposerEditorFixture,
  getController,
  renderEditor,
  skill,
} from "./composerEditorBrowserTestSupport";

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
  expect(screen.container.querySelectorAll('[role="listbox"]')).toHaveLength(1);
  expect(listbox.element().querySelector('[role="group"], [role="separator"]')).toBeNull();
  await expect.element(editor).toHaveAttribute("aria-activedescendant", activeOption.element().id);
  await expect.element(activeOption).toHaveAttribute("aria-selected", "true");
  await expect.element(editor).toHaveFocus();
  expect(getController(controllerRef).getRootElement()).toBe(editor.element());
});

test("scrolls candidates without moving the surrounding editor and closes on Escape", async () => {
  const candidates = Array.from({ length: 20 }, (_, index) =>
    skill(`skill-${String(index).padStart(2, "0")}`, `/skills/${String(index)}`),
  );
  const { screen } = await renderEditor(candidates);
  const editor = screen.getByRole("combobox", { name: "Message" });

  await editor.fill("$");

  const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(listbox.getByRole("option", { name: /skill-00/ })).toBeVisible();
  const scrollRegion = listbox.element().querySelector("[data-skill-menu-scroll-region]");
  if (!(scrollRegion instanceof HTMLElement)) {
    throw new Error("skill menu must expose its candidate scroll region");
  }
  const editorBounds = editor.element().getBoundingClientRect();
  const outerScrollTop = document.scrollingElement?.scrollTop;
  await expect.poll(() => scrollRegion.scrollHeight > scrollRegion.clientHeight).toBe(true);
  scrollRegion.scrollTop = scrollRegion.scrollHeight;
  await expect.poll(() => scrollRegion.scrollTop).toBeGreaterThan(0);
  await expect.element(listbox.getByRole("option").last()).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => optionIsUnobstructed(listbox.getByRole("option").last().element()))
    .toBe(true);
  expect(document.scrollingElement?.scrollTop).toBe(outerScrollTop);
  expect(editor.element().getBoundingClientRect().top).toBe(editorBounds.top);
  scrollRegion.scrollTop = 0;
  await expect.element(listbox.getByRole("option").first()).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() => optionIsUnobstructed(listbox.getByRole("option").first().element()))
    .toBe(true);

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
    if (!(scrollRegion instanceof HTMLElement)) {
      throw new Error("skill menu must expose its candidate scroll region");
    }
    const banner = bannerText == null ? null : screen.getByText(bannerText, { exact: true });
    const bannerIsVisible = (): boolean => banner == null || banner.element().checkVisibility();
    await expect.poll(() => listbox.getByRole("status").length).toBe(banner == null ? 0 : 1);
    await expect.poll(bannerIsVisible).toBe(true);

    await expect.element(firstOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", firstOption.element().id);
    await expect.element(editor).toHaveFocus();
    await expect.poll(() => scrollRegion.scrollHeight > scrollRegion.clientHeight).toBe(true);
    expect(scrollRegion.scrollTop).toBe(0);

    await screen.user.keyboard("{ArrowUp}");

    await expect.element(lastOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", lastOption.element().id);
    await expect.element(lastOption).toBeInViewport({ ratio: 1 });
    await expect.poll(() => optionIsUnobstructed(lastOption.element())).toBe(true);
    await expect.element(editor).toHaveFocus();
    await expect.poll(bannerIsVisible).toBe(true);

    await screen.user.keyboard("{ArrowDown}");

    await expect.element(firstOption).toHaveAttribute("aria-selected", "true");
    await expect.element(editor).toHaveAttribute("aria-activedescendant", firstOption.element().id);
    await expect.element(firstOption).toBeInViewport({ ratio: 1 });
    await expect.poll(() => optionIsUnobstructed(firstOption.element())).toBe(true);
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

test("keeps long descriptions and collision paths accessible without horizontal overflow", async () => {
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
  expect(longSourceLabel.textContent).toBe("Repository");
  expect(longOption.outerHTML).not.toContain(longPath);
  expect(emptyOption.querySelector("[data-skill-description]")).toBeNull();
  expect(collisionOption.firstElementChild?.textContent).toContain("User");
  expect(collisionOption.children.item(1)?.textContent).toBe(`${firstCollisionParent}/shared`);
  expect(collisionOption.firstElementChild?.textContent).not.toContain(firstCollisionParent);
  expect(collisionOption.outerHTML).not.toContain("SKILL.md");
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
  await expect.poll(() => scrollRegion.scrollWidth <= scrollRegion.clientWidth + 1).toBe(true);
  expect(screen.container.querySelector("[data-skill-menu-details]")).toBeNull();
  expect(listbox.element().querySelector('[role="separator"]')).toBeNull();
});

test("keeps keyboard selection and editor focus unchanged by pointer hover", async () => {
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
  await userEvent.hover(alphaOption);
  await expect.element(alphaOption).toHaveAttribute("aria-selected", "false");
  await expect.element(betaOption).toHaveAttribute("aria-selected", "true");
  await expect.element(editor).toHaveFocus();

  await userEvent.hover(betaOption);
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
  await expect
    .poll(() => Math.abs(scrollRegion.scrollTop - scrollTopBeforeHover))
    .toBeLessThanOrEqual(1);
  await expect.element(activeOption).toHaveAttribute("aria-selected", "true");
  await expect.element(hoveredOption).toHaveAttribute("aria-selected", "false");

  await screen.user.keyboard("{Enter}");
  await expect.poll(() => getController(controllerRef).getSnapshot().textContent).toBe("$skill-00");
  await userEvent.unhover(document.body);
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

function optionIsUnobstructed(option: Element): boolean {
  const bounds = option.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2;
  return [bounds.top + 1, bounds.top + bounds.height / 2, bounds.bottom - 1].every((y) => {
    const target = option.ownerDocument.elementFromPoint(x, y);
    return target != null && option.contains(target);
  });
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

const drawerSkillMenuParentStyle = {
  "--composer-skill-menu-max-height": "6rem",
  height: "var(--composer-skill-menu-max-height)",
} as CSSProperties;
