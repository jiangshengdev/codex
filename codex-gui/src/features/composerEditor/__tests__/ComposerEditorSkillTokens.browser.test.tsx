import { createRef, useState, type CSSProperties, type RefObject } from "react";
import {
  $createNodeSelection,
  $getSelection,
  $isNodeSelection,
  $nodesOfType,
  $setSelection,
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
import { SkillNode } from "../SkillNode";
import { invalidSelectedSkillPaths } from "../../composerTurnControl/composerTurnControlModel";

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

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
