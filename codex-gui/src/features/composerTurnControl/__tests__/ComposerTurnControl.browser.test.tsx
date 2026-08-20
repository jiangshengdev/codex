import { Toast } from "@heroui/react";
import { afterEach, expect, test, vi, type Mock } from "vitest";
import { userEvent } from "vitest/browser";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinatorSnapshot,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import {
  attachBaseline,
  attachReplacement,
  eventTokenUsageUpdated,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { tokenUsageUpdated } from "@/features/projection/__tests__/projectionTestBuilders";
import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import type { AppLocale } from "@/i18n";
import { renderWithProviders } from "@/utils/test-utils";
import { ComposerTurnControl } from "../ComposerTurnControl";

const initializedStatus: GuiHostStatus = { label: "initialized" };
const attachResponse = attachBaseline;
const threadId = attachResponse.snapshot.thread.id;
const readyEmptySkillCatalog: SkillCatalogState = {
  type: "ready",
  candidates: [],
  partialErrorCount: 0,
};

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

function deferred<T>() {
  const callbacks = {} as {
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
  };
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    callbacks.resolve = promiseResolve;
    callbacks.reject = promiseReject;
  });

  return {
    promise,
    resolve: callbacks.resolve,
    reject: callbacks.reject,
  };
}

const createQueueControllerHarness = (initial: ComposerInputQueueCoordinatorSnapshot) => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const recover = vi.fn<ComposerInputQueueCoordinator["recover"]>().mockReturnValue(true);
  const submit = vi
    .fn<ComposerInputQueueCoordinator["submit"]>()
    .mockReturnValue({ type: "accepted" });
  const controller = {
    ownerThreadId: threadId,
    submit,
    submitSteer: vi
      .fn<ComposerInputQueueCoordinator["submitSteer"]>()
      .mockReturnValue({ type: "accepted" }),
    promoteOrdinaryFrontToSteer: vi
      .fn<ComposerInputQueueCoordinator["promoteOrdinaryFrontToSteer"]>()
      .mockReturnValue(false),
    recover,
    observeAcceptedEvent: vi.fn<ComposerInputQueueCoordinator["observeAcceptedEvent"]>(),
    getReleaseReadiness: vi
      .fn<ComposerInputQueueCoordinator["getReleaseReadiness"]>()
      .mockReturnValue({ type: "safe" }),
    reserveRelease: vi.fn<ComposerInputQueueCoordinator["reserveRelease"]>().mockReturnValue({
      type: "reserved",
      reservation: { release: () => undefined },
    }),
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn<ComposerInputQueueCoordinator["dispose"]>(),
  } satisfies ComposerInputQueueCoordinator;

  return {
    controller,
    recover,
    submit,
    publish(next: ComposerInputQueueCoordinatorSnapshot): void {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
};

const createSkillCatalogHarness = (initial: SkillCatalogState = readyEmptySkillCatalog) => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidate: vi
      .fn<ActiveThreadOwnerHandle["skillCatalog"]["invalidate"]>()
      .mockReturnValue(true),
    retry: vi.fn<ActiveThreadOwnerHandle["skillCatalog"]["retry"]>().mockReturnValue(true),
  } satisfies ActiveThreadOwnerHandle["skillCatalog"];

  return {
    controller,
    publish(next: SkillCatalogState): void {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
};

async function renderAttached(
  commandHandle: GuiHostCommands | null = createGuiHostCommands(),
  guardCompositionEndEnter = false,
  locale: AppLocale = "en",
  controller: ComposerInputQueueCoordinator | null = commandHandle == null
    ? null
    : createComposerInputQueueCoordinator({
        threadId,
        activeTurnId: null,
        startTurn: commandHandle.startTurn,
        steerTurn: commandHandle.steerTurn,
      }),
  skillCatalogController: ActiveThreadOwnerHandle["skillCatalog"] = createSkillCatalogHarness()
    .controller,
) {
  const result = await renderWithProviders(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        authorizationToken={null}
        commands={commandHandle}
        composerInputQueueController={controller}
        guardCompositionEndEnter={guardCompositionEndEnter}
        guiHostStatus={initializedStatus}
        routeTarget={{ type: "currentTask", threadId }}
        skillCatalogController={skillCatalogController}
      />
    </>,
    { locale },
  );
  result.store.dispatch(launchThreadIdRecorded(threadId));
  result.store.dispatch(attachedThreadIdObserved(threadId));
  result.store.dispatch(threadRuntimeAttached(attachResponse));
  return result;
}

const expectComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  await expect.element(getComposer(screen)).toHaveAttribute("contenteditable", "false");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
};

const getComposer = (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
  name = "Message Codex",
) => screen.getByRole("combobox", { name, exact: true });

const getComposerPanel = (screen: Awaited<ReturnType<typeof renderWithProviders>>): HTMLElement => {
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
    boxShadow: style.boxShadow,
    cursor: style.cursor,
    opacity: style.opacity,
  };
};

const composerTextWithoutTrailingBrowserPlaceholders = (
  element: Readonly<Pick<Node, "textContent">>,
): string => (element.textContent ?? "").replace(/[ \n\r\u00a0\u200b]+$/u, "");

afterEach(() => {
  vi.restoreAllMocks();
});

async function beginPendingStop(draft: string) {
  const pending = deferred<Awaited<ReturnType<GuiHostCommands["interruptTurn"]>>>();
  const interruptTurn = vi
    .fn<GuiHostCommands["interruptTurn"]>()
    .mockReturnValueOnce(pending.promise);
  const commandHandle: GuiHostCommands = { ...createGuiHostCommands(), interruptTurn };
  const screen = await renderAttached(commandHandle);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );
  const composer = getComposer(screen);
  const stopButton = screen.getByRole("button", { name: "Stop" });

  await composer.fill(draft);
  await userEvent.click(stopButton);

  return { composer, interruptTurn, pending, screen, stopButton };
}

test("disables controls before attach", async () => {
  expect.hasAssertions();

  const screen = await renderWithProviders(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        authorizationToken={null}
        commands={createGuiHostCommands()}
        composerInputQueueController={null}
        guardCompositionEndEnter={false}
        guiHostStatus={{ label: "connecting" }}
        routeTarget={{ type: "currentTask", threadId }}
        skillCatalogController={createSkillCatalogHarness().controller}
      />
    </>,
  );

  const composerPanel = getComposerPanel(screen);
  const disabledVisualSignature = composerPanelVisualSignature(composerPanel);

  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "true");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "true");
  await expectComposerDisabled(screen);
  expect(screen.container.querySelector('[aria-label^="Context usage details"]')).toBeNull();

  screen.store.dispatch(launchThreadIdRecorded(threadId));
  screen.store.dispatch(attachedThreadIdObserved(threadId));
  screen.store.dispatch(threadRuntimeAttached(attachResponse));

  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "false");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "false");
  await expect.element(getComposer(screen)).toHaveAttribute("contenteditable", "true");
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(disabledVisualSignature);
});

test("shows attached context usage and opens its details", async () => {
  const screen = await renderAttached();
  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });

  await expect.element(contextUsageButton).toBeVisible();
  expect(contextUsageButton.element().textContent).toBe("");
  expect(contextUsageButton.element().textContent).not.toMatch(/120|0%/);
  await contextUsageButton.click();

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByText("0% used", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("120 tokens used of 258k", { exact: true })).toBeVisible();
});

test("updates context usage from live runtime events", async () => {
  if (eventTokenUsageUpdated.event.type !== "tokenUsageUpdated") {
    throw new Error("fixture must contain a tokenUsageUpdated projection event");
  }
  const screen = await renderAttached();
  const nextTokenUsage = {
    ...eventTokenUsageUpdated.event.notification.tokenUsage,
    last: {
      ...eventTokenUsageUpdated.event.notification.tokenUsage.last,
      totalTokens: 149_000,
    },
    modelContextWindow: 258_000,
  };

  screen.store.dispatch(
    threadRuntimeEventBuffered({
      notification: tokenUsageUpdated(eventTokenUsageUpdated, nextTokenUsage),
      replay: "live",
    }),
  );

  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 58% used, 149k of 258k tokens",
    exact: true,
  });
  await expect.element(contextUsageButton).toBeVisible();
  expect(contextUsageButton.element().textContent).toBe("");
  expect(contextUsageButton.element().textContent).not.toMatch(/149k|58%/);
  await contextUsageButton.click();

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  await expect.element(dialog.getByText("58% used", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("149k tokens used of 258k", { exact: true })).toBeVisible();
});

test("clears context usage when a replacement attach has no usage", async () => {
  const screen = await renderAttached();
  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });
  await expect.element(contextUsageButton).toBeVisible();

  screen.store.dispatch(threadRuntimeAttached(attachReplacement));

  await expect
    .poll(() => screen.container.querySelector('[aria-label^="Context usage details"]'))
    .toBeNull();
});

test("renders the Lexical composer panel and actions", async () => {
  const screen = await renderAttached();
  const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
  if (!(composerShell instanceof HTMLElement)) {
    throw new Error("composer shell must render");
  }
  const composerPanel = getComposerPanel(screen);
  const editorRoot = getComposer(screen).element();
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
  expect(composerShell.classList.contains("px-4")).toBe(false);
  expect(composerShell.classList.contains("pb-0")).toBe(false);
  expect(composerShell.classList.contains("pb-3")).toBe(true);
  expect(composerShell.classList.contains("py-3")).toBe(false);
  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "false");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "false");
  await expect.element(editorRoot).toHaveAttribute("contenteditable", "true");
  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  await expect.element(qrButton).toBeDisabled();
  await expect.element(qrButton).toHaveClass("button--icon-only");
  expect(actions).toEqual(["Stop", "Send"]);
});

test("distinguishes hover, pointer focus, and keyboard focus-visible field states", async () => {
  const screen = await renderAttached();
  const composerPanel = getComposerPanel(screen);
  const composer = getComposer(screen);

  await userEvent.unhover(document.body);
  const restingVisualSignature = composerPanelVisualSignature(composerPanel);

  await userEvent.hover(composerPanel);
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(restingVisualSignature);
  const hoverVisualSignature = composerPanelVisualSignature(composerPanel);

  await userEvent.click(composer);
  await expect.element(composer).toHaveFocus();
  await expect.element(composerPanel).toHaveAttribute("data-focus-visible", "false");
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(hoverVisualSignature);
  const pointerFocusVisualSignature = composerPanelVisualSignature(composerPanel);

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

test("submits a non-empty draft through the queue controller and clears it when accepted", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderAttached(commandHandle);

  const composer = getComposer(screen);
  await composer.fill("Hello Codex");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  expectStartTurnCalledOnceWithText(startTurn, "Hello Codex");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
});

test("requires the queue controller owner to match the Redux current thread before sending", async () => {
  const harness = createQueueControllerHarness({
    queuedCount: 0,
    recoveryCount: 0,
    recovery: null,
    isRecovering: false,
    pendingSteers: [],
    queuedSteers: [],
    rejectedSteers: [],
    hasUnknownSteer: false,
  });
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const composer = getComposer(screen);
  const send = screen.getByRole("button", { name: "Send", exact: true });

  screen.store.dispatch(
    threadRuntimeAttached({
      ...attachResponse,
      snapshot: {
        ...attachResponse.snapshot,
        thread: { ...attachResponse.snapshot.thread, id: "different-current-thread" },
      },
    }),
  );
  await composer.fill("Identity-gated draft");
  await expect.element(send).toBeDisabled();
  await composer.click();
  await screen.user.keyboard("{Enter}");
  expect(harness.submit).not.toHaveBeenCalled();

  screen.store.dispatch(threadRuntimeAttached(attachResponse));
  await expect.element(send).toBeEnabled();
  await send.click();
  expect(harness.submit).toHaveBeenCalledExactlyOnceWith([
    { type: "text", text: "Identity-gated draft", text_elements: [] },
  ]);
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
  const catalogHarness = createSkillCatalogHarness(readyCatalog);
  const screen = await renderAttached(
    createGuiHostCommands(),
    false,
    "en",
    undefined,
    catalogHarness.controller,
  );
  const composer = getComposer(screen);
  const send = screen.getByRole("button", { name: "Send", exact: true });

  await composer.fill("$canonical");
  await screen.user.keyboard("{Enter}");
  const token = screen.getByText("$Friendly Skill", { exact: true });
  await expect.element(send).toBeEnabled();

  catalogHarness.publish(invalidCatalog);
  await expect.element(token).toHaveAttribute("aria-invalid", "true");
  await expect.element(token).toHaveAttribute("data-invalid-status", "(Invalid skill)");
  await expect.element(token).toHaveAttribute("aria-label", "$Friendly Skill, Invalid skill");
  await expect.element(token).toHaveClass("bg-danger-soft");
  await expect.element(token).toHaveClass("after:content-[attr(data-invalid-status)]");
  await expect.element(send).toBeDisabled();
  await expect.element(token).toHaveTextContent("$Friendly Skill");
  expect(token.element().outerHTML).not.toContain(selectedSkill.path);

  catalogHarness.publish(readyCatalog);
  await expect.element(token).not.toHaveAttribute("aria-invalid");
  await expect.element(token).not.toHaveAttribute("aria-label");
  await expect.element(token).not.toHaveAttribute("data-invalid-status");
  await expect.element(token).not.toHaveClass("bg-danger-soft");
  await expect.element(send).toBeEnabled();

  const unconfirmedCatalogs: SkillCatalogState[] = [
    { type: "refreshing", candidates: [], partialErrorCount: 0 },
    { type: "stale", candidates: [], partialErrorCount: 0 },
    { type: "failed", candidates: [], partialErrorCount: 0 },
    { type: "ready", candidates: [], partialErrorCount: 1 },
  ];
  for (const catalog of unconfirmedCatalogs) {
    catalogHarness.publish(invalidCatalog);
    await expect.element(token).toHaveAttribute("aria-invalid", "true");
    catalogHarness.publish(catalog);
    await expect.element(token).not.toHaveAttribute("aria-invalid");
    await expect.element(token).not.toHaveAttribute("aria-label");
    await expect.element(token).not.toHaveAttribute("data-invalid-status");
    await expect.element(token).not.toHaveClass("bg-danger-soft");
    await expect.element(send).toBeEnabled();
    await expect.element(token).toHaveTextContent("$Friendly Skill");
    expect(token.element().outerHTML).not.toContain(selectedSkill.path);
  }
});

test("keeps whitespace-only draft from submitting", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);

  await composer.fill("   ");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await composer.click();
  await screen.user.keyboard("{Enter}");

  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("uses Enter to send and Shift Enter to insert newline", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);

  await composer.fill("Line 1");
  await composer.click();
  await screen.user.keyboard("{Shift>}{Enter}{/Shift}");
  await screen.user.keyboard("{Enter}");

  expectStartTurnCalledOnceWithText(vi.mocked(commandHandle.startTurn), "Line 1\n");
});

test("keeps composing Enter from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);

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
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  editorRoot.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  editorRoot.dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      data: "你好呀",
    }),
  );
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  await screen.user.keyboard("{Enter}");
  expectStartTurnCalledOnceWithText(startTurn, "你好呀");
});

test("keeps guarded completed composition Enter from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderAttached(commandHandle, true);
  const composer = getComposer(screen);
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  editorRoot.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  editorRoot.dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      data: "你好呀",
    }),
  );
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
  const screen = await renderAttached(commandHandle, true);
  const composer = getComposer(screen);
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  editorRoot.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  editorRoot.dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      data: "你好呀",
    }),
  );
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

test.each([" ", "Enter"])(
  "keeps completed composition suppression through keyup %s",
  async (key) => {
    const commandHandle = createGuiHostCommands();
    const startTurn = vi.mocked(commandHandle.startTurn);
    const screen = await renderAttached(commandHandle, true);
    const composer = getComposer(screen);
    const editorRoot = composer.element();

    await composer.fill("你好呀");
    await composer.click();
    editorRoot.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    editorRoot.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "你好呀",
      }),
    );
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

test("active turn allows queuing and enables Stop", async () => {
  const commandHandle = createGuiHostCommands();
  const event = eventTurnStarted;
  if (event.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  const controller = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: event.event.notification.turn.id,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
  });
  const screen = await renderAttached(commandHandle, false, "en", controller);
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));

  await getComposer(screen).fill("Next draft");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await expect.element(screen.getByText("1 message queued")).toBeVisible();
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  const stopButton = screen.getByRole("button", { name: "Stop" });
  await expect.element(stopButton).toBeEnabled();
  await expect.element(stopButton).toHaveClass("button--danger-soft");
  await stopButton.click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    turnId: event.event.notification.turn.id,
  });
});

test("manual reconnect disables composer operations", async () => {
  expect.hasAssertions();

  const screen = await renderAttached(createGuiHostCommands());
  screen.store.dispatch(
    threadRuntimeManualReconnectRequired({
      reason: "backpressure",
      threadId,
      subscriptionId: attachResponse.subscriptionId,
    }),
  );

  await expectComposerDisabled(screen);
});

test("definite send failure exposes recovery without restoring the submitted draft", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  startTurn.mockRejectedValueOnce(
    new GuiHostCommandError({
      error: new Error("network failed"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);

  await composer.fill("Keep this draft");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
  await expect.element(screen.getByText("1 message has not been sent")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Continue sending" })).toBeVisible();
});

test("renders Simplified Chinese composer and recovery copy", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  startTurn.mockRejectedValueOnce(
    new GuiHostCommandError({
      error: new Error("network failed"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );
  const screen = await renderAttached(commandHandle, false, "zh-CN");
  const composer = getComposer(screen, "向 Codex 发送消息");

  await expect.element(screen.getByRole("region", { name: "消息输入区" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "停止" })).toBeDisabled();
  await composer.fill("保留这份草稿");
  await screen.getByRole("button", { name: "发送" }).click();

  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
  await expect.element(screen.getByText("1 条消息尚未发送")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "继续发送" })).toBeVisible();
});

test("recovery disables send, keeps the editor editable, and prevents duplicate recovery", async () => {
  const initialSnapshot: ComposerInputQueueCoordinatorSnapshot = {
    queuedCount: 0,
    recoveryCount: 2,
    recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
    isRecovering: false,
    pendingSteers: [],
    queuedSteers: [],
    rejectedSteers: [],
    hasUnknownSteer: false,
  };
  const harness = createQueueControllerHarness(initialSnapshot);
  harness.recover.mockImplementation(() => {
    harness.publish({ ...initialSnapshot, isRecovering: true });
    return true;
  });
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const composer = getComposer(screen);
  const recoverButton = screen.getByRole("button", { name: "Continue sending" });

  await composer.fill("Draft while recovering");
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(recoverButton).toHaveAccessibleDescription("2 messages have not been sent");
  await userEvent.click(recoverButton);
  await expect.element(recoverButton).toBeDisabled();

  expect(harness.recover).toHaveBeenCalledExactlyOnceWith();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while recovering");
});

test("guards recovery when commands are unavailable", async () => {
  const harness = createQueueControllerHarness({
    queuedCount: 0,
    recoveryCount: 2,
    recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
    isRecovering: false,
    pendingSteers: [],
    queuedSteers: [],
    rejectedSteers: [],
    hasUnknownSteer: false,
  });
  const screen = await renderAttached(null, false, "en", harness.controller);
  const composer = getComposer(screen);
  const recoverButton = screen.getByRole("button", { name: "Continue sending" });

  await expect.element(composer).toHaveAttribute("contenteditable", "false");
  await expect.element(recoverButton).toBeDisabled();
});

test("guards recovery while manual reconnect is required", async () => {
  const harness = createQueueControllerHarness({
    queuedCount: 0,
    recoveryCount: 2,
    recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
    isRecovering: false,
    pendingSteers: [],
    queuedSteers: [],
    rejectedSteers: [],
    hasUnknownSteer: false,
  });
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeManualReconnectRequired({
      reason: "backpressure",
      threadId,
      subscriptionId: attachResponse.subscriptionId,
    }),
  );
  const composer = getComposer(screen);
  const recoverButton = screen.getByRole("button", { name: "Continue sending" });

  await expect.element(composer).toHaveAttribute("contenteditable", "false");
  await expect.element(recoverButton).toBeDisabled();
});

test("pending stop disables duplicate interruption until success", async () => {
  const { composer, interruptTurn, pending, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  expect(interruptTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    turnId: eventTurnStarted.event.notification.turn.id,
  });

  pending.resolve({});
  await expect.element(stopButton).toBeEnabled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
});

test("stop failure keeps draft and shows a toast", async () => {
  const { composer, interruptTurn, pending, screen, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  pending.reject(new Error("interrupt failed"));

  await expect.element(stopButton).toBeEnabled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
  await expect.element(screen.getByText("Stop failed")).toBeVisible();
  await expect.element(screen.getByText("interrupt failed")).toBeVisible();
  expect(interruptTurn).toHaveBeenCalledTimes(1);
});
