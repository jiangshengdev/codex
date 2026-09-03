import { createRef } from "react";
import { beforeEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";

import { renderWithProviders } from "@/utils/test-utils";
import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";

import type { ComposerEditorController } from "../ComposerEditor";
import { invalidSelectedSkillPaths } from "../../composerTurnControl/composerTurnControlModel";
import { ComposerEditorFixture } from "./composerEditorSkillTokenBrowserTestFixture";
import {
  catalog,
  dispatchHistoryShortcut,
  getController,
  readNodeSelectionSize,
  renderEditor,
  setCollapsedCaret,
  skill,
} from "./composerEditorSkillTokenBrowserTestSupport";

beforeEach(async () => {
  await userEvent.unhover(document.body);
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

test("reprojects invalid sibling collision paths after deleting one skill", async () => {
  const { controllerRef, primary, screen } = await renderInvalidSiblingCollisionScenario();

  await expectPathDetails(screen, /Alpha Shared/i, "alpha/shared");
  await expectPathDetails(screen, /Beta Shared/i, "beta/shared");

  const siblingHost = screen.getByRole("group", { name: /Beta Shared/i });
  await siblingHost.getByText("$Beta Shared", { exact: true }).click();
  await screen.user.keyboard("{Backspace}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(screen, /Alpha Shared/i, "shared");
});

test("reprojects invalid sibling collision paths through undo and redo", async () => {
  const { controllerRef, editor, primary, screen, selectedPaths } =
    await renderInvalidSiblingCollisionScenario();

  const siblingHost = screen.getByRole("group", { name: /Beta Shared/i });
  await siblingHost.getByText("$Beta Shared", { exact: true }).click();
  await screen.user.keyboard("{Backspace}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);

  dispatchHistoryShortcut(editor.element(), "undo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual(selectedPaths);
  await expectPathDetails(screen, /Alpha Shared/i, "alpha/shared");
  await expectPathDetails(screen, /Beta Shared/i, "beta/shared");

  dispatchHistoryShortcut(editor.element(), "redo");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(screen, /Alpha Shared/i, "shared");
});

test("reprojects invalid sibling collision paths through draft restore", async () => {
  const { collidingDraft, controllerRef, primary, screen, selectedPaths, singleDraft } =
    await renderInvalidSiblingCollisionScenario();

  const siblingHost = screen.getByRole("group", { name: /Beta Shared/i });
  await siblingHost.getByText("$Beta Shared", { exact: true }).click();
  await screen.user.keyboard("{Backspace}");
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);

  expect(getController(controllerRef).restore(collidingDraft)).toEqual({ type: "restored" });
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual(selectedPaths);
  await expectPathDetails(screen, /Alpha Shared/i, "alpha/shared");
  await expectPathDetails(screen, /Beta Shared/i, "beta/shared");

  expect(getController(controllerRef).restore(singleDraft)).toEqual({ type: "restored" });
  await expect
    .poll(() => getController(controllerRef).getSnapshot().selectedSkillPaths)
    .toEqual([primary.path]);
  await expectPathDetails(screen, /Alpha Shared/i, "shared");
});

async function renderInvalidSiblingCollisionScenario() {
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

  return { collidingDraft, controllerRef, editor, primary, screen, selectedPaths, singleDraft };
}

type SkillTokenBrowserScreen = Awaited<ReturnType<typeof renderWithProviders>>;

async function expectPathDetails(
  screen: SkillTokenBrowserScreen,
  triggerName: RegExp,
  expectedPath: string,
): Promise<void> {
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
