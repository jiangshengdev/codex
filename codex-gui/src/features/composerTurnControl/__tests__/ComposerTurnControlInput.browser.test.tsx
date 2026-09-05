import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import { userEvent } from "vitest/browser";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { dispatchCompositionEnd } from "@/features/composerEditor/__tests__/composerEditorCompositionBrowserTestSupport";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";
import {
  createComposerSkillCatalogHarness,
  renderComposerTurnControl,
  type RenderedComposerTurnControl,
} from "./composerTurnControlBrowserTestSupport";

const attachResponse = attachBaseline;

const threadId = attachResponse.snapshot.thread.id;

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

const expectStartTurnCalledOnceWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledOnce();
  const call = startTurn.mock.calls.at(0);
  if (call == null) {
    throw new Error("startTurn must have one recorded call");
  }
  const [params] = call;
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

const getComposerPanel = (screen: RenderedComposerTurnControl): HTMLElement => {
  const composerPanel = screen.container.querySelector(".composer-panel");
  if (!(composerPanel instanceof HTMLElement)) {
    throw new Error("composer panel must render");
  }
  return composerPanel;
};

const composerPanelVisualSignature = (composerPanel: HTMLElement) => {
  const style = window.getComputedStyle(composerPanel);
  return {
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    boxShadow: style.boxShadow,
    cursor: style.cursor,
    opacity: style.opacity,
  };
};

const elementGeometry = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
};

const composerTextWithoutTrailingBrowserPlaceholders = (
  element: Readonly<Pick<Node, "textContent">>,
): string => (element.textContent ?? "").replace(/[ \n\r\u00a0\u200b]+$/u, "");

const dispatchComposition = (element: Element, data: string): void => {
  element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  dispatchCompositionEnd(element, data);
};

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders the Lexical composer panel and actions", async () => {
  const screen = await renderComposerTurnControl();
  const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
  if (!(composerShell instanceof HTMLElement)) {
    throw new Error("composer shell must render");
  }
  const composerPanel = getComposerPanel(screen);
  const editorRoot = screen.composer().element();
  const actions = Array.from(composerPanel.querySelectorAll("button"))
    .map((button) => button.textContent.trim())
    .filter((label) => label.length > 0);

  expect(composerPanel.classList.contains("p-2")).toBe(true);
  expect(composerPanel.classList.contains("pb-5")).toBe(false);
  expect(composerPanel.classList.contains("p-3")).toBe(false);
  expect(composerPanel.classList.contains("composer-panel")).toBe(true);
  expect(composerShell.classList.contains("composer-shell")).toBe(true);
  expect(composerShell.classList.contains("sticky")).toBe(true);
  expect(composerShell.classList.contains("bottom-0")).toBe(true);
  expect(composerShell.classList.contains("fixed")).toBe(false);
  expect(composerShell.classList.contains("inset-x-0")).toBe(false);
  expect(composerShell.classList.contains("px-3")).toBe(true);
  expect(composerShell.classList.contains("px-4")).toBe(false);
  expect(composerShell.classList.contains("pb-0")).toBe(false);
  expect(composerShell.classList.contains("pb-3")).toBe(true);
  expect(composerShell.classList.contains("py-3")).toBe(false);
  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "false");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "false");
  await expect.element(editorRoot).toHaveAttribute("contenteditable", "true");
  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  const threadStatus = screen.getByRole("status", { name: "Current task is idle", exact: true });
  const footerLeft = composerPanel.querySelector(".composer-footer-left");
  if (!(footerLeft instanceof HTMLElement)) {
    throw new Error("composer footer left cluster must render");
  }
  await expect.element(qrButton).toBeDisabled();
  await expect.element(qrButton).toHaveClass("button--icon-only");
  await expect.element(threadStatus).toHaveTextContent("Idle");
  expect(qrButton.element().parentElement).toBe(footerLeft);
  expect(threadStatus.element().parentElement).toBe(footerLeft);
  expect(qrButton.element().nextElementSibling).toBe(threadStatus.element());
  expect(actions).toEqual(["Stop", "Send"]);
});

test("distinguishes hover, pointer focus, and keyboard focus-visible field states", async () => {
  const screen = await renderComposerTurnControl();
  const composerPanel = getComposerPanel(screen);
  const composer = screen.composer();

  await userEvent.unhover(document.body);
  const restingVisualSignature = composerPanelVisualSignature(composerPanel);

  await userEvent.hover(composerPanel);
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(restingVisualSignature);
  const hoverVisualSignature = composerPanelVisualSignature(composerPanel);
  const panelGeometryBeforeFocus = elementGeometry(composerPanel);
  const composerGeometryBeforeFocus = elementGeometry(composer.element());

  await userEvent.click(composer);
  await expect.element(composer).toHaveFocus();
  await expect.element(composerPanel).toHaveAttribute("data-focus-visible", "false");
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(hoverVisualSignature);
  const pointerFocusVisualSignature = composerPanelVisualSignature(composerPanel);
  expect(pointerFocusVisualSignature.borderWidth).toBe(hoverVisualSignature.borderWidth);
  expect(elementGeometry(composerPanel)).toEqual(panelGeometryBeforeFocus);
  expect(elementGeometry(composer.element())).toEqual(composerGeometryBeforeFocus);

  await userEvent.keyboard("x");
  await expect.element(composerPanel).toHaveAttribute("data-focus-visible", "false");

  await userEvent.tab();
  await expect.element(composer).not.toHaveFocus();
  await userEvent.tab({ shift: true });
  await expect.element(composer).toHaveFocus();
  await expect.element(composerPanel).toHaveAttribute("data-focus-visible", "true");
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(pointerFocusVisualSignature);
});

test("marks a skill invalid only when a complete ready catalog confirms its path is unavailable", async () => {
  const selectedSkill: SkillCatalogCandidate = {
    name: "canonical-skill",
    path: "/private/skills/canonical-skill/SKILL.md",
    description: "Canonical skill description",
    scope: "repo",
    interface: {
      displayName: "Friendly Skill",
      iconSmallUrl: null,
      iconLargeUrl: null,
    },
  };
  const readyCatalog: SkillCatalogState = {
    type: "ready",
    candidates: [selectedSkill],
    partialErrorCount: 0,
  };
  const invalidCatalog: SkillCatalogState = {
    type: "ready",
    candidates: [],
    partialErrorCount: 0,
  };
  const catalogHarness = createComposerSkillCatalogHarness(readyCatalog);
  const screen = await renderComposerTurnControl({ skills: catalogHarness.controller });
  const composer = screen.composer();
  const send = screen.getByRole("button", { name: "Send", exact: true });

  await composer.fill("$canonical");
  await screen.user.keyboard("{Enter}");
  const trigger = screen.getByRole("group", { name: /Friendly Skill/i });
  const triggerElement = trigger.element();
  const chip = triggerElement.querySelector('[data-slot="chip"]');
  if (!(chip instanceof HTMLSpanElement))
    throw new Error("selected skill must render a HeroUI Chip");
  await expect.element(send).toBeEnabled();

  catalogHarness.publish(invalidCatalog);
  await expect.element(triggerElement).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(triggerElement)
    .toHaveAccessibleName(/^(?=.*Friendly Skill)(?=.*Invalid skill)(?=.*details?).*$/i);
  expect(chip.classList).toContain("chip--danger");
  expect(chip.classList).toContain("chip--soft");
  await expect.element(send).toBeDisabled();
  await expect.element(triggerElement).toHaveTextContent("$Friendly Skill");
  expect(triggerElement.outerHTML).not.toContain(selectedSkill.path);

  catalogHarness.publish(readyCatalog);
  await expect.element(triggerElement).not.toHaveAttribute("aria-invalid");
  await expect.element(triggerElement).toHaveAccessibleName(/details?/i);
  expect(chip.classList).toContain("chip--secondary");
  expect(chip.classList).not.toContain("chip--danger");
  await expect.element(send).toBeEnabled();

  const unconfirmedCatalogs: SkillCatalogState[] = [
    { type: "refreshing", candidates: [], partialErrorCount: 0 },
    { type: "stale", candidates: [], partialErrorCount: 0 },
    { type: "failed", candidates: [], partialErrorCount: 0 },
    { type: "ready", candidates: [], partialErrorCount: 1 },
  ];
  for (const catalog of unconfirmedCatalogs) {
    catalogHarness.publish(invalidCatalog);
    await expect.element(triggerElement).toHaveAttribute("aria-invalid", "true");
    catalogHarness.publish(catalog);
    await expect.element(triggerElement).not.toHaveAttribute("aria-invalid");
    await expect.element(triggerElement).toHaveAccessibleName(/details?/i);
    expect(chip.classList).not.toContain("chip--danger");
    await expect.element(send).toBeEnabled();
    await expect.element(triggerElement).toHaveTextContent("$Friendly Skill");
    expect(triggerElement.outerHTML).not.toContain(selectedSkill.path);
  }
});

test("keeps whitespace-only draft from submitting", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
  });
  const composer = screen.composer();

  await composer.fill("   ");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await composer.click();
  await screen.user.keyboard("{Enter}");

  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("uses Enter to send and Shift Enter to insert newline", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
  });
  const composer = screen.composer();

  await composer.fill("Line 1");
  await composer.click();
  await screen.user.keyboard("{Shift>}{Enter}{/Shift}");
  await screen.user.keyboard("{Enter}");

  expectStartTurnCalledOnceWithText(vi.mocked(commandHandle.startTurn), "Line 1\n");
});

test("keeps composing Enter from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
  });
  const composer = screen.composer();

  await composer.fill("正在输入");
  await composer.click();
  composer.element().dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    }),
  );

  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("正在输入");
});

test("sends completed composition Enter immediately when guard is disabled", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
  });
  const composer = screen.composer();
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  dispatchComposition(editorRoot, "你好呀");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  await screen.user.keyboard("{Enter}");
  expectStartTurnCalledOnceWithText(startTurn, "你好呀");
});

test("keeps guarded completed composition Enter from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
    guardCompositionEndEnter: true,
  });
  const composer = screen.composer();
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  dispatchComposition(editorRoot, "你好呀");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  await screen.user.keyboard("{Enter}");
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  await screen.user.keyboard("{Enter}");
  expectStartTurnCalledOnceWithText(startTurn, "你好呀");
});

test("clears completed composition suppression on the next non Enter keydown", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
    guardCompositionEndEnter: true,
  });
  const composer = screen.composer();
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  dispatchComposition(editorRoot, "你好呀");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  editorRoot.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: " ",
    }),
  );

  await screen.user.keyboard("{Enter}");

  expectStartTurnCalledOnceWithText(startTurn, "你好呀");
});

test("clears completed composition suppression when Shift Enter inserts a newline", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
    guardCompositionEndEnter: true,
  });
  const composer = screen.composer();
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  dispatchComposition(editorRoot, "你好呀");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  await screen.user.keyboard("{Shift>}{Enter}{/Shift}");
  expect(startTurn).not.toHaveBeenCalled();

  await screen.user.keyboard("{Enter}");

  expectStartTurnCalledOnceWithText(startTurn, "你好呀\n");
});

test.each([" ", "Enter"])(
  "keeps completed composition suppression through keyup %s",
  async (key) => {
    const commandHandle = createGuiHostCommands();
    const startTurn = vi.mocked(commandHandle.startTurn);
    const screen = await renderComposerTurnControl({
      queue: { type: "created", commands: commandHandle },
      guardCompositionEndEnter: true,
    });
    const composer = screen.composer();
    const editorRoot = composer.element();

    await composer.fill("你好呀");
    await composer.click();
    dispatchComposition(editorRoot, "你好呀");
    await expect
      .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
      .toBe("你好呀");

    editorRoot.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key,
      }),
    );

    await screen.user.keyboard("{Enter}");

    expect(commandHandle.startTurn).not.toHaveBeenCalled();
    await expect
      .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
      .toBe("你好呀");

    await screen.user.keyboard("{Enter}");

    expectStartTurnCalledOnceWithText(startTurn, "你好呀");
  },
);
