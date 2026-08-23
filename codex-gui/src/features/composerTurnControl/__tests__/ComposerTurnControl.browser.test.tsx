import { Toast } from "@heroui/react";
import { afterEach, expect, test, vi, type Mock } from "vitest";
import { userEvent } from "vitest/browser";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinatorSnapshot,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type {
  ComposerPendingInputCursor,
  ComposerPendingInputDetailResult,
  ComposerPendingInputDisplayKey,
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
  ComposerPendingInputPageResult,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import {
  attachBaseline,
  attachReplacement,
  eventTokenUsageUpdated,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  tokenUsageUpdated,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
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

const queueSnapshot = (
  overrides: Partial<ComposerInputQueueCoordinatorSnapshot> = {},
): ComposerInputQueueCoordinatorSnapshot => ({
  ordinaryQueuedCount: 0,
  guidingCount: 0,
  detailRevision: 0,
  recoveryCount: 0,
  recovery: null,
  isRecovering: false,
  rejectedSteers: [],
  hasUnknownSteer: false,
  canStop: false,
  interrupt: null,
  pendingInputManagementOutcome: null,
  ...overrides,
});

type PendingInputHarnessItem = ComposerPendingInputPageItem & Readonly<{ detailText?: string }>;

type PendingInputHarnessDetails = Readonly<{
  ordinary: readonly PendingInputHarnessItem[];
  steer: readonly PendingInputHarnessItem[];
}>;

const pendingInputItem = (
  key: string,
  lane: ComposerPendingInputLane,
  preview: ComposerPendingInputPageItem["preview"],
  detailText?: string,
  management: ComposerPendingInputPageItem["management"] = { type: "manageable" },
): PendingInputHarnessItem => ({
  key: key as ComposerPendingInputDisplayKey,
  lane,
  management,
  preview,
  ...(detailText == null ? {} : { detailText }),
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

const createQueueControllerHarness = (
  initial: ComposerInputQueueCoordinatorSnapshot,
  initialDetails: PendingInputHarnessDetails = { ordinary: [], steer: [] },
) => {
  let snapshot = initial;
  let details = initialDetails;
  let ownerThreadId = threadId;
  const listeners = new Set<() => void>();
  const cursorFacts = new WeakMap<
    ComposerPendingInputCursor,
    Readonly<{ lane: ComposerPendingInputLane; offset: number; revision: number }>
  >();
  const recover = vi.fn<ComposerInputQueueCoordinator["recover"]>().mockReturnValue(true);
  const interruptActiveTurn = vi
    .fn<ComposerInputQueueCoordinator["interruptActiveTurn"]>()
    .mockReturnValue(true);
  const submit = vi
    .fn<ComposerInputQueueCoordinator["submit"]>()
    .mockReturnValue({ type: "accepted" });
  const submitSteer = vi
    .fn<ComposerInputQueueCoordinator["submitSteer"]>()
    .mockReturnValue({ type: "accepted" });
  const promoteOrdinaryFrontToSteer = vi
    .fn<ComposerInputQueueCoordinator["promoteOrdinaryFrontToSteer"]>()
    .mockReturnValue(false);
  const readPendingInputPage = vi.fn<ComposerInputQueueCoordinator["readPendingInputPage"]>(
    (request): ComposerPendingInputPageResult => {
      if (request.revision !== snapshot.detailRevision) {
        return { type: "stale", revision: snapshot.detailRevision };
      }
      const cursor = request.cursor == null ? null : cursorFacts.get(request.cursor);
      if (
        request.cursor != null &&
        (cursor?.lane !== request.lane || cursor.revision !== request.revision)
      ) {
        return { type: "stale", revision: snapshot.detailRevision };
      }
      const offset = cursor?.offset ?? 0;
      const laneItems = details[request.lane];
      const items = laneItems
        .slice(offset, offset + request.limit)
        .map(({ detailText, ...item }) => {
          void detailText;
          return item;
        });
      const nextOffset = offset + items.length;
      let nextCursor: ComposerPendingInputCursor | null = null;
      if (nextOffset < laneItems.length) {
        nextCursor = {} as ComposerPendingInputCursor;
        cursorFacts.set(nextCursor, {
          lane: request.lane,
          offset: nextOffset,
          revision: request.revision,
        });
      }
      return { type: "page", revision: request.revision, items, nextCursor };
    },
  );
  const readPendingInputDetail = vi.fn<ComposerInputQueueCoordinator["readPendingInputDetail"]>(
    (request): ComposerPendingInputDetailResult => {
      if (request.revision !== snapshot.detailRevision) {
        return { type: "stale", revision: snapshot.detailRevision };
      }
      const item = [...details.steer, ...details.ordinary].find(({ key }) => key === request.key);
      return item?.detailText == null
        ? { type: "missing", revision: request.revision }
        : {
            type: "detail",
            key: request.key,
            revision: request.revision,
            text: item.detailText,
          };
    },
  );
  const beginPendingInputEdit = vi
    .fn<ComposerInputQueueCoordinator["beginPendingInputEdit"]>()
    .mockImplementation(() => ({
      type: "notManageable",
      scope: "liveOwner",
      revision: snapshot.detailRevision,
    }));
  const deletePendingInput = vi
    .fn<ComposerInputQueueCoordinator["deletePendingInput"]>()
    .mockImplementation(() => ({
      type: "notManageable",
      scope: "liveOwner",
      revision: snapshot.detailRevision,
    }));
  const controller = {
    get ownerThreadId() {
      return ownerThreadId;
    },
    submit,
    submitSteer,
    promoteOrdinaryFrontToSteer,
    interruptActiveTurn,
    recover,
    observeAcceptedEvent: vi.fn<ComposerInputQueueCoordinator["observeAcceptedEvent"]>(),
    getReleaseReadiness: vi
      .fn<ComposerInputQueueCoordinator["getReleaseReadiness"]>()
      .mockReturnValue({ type: "safe" }),
    reserveRelease: vi.fn<ComposerInputQueueCoordinator["reserveRelease"]>().mockReturnValue({
      type: "reserved",
      reservation: { release: () => undefined },
    }),
    readPendingInputPage,
    readPendingInputDetail,
    beginPendingInputEdit,
    deletePendingInput,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn<ComposerInputQueueCoordinator["dispose"]>(),
  } satisfies ComposerInputQueueCoordinator;

  return {
    controller,
    interruptActiveTurn,
    recover,
    promoteOrdinaryFrontToSteer,
    readPendingInputDetail,
    readPendingInputPage,
    submit,
    submitSteer,
    publish(next: ComposerInputQueueCoordinatorSnapshot): void {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    replaceDetails(next: PendingInputHarnessDetails): void {
      details = next;
    },
    replaceOwnerThreadId(next: string): void {
      ownerThreadId = next;
      snapshot = { ...snapshot };
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
        interruptTurn: commandHandle.interruptTurn,
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

const dispatchGuideShortcut = (element: Element): void => {
  const isMac = navigator.platform.startsWith("Mac");
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      key: "Enter",
      metaKey: isMac,
    }),
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function beginPendingStop(draft: string) {
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  const pending = deferred<Awaited<ReturnType<GuiHostCommands["interruptTurn"]>>>();
  const interruptTurn = vi
    .fn<GuiHostCommands["interruptTurn"]>()
    .mockReturnValueOnce(pending.promise);
  const commandHandle: GuiHostCommands = { ...createGuiHostCommands(), interruptTurn };
  const controller = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: eventTurnStarted.event.notification.turn.id,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
    interruptTurn,
  });
  const screen = await renderAttached(commandHandle, false, "en", controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );
  const composer = getComposer(screen);
  const stopButton = screen.getByRole("button", { name: "Stop" });

  await composer.fill(draft);
  await userEvent.click(stopButton);

  return { composer, controller, interruptTurn, pending, screen, stopButton };
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

test("requires the queue controller owner to match the Redux current thread for operations", async () => {
  const harness = createQueueControllerHarness(queueSnapshot({ canStop: true }));
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const composer = getComposer(screen);
  const send = screen.getByRole("button", { name: "Send", exact: true });
  const stop = screen.getByRole("button", { name: "Stop" });

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
  await expect.element(stop).toBeDisabled();
  await composer.click();
  await screen.user.keyboard("{Enter}");
  expect(harness.submit).not.toHaveBeenCalled();
  expect(harness.interruptActiveTurn).not.toHaveBeenCalled();

  screen.store.dispatch(threadRuntimeAttached(attachResponse));
  await expect.element(send).toBeEnabled();
  await expect.element(stop).toBeEnabled();
  await stop.click();
  await send.click();

  expect(harness.interruptActiveTurn).toHaveBeenCalledExactlyOnceWith();
  expect(harness.submit).toHaveBeenCalledOnce();
  const submittedCapture = harness.submit.mock.calls.at(0)?.at(0);
  if (submittedCapture == null) throw new Error("ordinary submit must receive a composer capture");
  expect(harness.submit).toHaveBeenCalledExactlyOnceWith(submittedCapture);
  expect(submittedCapture.draft).toBeDefined();
  expect(submittedCapture).toMatchObject({
    input: [{ type: "text", text: "Identity-gated draft", text_elements: [] }],
    textContent: "Identity-gated draft",
    selectedSkillPaths: [],
  });
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
    interruptTurn: commandHandle.interruptTurn,
  });
  const screen = await renderAttached(commandHandle, false, "en", controller);
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));

  await getComposer(screen).fill("Next draft");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Pending: Queued 1", exact: true }))
    .toBeVisible();
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  const stopButton = screen.getByRole("button", { name: "Stop" });
  await expect.element(stopButton).toBeEnabled();
  await expect.element(stopButton).toHaveClass("button--danger-soft");
  await stopButton.click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    turnId: event.event.notification.turn.id,
  });
  await expect.poll(() => controller.getSnapshot().interrupt?.phase).toBe("accepted");

  controller.observeAcceptedEvent({
    notification: turnCompleted(eventTurnCompleted, "commit-local-stop", {
      ...event.event.notification.turn,
      status: "interrupted",
    }),
    replay: "live",
  });

  await expect.element(screen.getByText("1 message has not been sent")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Continue sending" })).toBeVisible();
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("shows Guide only for an active turn and submits an accepted draft as steer", async () => {
  const idleScreen = await renderAttached();
  await expect
    .element(idleScreen.getByRole("button", { name: "Guide", exact: true }))
    .not.toBeInTheDocument();
  await idleScreen.unmount();

  const harness = createQueueControllerHarness(queueSnapshot({ canStop: true }));
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );
  const composer = getComposer(screen);
  const guide = screen.getByRole("button", { name: "Guide", exact: true });

  await expect.element(guide).toBeDisabled();
  await composer.fill("Guide this turn");
  await expect.element(guide).toBeEnabled();
  await userEvent.unhover(document.body);
  await userEvent.hover(guide);
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent(navigator.platform.startsWith("Mac") ? "⌘ Enter" : "Ctrl+Enter");
  await userEvent.unhover(guide);
  await guide.click();

  expect(harness.submitSteer).toHaveBeenCalledOnce();
  const submittedCapture = harness.submitSteer.mock.calls.at(0)?.at(0);
  if (submittedCapture == null) throw new Error("guide submit must receive a composer capture");
  expect(harness.submitSteer).toHaveBeenCalledExactlyOnceWith(submittedCapture);
  expect(submittedCapture.draft).toBeDefined();
  expect(submittedCapture).toMatchObject({
    input: [{ type: "text", text: "Guide this turn", text_elements: [] }],
    textContent: "Guide this turn",
    selectedSkillPaths: [],
  });
  expect(harness.submit).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");

  harness.submitSteer.mockReturnValueOnce({ type: "rejected", reason: "recoveryPending" });
  await composer.fill("Keep the newer draft");
  await guide.click();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Keep the newer draft");
});

test("routes guide shortcuts by draft presence while ordinary Enter stays ordinary", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-shortcut", "ordinary", {
          type: "text",
          text: "Ordinary queued",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  harness.promoteOrdinaryFrontToSteer.mockReturnValue(true);
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );
  const composer = getComposer(screen);

  await composer.fill("Explicit guide");
  dispatchGuideShortcut(composer.element());
  expect(harness.submitSteer).toHaveBeenCalledOnce();
  const guideCapture = harness.submitSteer.mock.calls.at(0)?.at(0);
  if (guideCapture == null) throw new Error("guide shortcut must submit a composer capture");
  expect(harness.submitSteer).toHaveBeenCalledExactlyOnceWith(guideCapture);
  expect(guideCapture.draft).toBeDefined();
  expect(guideCapture).toMatchObject({
    input: [{ type: "text", text: "Explicit guide", text_elements: [] }],
    textContent: "Explicit guide",
    selectedSkillPaths: [],
  });
  expect(harness.promoteOrdinaryFrontToSteer).not.toHaveBeenCalled();
  expect(harness.submit).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");

  dispatchGuideShortcut(composer.element());
  expect(harness.promoteOrdinaryFrontToSteer).toHaveBeenCalledExactlyOnceWith();
  expect(harness.submitSteer).toHaveBeenCalledTimes(1);

  await composer.fill("Ordinary next turn");
  await composer.click();
  await screen.user.keyboard("{Enter}");
  expect(harness.submit).toHaveBeenCalledOnce();
  const ordinaryCapture = harness.submit.mock.calls.at(0)?.at(0);
  if (ordinaryCapture == null) throw new Error("ordinary Enter must submit a composer capture");
  expect(harness.submit).toHaveBeenCalledExactlyOnceWith(ordinaryCapture);
  expect(ordinaryCapture.draft).toBeDefined();
  expect(ordinaryCapture).toMatchObject({
    input: [{ type: "text", text: "Ordinary next turn", text_elements: [] }],
    textContent: "Ordinary next turn",
    selectedSkillPaths: [],
  });
  expect(harness.submitSteer).toHaveBeenCalledTimes(1);
});

test("renders one bounded pending-input Drawer while keeping exceptional states inline", async () => {
  const longPreview = `${"Guide detail ".repeat(13)}...`;
  const longDetail = "Guide detail ".repeat(20).trim();
  const steerItems = Array.from({ length: 21 }, (_, index) =>
    index === 0
      ? pendingInputItem(
          "steer-long",
          "steer",
          { type: "text", text: longPreview, truncated: true },
          longDetail,
          { type: "readOnly", reason: "deliveryInProgress" },
        )
      : index === 1
        ? pendingInputItem("steer-structured", "steer", {
            type: "nonText",
            imageCount: 2,
            audioCount: 1,
            skillCount: 1,
            mentionCount: 1,
          })
        : pendingInputItem(`steer-${String(index)}`, "steer", {
            type: "text",
            text: `Steer ${String(index)}`,
            truncated: false,
          }),
  );
  const ordinaryItems = [
    pendingInputItem("ordinary-a", "ordinary", {
      type: "text",
      text: "Ordinary A",
      truncated: false,
    }),
    pendingInputItem("ordinary-b", "ordinary", {
      type: "text",
      text: "Ordinary B",
      truncated: false,
    }),
    ...Array.from({ length: 19 }, (_, index) =>
      pendingInputItem(`ordinary-${String(index + 2)}`, "ordinary", {
        type: "text",
        text: `Ordinary ${String(index + 2)}`,
        truncated: false,
      }),
    ),
  ];
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: 21,
      guidingCount: 21,
      detailRevision: 4,
      rejectedSteers: [
        {
          key: "rejected-private-id",
          preview: { type: "text", text: "Rejected first", truncated: false },
          reason: "activeTurnNotSteerable",
        },
      ],
      hasUnknownSteer: true,
      canStop: true,
    }),
    { ordinary: ordinaryItems, steer: steerItems },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );
  const region = screen.getByRole("region", { name: "Pending messages", exact: true });
  const trigger = region.getByRole("button", {
    name: "Pending: Guide 21, Queued 21",
    exact: true,
  });

  await expect.element(trigger).toBeVisible();
  await expect.element(region.getByText("Will send first", { exact: true })).toBeVisible();
  await expect
    .element(region.getByText("Currently unable to guide; added to queue", { exact: true }))
    .toBeVisible();
  await expect.element(region.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect.element(region.getByText("Ordinary A", { exact: true })).not.toBeInTheDocument();
  expect(region.getByRole("button", { name: /retry/i }).query()).toBeNull();

  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(dialog).toBeVisible();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(2);
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(1, {
    lane: "steer",
    revision: 4,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(2, {
    lane: "ordinary",
    revision: 4,
    cursor: null,
    limit: 20,
  });
  expect(screen.baseElement.contains(dialog.element())).toBe(true);
  await expect.element(dialog.getByRole("heading", { name: "Guiding" })).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Queued" })).toBeVisible();
  await expect.element(dialog).not.toHaveTextContent("steer-long");
  await expect.element(dialog).not.toHaveTextContent("ordinary-a");
  await expect.element(dialog).toHaveTextContent(/2 images.*1 audio item.*1 skill.*1 mention/);
  await expect
    .element(dialog.getByText("This message has entered the sending process.", { exact: true }))
    .toBeVisible();
  const dialogText = dialog.element().textContent;
  expect(dialogText.indexOf(longPreview)).toBeLessThan(dialogText.indexOf("Steer 2"));
  expect(dialogText.indexOf("Ordinary A")).toBeLessThan(dialogText.indexOf("Ordinary B"));
  await expect.element(dialog.getByText("Steer 20", { exact: true })).not.toBeInTheDocument();

  const expand = dialog.getByRole("button", { name: /Expand pending message:/ });
  await expand.click();
  await expect.element(dialog.getByText(longDetail, { exact: true })).toBeVisible();
  const collapse = dialog.getByRole("button", { name: /Collapse pending message:/ });
  await collapse.click();
  await expect.element(dialog.getByText(longDetail, { exact: true })).not.toBeInTheDocument();

  const showMoreGuiding = dialog.getByRole("button", {
    name: "Show more guiding messages",
    exact: true,
  });
  const showMoreQueued = dialog.getByRole("button", {
    name: "Show more queued messages",
    exact: true,
  });
  await expect.element(showMoreGuiding).toHaveTextContent("Show more");
  await expect.element(showMoreQueued).toHaveTextContent("Show more");
  await showMoreGuiding.click();
  await showMoreQueued.click();
  await expect.element(dialog.getByText("Steer 20", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Ordinary 20", { exact: true })).toBeVisible();

  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-revision", "ordinary", {
        type: "text",
        text: "Ordinary after revision",
        truncated: false,
      }),
    ],
    steer: [
      pendingInputItem("steer-revision", "steer", {
        type: "text",
        text: "Steer after revision",
        truncated: false,
      }),
    ],
  });
  harness.publish(
    queueSnapshot({
      ordinaryQueuedCount: 1,
      guidingCount: 1,
      detailRevision: 5,
      hasUnknownSteer: true,
      rejectedSteers: harness.controller.getSnapshot().rejectedSteers,
      canStop: true,
    }),
  );
  await expect.element(dialog.getByText("Steer after revision", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Steer 20", { exact: true })).not.toBeInTheDocument();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(6);
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(5, {
    lane: "steer",
    revision: 5,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(6, {
    lane: "ordinary",
    revision: 5,
    cursor: null,
    limit: 20,
  });
  const currentTrigger = region.getByRole("button", {
    name: "Pending: Guide 1, Queued 1",
    exact: true,
  });
  const closeTrigger = dialog.getByRole("button", { name: "Close", exact: true });

  closeTrigger.element().focus();
  await expect.element(closeTrigger).toHaveFocus();
  await screen.user.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(currentTrigger).toHaveFocus();
});

test("edits and deletes an ordinary pending message in one Drawer without changing the main draft", async () => {
  const commandHandle = createGuiHostCommands();
  const event = eventTurnStarted;
  if (event.event.type !== "turnStarted") throw new Error("fixture must be turnStarted");
  const controller = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: event.event.notification.turn.id,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
    interruptTurn: commandHandle.interruptTurn,
  });
  const beginEdit = vi.spyOn(controller, "beginPendingInputEdit");
  const screen = await renderAttached(commandHandle, false, "en", controller);
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));
  const composer = getComposer(screen);

  await composer.fill("Original queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Keep this main draft");
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  expect(screen.getByRole("dialog").all().length).toBe(1);

  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  const pendingEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await expect.element(pendingEditor).toHaveTextContent("Original queued message");
  const firstBeginResult = beginEdit.mock.results.at(0)?.value;
  if (firstBeginResult?.type !== "begun") throw new Error("first edit must begin");
  const firstCancel = vi.spyOn(firstBeginResult.reservation, "cancel");
  await pendingEditor.fill("Discard this edit");
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(firstCancel).toHaveBeenCalledOnce();
  const cancelledListDialog = screen.getByRole("dialog", {
    name: "Pending details",
    exact: true,
  });
  await expect
    .element(cancelledListDialog.getByText("Original queued message", { exact: true }))
    .toBeVisible();

  await cancelledListDialog.getByRole("button", { name: "Edit", exact: true }).click();
  const escapeEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  const secondBeginResult = beginEdit.mock.results.at(1)?.value;
  if (secondBeginResult?.type !== "begun") throw new Error("second edit must begin");
  const secondCancel = vi.spyOn(secondBeginResult.reservation, "cancel");
  await escapeEditor.fill("Discard this edit with Escape");
  await screen.user.keyboard("{Escape}");
  expect(secondCancel).toHaveBeenCalledOnce();
  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await expect.element(trigger).toHaveFocus();
  await trigger.click();
  const reopenedListDialog = screen.getByRole("dialog", {
    name: "Pending details",
    exact: true,
  });
  await expect
    .element(reopenedListDialog.getByText("Original queued message", { exact: true }))
    .toBeVisible();

  await reopenedListDialog.getByRole("button", { name: "Edit", exact: true }).click();
  const restoredEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await expect.element(restoredEditor).toHaveTextContent("Original queued message");
  await restoredEditor.fill("Edited queued message");
  await restoredEditor.click();
  await screen.user.keyboard("{Enter}");

  const listDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(listDialog.getByText("Edited queued message", { exact: true }))
    .toBeVisible();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Keep this main draft");
  expect(listDialog.getByRole("alert").query()).toBeNull();

  await listDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .element(listDialog.getByText("Delete this pending message?", { exact: true }))
    .toBeVisible();
  expect(screen.getByRole("dialog").all().length).toBe(1);
  await listDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.element(listDialog.getByText("No pending messages", { exact: true })).toBeVisible();
  await expect.element(listDialog.getByRole("heading", { name: "Pending details" })).toHaveFocus();
  expect(listDialog.getByRole("alert").query()).toBeNull();
});

test("returns focus to the Composer when cancelling an edit synchronously drains the last pending message", async () => {
  const commandHandle = createGuiHostCommands();
  const event = eventTurnStarted;
  if (event.event.type !== "turnStarted") throw new Error("fixture must be turnStarted");
  const controller = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: event.event.notification.turn.id,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
    interruptTurn: commandHandle.interruptTurn,
  });
  const beginEdit = vi.spyOn(controller, "beginPendingInputEdit");
  const screen = await renderAttached(commandHandle, false, "en", controller);
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));
  const composer = getComposer(screen);

  await composer.fill("Drain after cancelling edit");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toBeVisible();
  const begun = beginEdit.mock.results.at(0)?.value;
  if (begun?.type !== "begun") throw new Error("draining edit must begin");
  const cancel = vi.spyOn(begun.reservation, "cancel");

  controller.observeAcceptedEvent({ notification: eventTurnCompleted, replay: "live" });
  await expect.poll(() => controller.getSnapshot().ordinaryQueuedCount).toBe(1);

  await screen.getByRole("button", { name: "Close", exact: true }).click();

  expect(cancel).toHaveBeenCalledOnce();
  await expect.poll(() => controller.getSnapshot().ordinaryQueuedCount).toBe(0);
  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(composer).toHaveFocus();
});

test("keeps live-owner management failures in the Drawer as an alert", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 7, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-race", "ordinary", {
          type: "text",
          text: "Racing queued message",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.element(dialog.getByText("Pending message changed", { exact: true })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "This message has entered the sending process and can no longer be managed.",
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect.element(dialog).toBeVisible();
  expect(harness.controller.getSnapshot().ordinaryQueuedCount).toBe(1);
});

test("keeps a last unsent steer target invalidation in the Drawer without settling its reservation", async () => {
  const commandHandle = createGuiHostCommands();
  const steerRequest = deferred<Awaited<ReturnType<GuiHostCommands["steerTurn"]>>>();
  vi.mocked(commandHandle.steerTurn).mockReturnValue(steerRequest.promise);
  const event = eventTurnStarted;
  if (event.event.type !== "turnStarted") throw new Error("fixture must be turnStarted");
  const controller = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: event.event.notification.turn.id,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
    interruptTurn: commandHandle.interruptTurn,
  });
  const beginEdit = vi.spyOn(controller, "beginPendingInputEdit");
  const screen = await renderAttached(commandHandle, false, "en", controller);
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));
  const composer = getComposer(screen);

  await composer.fill("Already issued steer");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await composer.fill("Still unsent steer");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Guide 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });

  await expect
    .element(dialog.getByText("This message has entered the sending process.", { exact: true }))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: "Edit", exact: true }).all().length).toBe(1);
  expect(dialog.getByRole("button", { name: "Delete", exact: true }).all().length).toBe(1);

  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toHaveTextContent("Still unsent steer");
  const begun = beginEdit.mock.results.at(0)?.value;
  if (begun?.type !== "begun") throw new Error("unsent steer edit must begin");
  const save = vi.spyOn(begun.reservation, "save");
  const cancel = vi.spyOn(begun.reservation, "cancel");

  controller.observeAcceptedEvent({ notification: eventTurnCompleted, replay: "live" });

  await expect.poll(() => controller.getSnapshot().guidingCount).toBe(0);
  const heldDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(heldDialog.getByText("Pending message changed", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      heldDialog.getByText("The target turn closed before the edit was saved.", { exact: true }),
    )
    .toBeVisible();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  await expect.element(heldDialog.getByRole("heading", { name: "Pending details" })).toHaveFocus();
  await heldDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect.element(heldDialog).not.toBeInTheDocument();
  await expect.element(composer).toHaveFocus();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});

test("tears down an active edit without settling the old reservation when its owner is disposed", async () => {
  const commandHandle = createGuiHostCommands();
  const skillCatalog = createSkillCatalogHarness();
  const event = eventTurnStarted;
  if (event.event.type !== "turnStarted") throw new Error("fixture must be turnStarted");
  const controller = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: event.event.notification.turn.id,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
    interruptTurn: commandHandle.interruptTurn,
  });
  const beginEdit = vi.spyOn(controller, "beginPendingInputEdit");
  const screen = await renderAttached(
    commandHandle,
    false,
    "en",
    controller,
    skillCatalog.controller,
  );
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));
  const composer = getComposer(screen);

  await composer.fill("Owner-bound queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toBeVisible();
  const begun = beginEdit.mock.results.at(0)?.value;
  if (begun?.type !== "begun") throw new Error("owner-bound edit must begin");
  const save = vi.spyOn(begun.reservation, "save");
  const cancel = vi.spyOn(begun.reservation, "cancel");

  controller.dispose("ownerReplaced");
  await screen.rerender(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        authorizationToken={null}
        commands={commandHandle}
        composerInputQueueController={null}
        guardCompositionEndEnter={false}
        guiHostStatus={initializedStatus}
        routeTarget={{ type: "currentTask", threadId }}
        skillCatalogController={skillCatalog.controller}
      />
    </>,
  );

  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  await expect.element(getComposer(screen)).toHaveFocus();
});

test("restores delete focus only to a neighbor in the same lane", async () => {
  const commandHandle = createGuiHostCommands();
  const event = eventTurnStarted;
  if (event.event.type !== "turnStarted") throw new Error("fixture must be turnStarted");
  const controller = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: event.event.notification.turn.id,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
    interruptTurn: commandHandle.interruptTurn,
  });
  const screen = await renderAttached(commandHandle, false, "en", controller);
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));
  const composer = getComposer(screen);

  await composer.fill("First ordinary neighbor");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Second ordinary neighbor");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const firstItem = dialog.getByRole("group", { name: "First ordinary neighbor", exact: true });
  await firstItem.getByRole("button", { name: "Delete", exact: true }).click();
  await firstItem.getByRole("button", { name: "Delete", exact: true }).click();

  const secondItem = dialog.getByRole("group", { name: "Second ordinary neighbor", exact: true });
  await expect.element(secondItem).toHaveFocus();
  await expect
    .element(dialog.getByText("First ordinary neighbor", { exact: true }))
    .not.toBeInTheDocument();
});

test("keeps the Drawer open when a pending-input detail is missing", async () => {
  const previewText = "Missing detail preview...";
  const item = pendingInputItem("missing-detail", "steer", {
    type: "text",
    text: previewText,
    truncated: true,
  });
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    { ordinary: [], steer: [item] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );

  await screen.getByRole("button", { name: "Pending: Guide 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const expand = dialog.getByRole("button", {
    name: `Expand pending message: ${previewText}`,
    exact: true,
  });
  await expand.click();

  await expect.element(dialog).toBeVisible();
  await expect.element(expand).toBeVisible();
  expect(harness.readPendingInputDetail).toHaveBeenCalledExactlyOnceWith({
    key: item.key,
    revision: 1,
  });
});

test("uses one pending trigger for either lane and hides it when both lanes are empty", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-only", "ordinary", {
          type: "text",
          text: "Ordinary only",
          truncated: false,
        }),
      ],
      steer: [
        pendingInputItem("steer-only", "steer", {
          type: "text",
          text: "Guide only",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );
  const region = screen.getByRole("region", { name: "Pending messages", exact: true });

  const guideTrigger = region.getByRole("button", {
    name: "Pending: Guide 1",
    exact: true,
  });
  await expect.element(guideTrigger).toBeVisible();
  await expect.element(guideTrigger).toHaveTextContent("Guide 1");
  await expect.element(guideTrigger).not.toHaveTextContent("Queued");

  harness.publish(queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 2, canStop: true }));
  const queuedTrigger = region.getByRole("button", {
    name: "Pending: Queued 1",
    exact: true,
  });
  await expect.element(queuedTrigger).toBeVisible();
  await expect.element(queuedTrigger).toHaveTextContent("Queued 1");
  await expect.element(queuedTrigger).not.toHaveTextContent("Guide");

  harness.publish(queueSnapshot({ detailRevision: 3, canStop: true }));
  await expect.element(region).not.toBeInTheDocument();
});

test("closes and clears pending details when counts become empty", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-to-clear", "ordinary", {
          type: "text",
          text: "Clear this pending detail",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(dialog.getByText("Clear this pending detail", { exact: true }))
    .toBeVisible();

  harness.publish(queueSnapshot({ detailRevision: 2, canStop: true }));

  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Clear this pending detail", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(getComposer(screen)).toHaveFocus();
  await expect
    .element(screen.getByRole("region", { name: "Pending messages", exact: true }))
    .not.toBeInTheDocument();
});

test("closes and clears pending details when the queue owner is replaced", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [],
      steer: [
        pendingInputItem("steer-owner", "steer", {
          type: "text",
          text: "Old owner detail",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );

  await screen.getByRole("button", { name: "Pending: Guide 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(dialog.getByText("Old owner detail", { exact: true })).toBeVisible();

  harness.replaceOwnerThreadId("replacement-thread");

  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Old owner detail", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(getComposer(screen)).toHaveFocus();
});

test("renders Simplified Chinese guide and pending-input copy", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: 2,
      guidingCount: 1,
      detailRevision: 1,
      rejectedSteers: [
        {
          key: "rejected-zh",
          preview: { type: "text", text: "然后优先发送这条", truncated: false },
          reason: "activeTurnNotSteerable",
        },
      ],
      hasUnknownSteer: true,
      canStop: true,
    }),
    {
      ordinary: [
        pendingInputItem("ordinary-zh-a", "ordinary", {
          type: "text",
          text: "普通消息一",
          truncated: false,
        }),
        pendingInputItem("ordinary-zh-b", "ordinary", {
          type: "text",
          text: "普通消息二",
          truncated: false,
        }),
      ],
      steer: [
        pendingInputItem("pending-zh", "steer", {
          type: "text",
          text: "先引导这条",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "zh-CN", harness.controller);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );

  await expect.element(screen.getByRole("button", { name: "引导", exact: true })).toBeDisabled();
  const region = screen.getByRole("region", { name: "待处理消息", exact: true });
  const trigger = region.getByRole("button", {
    name: "待处理：引导 1，排队 2",
    exact: true,
  });
  await expect.element(trigger).toBeVisible();
  await expect.element(region.getByText("将优先发送", { exact: true })).toBeVisible();
  await expect.element(region.getByText("当前无法引导，已加入队列", { exact: true })).toBeVisible();
  await expect.element(region.getByText("引导状态未知", { exact: true })).toBeVisible();
  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "待处理详情", exact: true });
  await expect.element(dialog.getByRole("heading", { name: "引导中" })).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "已排队" })).toBeVisible();
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
  const initialSnapshot = queueSnapshot({
    recoveryCount: 2,
    recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
  });
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
  const harness = createQueueControllerHarness(
    queueSnapshot({
      recoveryCount: 2,
      recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
    }),
  );
  const screen = await renderAttached(null, false, "en", harness.controller);
  const composer = getComposer(screen);
  const recoverButton = screen.getByRole("button", { name: "Continue sending" });

  await expect.element(composer).toHaveAttribute("contenteditable", "false");
  await expect.element(recoverButton).toBeDisabled();
});

test("guards recovery while manual reconnect is required", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      recoveryCount: 2,
      recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
    }),
  );
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

test("accepted stop remains pending until its matching terminal", async () => {
  const { composer, controller, interruptTurn, pending, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  expect(interruptTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    turnId: eventTurnStarted.event.notification.turn.id,
  });

  pending.resolve({});
  await expect.poll(() => controller.getSnapshot().interrupt?.phase).toBe("accepted");
  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");

  controller.observeAcceptedEvent({
    notification: turnCompleted(eventTurnCompleted, "commit-pending-stop", {
      ...eventTurnStarted.event.notification.turn,
      status: "interrupted",
    }),
    replay: "live",
  });

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).not.toHaveAttribute("data-pending");
});

test("unknown stop delivery keeps its pending owner and prevents retry", async () => {
  const { composer, interruptTurn, pending, screen, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  pending.reject(new Error("interrupt failed"));

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
  await expect.element(screen.getByText("Stop failed")).not.toBeInTheDocument();
  await expect.element(screen.getByText("interrupt failed")).not.toBeInTheDocument();
  expect(interruptTurn).toHaveBeenCalledTimes(1);
});

test("definite stop failure keeps the draft, reports failure, and allows retry", async () => {
  const { composer, interruptTurn, pending, screen, stopButton } =
    await beginPendingStop("Draft while stopping");

  pending.reject(
    new GuiHostCommandError({
      error: new Error("interrupt rejected"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );

  await expect.element(screen.getByRole("status")).toHaveTextContent("Stop failed");
  await expect.element(stopButton).toBeEnabled();
  await expect.element(stopButton).not.toHaveAttribute("data-pending");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
  await expect.element(screen.getByText("interrupt rejected")).not.toBeInTheDocument();
  expect(interruptTurn).toHaveBeenCalledTimes(1);
});
