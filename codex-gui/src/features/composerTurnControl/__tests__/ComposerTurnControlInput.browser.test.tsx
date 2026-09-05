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

const composerFocusIndicator = (composerPanel: HTMLElement) => {
  const style = window.getComputedStyle(composerPanel);
  return {
    boxShadow: style.boxShadow,
    outline: style.outline,
  };
};

const hasUnclippedFocusPaint = (
  element: HTMLElement,
  restingIndicator: ReturnType<typeof composerFocusIndicator>,
): boolean => {
  const context = document.createElement("canvas").getContext("2d");
  if (context == null) throw new Error("focus color sampling requires a canvas context");
  const colorPixel = (color: string): Uint8ClampedArray => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data;
  };
  let background = colorPixel("white");
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const pixel = colorPixel(getComputedStyle(ancestor).backgroundColor);
    if (pixel[3] === 255) {
      background = pixel;
      break;
    }
  }
  const isVisibleColor = (color: string): boolean => {
    const pixel = colorPixel(color);
    return (
      (pixel[3] ?? 0) > 0 &&
      pixel.some((channel, index) => index < 3 && channel !== background[index])
    );
  };
  const style = getComputedStyle(element);
  if (
    element
      .getAnimations()
      .some((animation) => animation.playState === "running" || animation.pending)
  )
    return false;
  const restingShadows = new Set(
    restingIndicator.boxShadow.split(/,(?![^()]*\))/u).map((shadow) => shadow.trim()),
  );
  let outset = 0;
  for (const shadow of style.boxShadow.split(/,(?![^()]*\))/u)) {
    if (shadow.includes("inset") || restingShadows.has(shadow.trim())) continue;
    const color = /(?:rgba?|[a-z]+)\([^)]*\)/u.exec(shadow)?.[0];
    if (color == null || !isVisibleColor(color)) continue;
    const [x = 0, y = 0, blur = 0, spread = 0] = (
      shadow.replace(color, "").match(/-?[\d.]+px/gu) ?? []
    ).map(Number.parseFloat);
    outset = Math.max(outset, Math.max(Math.abs(x), Math.abs(y)) + blur + spread);
  }
  if (
    style.outline !== restingIndicator.outline &&
    style.outlineStyle !== "none" &&
    style.outlineStyle !== "hidden" &&
    isVisibleColor(style.outlineColor)
  ) {
    outset = Math.max(
      outset,
      Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset),
    );
  }
  if (outset <= 0) return false;
  const rect = element.getBoundingClientRect();
  const paint = {
    left: rect.left - outset,
    right: rect.right + outset,
    top: rect.top - outset,
    bottom: rect.bottom + outset,
  };
  if (
    paint.left < 0 ||
    paint.top < 0 ||
    paint.right > window.innerWidth ||
    paint.bottom > window.innerHeight
  )
    return false;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const ancestorStyle = getComputedStyle(ancestor);
    const bounds = ancestor.getBoundingClientRect();
    if (
      /(auto|scroll|hidden|clip)/u.test(ancestorStyle.overflowX) &&
      (paint.left < bounds.left + ancestor.clientLeft ||
        paint.right > bounds.left + ancestor.clientLeft + ancestor.clientWidth)
    )
      return false;
    if (
      /(auto|scroll|hidden|clip)/u.test(ancestorStyle.overflowY) &&
      (paint.top < bounds.top + ancestor.clientTop ||
        paint.bottom > bounds.top + ancestor.clientTop + ancestor.clientHeight)
    )
      return false;
  }
  return true;
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

  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "false");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "false");
  await expect.element(editorRoot).toHaveAttribute("contenteditable", "true");
  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  const threadStatus = screen.getByRole("status", { name: "Current task is idle", exact: true });
  await expect.element(qrButton).toBeDisabled();
  await expect.element(threadStatus).toHaveTextContent("Idle");
  expect(actions).toEqual(["Stop", "Send"]);
});

test("supports pointer editing and visibly indicates keyboard focus", async () => {
  const screen = await renderComposerTurnControl();
  // The isolated component needs space for focus paint outside its border.
  screen.container.style.paddingBlock = "1rem";
  const composerPanel = getComposerPanel(screen);
  const composer = screen.composer();

  await userEvent.unhover(document.body);
  const restingIndicator = composerFocusIndicator(composerPanel);

  await userEvent.click(composer);
  await expect.element(composer).toHaveFocus();

  await userEvent.keyboard("x");
  await expect.element(composer).toHaveTextContent("x");

  await userEvent.tab();
  await expect.element(composer).not.toHaveFocus();
  await userEvent.tab({ shift: true });
  await expect.element(composer).toHaveFocus();
  await expect.element(composerPanel).toBeVisible();
  // Measure only settled paint added by focus, without fixing its color or size.
  await expect
    .poll(async () => {
      const indicator = composerFocusIndicator(composerPanel);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve();
          }),
        ),
      );
      const settledIndicator = composerFocusIndicator(composerPanel);
      return (
        indicator.boxShadow === settledIndicator.boxShadow &&
        indicator.outline === settledIndicator.outline &&
        hasUnclippedFocusPaint(composerPanel, restingIndicator)
      );
    })
    .toBe(true);
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
  await expect.element(send).toBeEnabled();

  catalogHarness.publish(invalidCatalog);
  await expect.element(triggerElement).toHaveAttribute("aria-invalid", "true");
  await expect
    .element(triggerElement)
    .toHaveAccessibleName(/^(?=.*Friendly Skill)(?=.*Invalid skill)(?=.*details?).*$/i);
  await expect.element(send).toBeDisabled();
  await expect.element(triggerElement).toHaveTextContent("$Friendly Skill");
  expect(triggerElement.outerHTML).not.toContain(selectedSkill.path);

  catalogHarness.publish(readyCatalog);
  await expect.element(triggerElement).not.toHaveAttribute("aria-invalid");
  await expect.element(triggerElement).toHaveAccessibleName(/details?/i);
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
