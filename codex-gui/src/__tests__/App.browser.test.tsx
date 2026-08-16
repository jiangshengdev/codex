import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import {
  attachProjection,
  attachResponse,
  attachWithCommittedMessages,
  createGuiHostCommands,
  emitProjectionClosed,
  emitProjectionDelta,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getHostOptions,
  launchThreadId,
  markCommandsReady,
  markCommandsUnavailable,
  markHostAttached,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import RootApp from "@/App";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import {
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessageDelta,
  agentMessage,
  attachWithHeadCommitId,
  attachWithThreadId,
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  turnCompleted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { selectThreadIdentityState } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectTranscriptEntry,
  transcriptEntryIdFor,
} from "@/features/transcriptState/transcriptStateSlice";
import {
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));
vi.mock("@/features/composerInputQueue/composerInputQueueCoordinator", { spy: true });

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

function App() {
  const [router] = useState(() => {
    const rootRoute = createRootRoute({ component: RootApp });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: CurrentTaskPage,
    });

    return createRouter({
      history: createMemoryHistory({ initialEntries: ["/"] }),
      routeTree: rootRoute.addChildren([indexRoute]),
    });
  });

  return <RouterProvider router={router} />;
}

const startTurnParamsAt = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  index: number,
): Parameters<GuiHostCommands["startTurn"]>[0] => {
  const call = startTurn.mock.calls.at(index);
  if (call == null) {
    throw new Error(`startTurn call ${String(index + 1)} must be recorded`);
  }
  return call[0];
};

const expectStartTurnCalledOnceWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledOnce();
  const params = startTurnParamsAt(startTurn, 0);
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

const expectStartTurnSecondCallWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledTimes(2);
  const params = startTurnParamsAt(startTurn, 1);
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenNthCalledWith(2, {
    threadId: launchThreadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
});

const longTranscriptText = (label: string): string =>
  Array.from({ length: 96 }, (_, index) => `${label} line ${String(index + 1)}`).join("\n");

const documentScroller = (): HTMLElement => {
  const scroller = document.scrollingElement;
  if (!(scroller instanceof HTMLElement)) {
    throw new Error("document.scrollingElement must be available");
  }

  return scroller;
};

const scrollToDocumentBottom = (): void => {
  const scroller = documentScroller();
  window.scrollTo({ top: scroller.scrollHeight });
};

const scrollToDocumentTop = (): void => {
  window.scrollTo({ top: 0 });
};

const distanceFromDocumentBottom = (): number => {
  const scroller = documentScroller();
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
};

const expectDocumentAtBottom = (): void => {
  expect(distanceFromDocumentBottom()).toBeLessThanOrEqual(4);
};

const expectElementBottomAlignedWithViewport = (element: HTMLElement): void => {
  const { bottom } = element.getBoundingClientRect();
  expect(Math.abs(window.innerHeight - bottom)).toBeLessThanOrEqual(1);
};

const waitForBrowserFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

const expectDocumentScrollStaysAwayFromBottom = async (maxScrollTop: number): Promise<void> => {
  const startTime = performance.now();

  for (;;) {
    expect(documentScroller().scrollTop).toBeLessThanOrEqual(maxScrollTop);
    expect(distanceFromDocumentBottom()).toBeGreaterThan(40);

    if (performance.now() - startTime >= 150) {
      return;
    }

    await waitForBrowserFrame();
  }
};

const renderReadyApp = async (commandHandle = createGuiHostCommands()) => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options);
  markHostAttached(options);
  markCommandsReady(options, commandHandle);

  return { commandHandle, options, screen };
};

const renderActiveApp = async () => {
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: inProgressTurn("turn-started-from-app"),
  });
  const commandHandle: GuiHostCommands = {
    ...createGuiHostCommands(),
    startTurn,
  };
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const activeTurn = inProgressTurn("turn-active-queue");

  attachProjection(options, attachWithTurns(attachResponse, [activeTurn]));
  markHostAttached(options);
  markCommandsReady(options, commandHandle);

  return { activeTurn, options, screen, startTurn };
};

const expectAppComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  for (const control of [
    screen.getByPlaceholder("Message Codex"),
    screen.getByRole("button", { name: "Send", exact: true }),
    screen.getByRole("button", { name: "Stop" }),
  ]) {
    await expect.element(control).toBeDisabled();
  }
};

afterEach(() => {
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
  scrollToDocumentTop();
});

test("App renders the committed transcript shell without visible host debug details", async () => {
  const screen = await renderWithProviders(<App />);
  const topNotices = screen.container.querySelector("[data-app-shell-top-notices]");

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "connecting");
  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
  expect(topNotices).toBeNull();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});

test("App renders composer in the shell without visible host debug details", async () => {
  const screen = await renderWithProviders(<App />);
  const main = screen.getByRole("main").element();
  const transcriptBottomSentinel = screen.container.querySelector(
    ".committed-transcript-bottom-sentinel",
  );
  const composerShell = screen.container.querySelector('[aria-label="Message composer"]');

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
  expect(main.classList.contains("pb-44")).toBe(false);
  expect(main.classList.contains("px-4")).toBe(false);
  expect(main.classList.contains("py-6")).toBe(false);
  expect(main.classList.contains("sm:px-6")).toBe(false);
  expect(main.classList.contains("lg:px-8")).toBe(false);
  if (
    !(transcriptBottomSentinel instanceof HTMLElement) ||
    !(composerShell instanceof HTMLElement)
  ) {
    throw new Error("transcript sentinel and composer shell must render");
  }
  expect(
    transcriptBottomSentinel.compareDocumentPosition(composerShell) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expectElementBottomAlignedWithViewport(composerShell);
});

test("App keeps the transcript surface flush with the shell padding", async () => {
  const screen = await renderWithProviders(<App />);
  const transcript = screen.container.querySelector('[aria-label="Committed transcript"]');
  const surface = transcript?.parentElement;

  if (!(surface instanceof HTMLElement)) {
    throw new Error("transcript surface container must render");
  }

  expect(surface.classList.contains("p-4")).toBe(false);
  expect(surface.classList.contains("sm:p-6")).toBe(false);
});

test("App keeps host lifecycle status stable while projection events update runtime", async () => {
  const screen = await renderWithProviders(<App />);
  const { store } = screen;
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options);
  markHostAttached(options);
  emitProjectionEvent(options, eventTurnStarted);

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "attached");
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: eventTurnStarted, replay: "live" },
  ]);
});

test("App displays GUI host startup errors in the sticky top notices region", async () => {
  startGuiHostConnectionMock.mockImplementation(() => {
    throw new Error("Missing launch token fragment");
  });

  const screen = await renderWithProviders(<App />);
  const topNotices = screen.container.querySelector("[data-app-shell-top-notices]");
  const banner = screen.getByRole("banner").element();
  const main = screen.getByRole("main").element();
  const errorTitle = screen.getByText("Unable to start Codex GUI").element();
  const errorMessage = screen.getByText("Missing launch token fragment").element();

  if (!(topNotices instanceof HTMLElement)) {
    throw new Error("top notices region must render");
  }
  const topNoticesContent = topNotices.firstElementChild;
  if (!(topNoticesContent instanceof HTMLElement)) {
    throw new Error("top notices content must render");
  }

  await expect.element(screen.getByRole("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
  await expect.element(screen.getByText("Missing launch token fragment")).toBeVisible();
  expect(topNotices.classList.contains("sticky")).toBe(true);
  expect(topNotices.classList.contains("z-20")).toBe(true);
  expect(banner.compareDocumentPosition(topNotices) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(topNotices.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(topNotices.contains(errorTitle)).toBe(true);
  expect(topNotices.contains(errorMessage)).toBe(true);
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
});

test("App localizes the GUI host startup error title without translating its details", async () => {
  startGuiHostConnectionMock.mockImplementation(() => {
    throw new Error("Missing launch token fragment");
  });

  const screen = await renderWithProviders(<App />, { locale: "zh-CN" });

  await expect.element(screen.getByText("无法启动 Codex GUI")).toBeVisible();
  await expect.element(screen.getByText("Missing launch token fragment")).toBeVisible();
});

test("App dispatches accepted host projection payloads into thread runtime", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStarted;
  const threadId = attachResponse.snapshot.thread.id;
  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options);
  emitProjectionEvent(options, projectionEvent);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId: threadId,
    attachedThreadId: threadId,
    attachStatus: "attached",
  });

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.threadId).toBe(threadId);
  expect(runtime?.sessionId).toBe(attachResponse.snapshot.thread.sessionId);
  expect(runtime?.snapshotTurns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(runtime?.activeTurnId).toBe(projectionEvent.event.notification.turn.id);
  expect(runtime?.eventBuffer).toStrictEqual([
    { type: "projectionEvent", notification: projectionEvent, replay: "live" },
  ]);
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "active",
  });
});

test("App batches accepted projection deltas until the next animation frame", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const screen = await renderWithProviders(<App />);
    const { store } = screen;
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-batch", "");

    attachProjection(options, attachWithTurns(attachResponse, []));
    const turnStartedEvent = turnStarted(
      eventTurnStarted,
      "commit-raf-batch-turn",
      inProgressTurn("turn-raf-batch"),
    );
    const itemStartedEvent = eventWithEnvelope(
      itemStarted(eventItemStarted, "commit-raf-batch-started", "turn-raf-batch", initialItem),
      { parentCommitId: turnStartedEvent.commitId },
    );
    emitProjectionEvent(options, turnStartedEvent);
    emitProjectionEvent(options, itemStartedEvent);

    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-batch", "agent-raf-batch", "Hello"),
    );
    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-batch", "agent-raf-batch", " world"),
    );

    const entryId = transcriptEntryIdFor("turn-raf-batch", "agent-raf-batch");
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "live",
      id: "agent-raf-batch",
      key: entryId,
      turnId: "turn-raf-batch",
      itemId: "agent-raf-batch",
      status: "started",
      initialItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();

    vi.advanceTimersToNextFrame();

    await expect.element(screen.getByText("Hello world")).toBeVisible();

    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "live",
      id: "agent-raf-batch",
      key: entryId,
      turnId: "turn-raf-batch",
      itemId: "agent-raf-batch",
      status: "streaming",
      initialItem,
      transientText: "Hello world",
      revision: 1,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual({
      type: "message",
      id: "agent-raf-batch",
      turnId: "turn-raf-batch",
      role: "assistant",
      rendering: { mode: "streamingMarkdown", source: "Hello world" },
      revision: 1,
    });
  } finally {
    vi.useRealTimers();
  }
});

test("App flushes pending projection deltas before structural projection events", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const { store } = await renderWithProviders(<App />);
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-flush-event", "");

    attachProjection(options, attachWithTurns(attachResponse, []));
    const turnStartedEvent = turnStarted(
      eventTurnStarted,
      "commit-raf-flush-event-turn",
      inProgressTurn("turn-raf-flush-event"),
    );
    const itemStartedEvent = eventWithEnvelope(
      itemStarted(
        eventItemStarted,
        "commit-raf-flush-event-started",
        "turn-raf-flush-event",
        initialItem,
      ),
      { parentCommitId: turnStartedEvent.commitId },
    );
    const itemCompletedEvent = eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "commit-raf-flush-event-completed",
        "turn-raf-flush-event",
        agentMessage("agent-raf-flush-event", "Completed answer"),
      ),
      { parentCommitId: itemStartedEvent.commitId },
    );
    emitProjectionEvent(options, turnStartedEvent);
    emitProjectionEvent(options, itemStartedEvent);

    emitProjectionDelta(
      options,
      agentMessageDelta(
        eventAgentMessageDelta,
        "turn-raf-flush-event",
        "agent-raf-flush-event",
        "Transient before completion",
      ),
    );
    emitProjectionEvent(options, itemCompletedEvent);

    const entryId = transcriptEntryIdFor("turn-raf-flush-event", "agent-raf-flush-event");
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "message",
      id: "agent-raf-flush-event",
      turnId: "turn-raf-flush-event",
      role: "assistant",
      source: "Completed answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 2,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual({
      type: "message",
      id: "agent-raf-flush-event",
      turnId: "turn-raf-flush-event",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Completed answer" },
      revision: 2,
    });
  } finally {
    vi.useRealTimers();
  }
});

test("App classifies snapshot-ahead projection events as snapshot duplicate replay", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const snapshotAheadAttach = attachWithTurns(attachResponse, [
    eventTurnStarted.event.notification.turn,
  ]);
  const snapshotAheadWithOldHead = attachWithHeadCommitId(
    snapshotAheadAttach,
    eventTurnStarted.parentCommitId,
  );

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options, snapshotAheadWithOldHead);
  emitProjectionEvent(options, eventTurnStarted);

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.snapshotTurns).toStrictEqual([eventTurnStarted.event.notification.turn]);
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: eventTurnStarted, replay: "snapshotDuplicate" },
  ]);
});

test("App replaces the replay baseline after an accepted replacement attach", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventSubscriptionReplacement.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const oldOnlyTurn = inProgressTurn("old-baseline-only");
  const replacementTurn = eventSubscriptionReplacement.event.notification.turn;
  const oldAttach = attachWithTurns(attachResponse, [oldOnlyTurn]);
  const replacementAttach = attachWithTurns(attachReplacement, [replacementTurn]);
  const oldOnlyEvent = eventWithEnvelope(
    turnStarted(eventSubscriptionReplacement, "commit-old-baseline-only", oldOnlyTurn),
    { parentCommitId: replacementAttach.snapshot.headCommitId },
  );
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options, oldAttach);
  attachProjection(options, replacementAttach);
  emitProjectionEvent(options, oldOnlyEvent);

  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: oldOnlyEvent, replay: "live" },
  ]);

  attachProjection(options, replacementAttach);
  emitProjectionEvent(options, eventSubscriptionReplacement);

  expect(selectThreadRuntimeRecord(store.getState())?.snapshotTurns).toStrictEqual([
    replacementTurn,
  ]);
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    {
      type: "projectionEvent",
      notification: eventSubscriptionReplacement,
      replay: "snapshotDuplicate",
    },
  ]);
});

test("App classifies from the new snapshot after new launch params and attach", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventSubscriptionReplacement.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const oldOnlyTurn = inProgressTurn("old-launch-baseline-only");
  const replacementTurn = eventSubscriptionReplacement.event.notification.turn;
  const oldAttach = attachWithTurns(attachResponse, [oldOnlyTurn]);
  const replacementAttach = attachWithTurns(attachReplacement, [replacementTurn]);
  const oldOnlyEvent = eventWithEnvelope(
    turnStarted(eventSubscriptionReplacement, "commit-old-launch-baseline", oldOnlyTurn),
    { parentCommitId: replacementAttach.snapshot.headCommitId },
  );
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options, oldAttach);
  options.onLaunchParams?.({ threadId: launchThreadId, token: "replacement-secret" });
  attachProjection(options, replacementAttach);
  emitProjectionEvent(options, oldOnlyEvent);

  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: oldOnlyEvent, replay: "live" },
  ]);

  options.onLaunchParams?.({ threadId: launchThreadId, token: "replacement-secret-2" });
  attachProjection(options, replacementAttach);
  emitProjectionEvent(options, eventSubscriptionReplacement);

  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    {
      type: "projectionEvent",
      notification: eventSubscriptionReplacement,
      replay: "snapshotDuplicate",
    },
  ]);
});

test("App passes ready commands to composer and sends plain text", async () => {
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: inProgressTurn("turn-started-from-app"),
  });
  const commandHandle: GuiHostCommands = { ...createGuiHostCommands(), startTurn };
  const { screen } = await renderReadyApp(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Hello from App composer");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  expectStartTurnCalledOnceWithText(startTurn, "Hello from App composer");
});

test("App queues during an active turn and starts exactly once after its live terminal event", async () => {
  const { activeTurn, options, screen, startTurn } = await renderActiveApp();

  await screen.getByPlaceholder("Message Codex").fill("Queued from active turn");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  await expect.element(screen.getByText("1 message queued")).toBeVisible();
  await expect.element(screen.getByText("Queued from active turn")).not.toBeInTheDocument();
  expect(startTurn).not.toHaveBeenCalled();

  const completed = turnCompleted(eventTurnCompleted, "commit-active-terminal", {
    ...activeTurn,
    status: "completed",
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(completed, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );

  expectStartTurnCalledOnceWithText(startTurn, "Queued from active turn");
  await expect.element(screen.getByText("Queued from active turn")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});

test("App does not auto-start interrupted messages and recovers them in FIFO order", async () => {
  const { activeTurn, options, screen, startTurn } = await renderActiveApp();
  const composer = screen.getByPlaceholder("Message Codex");

  await composer.fill("First interrupted message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Second interrupted message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  const interrupted = turnCompleted(eventTurnCompleted, "commit-active-interrupted", {
    ...activeTurn,
    status: "interrupted",
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(interrupted, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );

  await expect.element(screen.getByText("2 messages have not been sent")).toBeVisible();
  expect(startTurn).not.toHaveBeenCalled();
  await composer.fill("Draft preserved during recovery");
  await expect.element(composer).toBeEnabled();
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();

  await screen.getByRole("button", { name: "Continue sending" }).click();

  expectStartTurnCalledOnceWithText(startTurn, "First interrupted message");
  await expect.element(composer).toHaveValue("Draft preserved during recovery");

  const recoveredFirstCompleted = turnCompleted(
    eventTurnCompleted,
    "commit-recovered-first",
    baseTurn("turn-started-from-app"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredFirstCompleted, {
      parentCommitId: interrupted.commitId,
    }),
  );

  expectStartTurnSecondCallWithText(startTurn, "Second interrupted message");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  expect(startTurn).toHaveBeenCalledTimes(2);
  await expect.element(screen.getByText("1 message queued")).toBeVisible();
});

test("App enables Stop for the current active turn", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);
  const projectionEvent = eventTurnStarted;
  emitProjectionEvent(options, projectionEvent);

  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  await screen.getByRole("button", { name: "Stop" }).click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledWith({
    threadId: launchThreadId,
    turnId: projectionEvent.event.notification.turn.id,
  });
});

test("App shows a QR access popover before the Stop button", async () => {
  const { screen } = await renderReadyApp();

  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  const buttons = Array.from(screen.container.querySelectorAll("button"));
  const qrButtonElement = buttons.find(
    (button) => button.getAttribute("aria-label") === "Scan with phone",
  );
  const stopButtonElement = buttons.find((button) => button.textContent.trim() === "Stop");

  await expect.element(qrButton).toBeEnabled();
  if (qrButtonElement == null || stopButtonElement == null) {
    throw new Error("QR and Stop buttons must render");
  }
  expect(
    qrButtonElement.compareDocumentPosition(stopButtonElement) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);

  await qrButton.click();

  const expectedUrl = `${window.location.origin}/?threadId=${launchThreadId}#token=secret`;
  await expect.element(screen.getByRole("dialog", { name: "Scan with phone" })).toBeVisible();
  await expect.element(screen.getByLabelText("QR code for current GUI URL")).toBeVisible();
  await expect.element(screen.getByText(expectedUrl)).toBeVisible();
});

test("App disables QR access when launch params are unavailable", async () => {
  startGuiHostConnectionMock.mockImplementation((options) => {
    options.onStatus?.({ label: "connecting" });
    return () => undefined;
  });

  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("button", { name: "Scan with phone" })).toBeDisabled();
});

test("App renders committed transcript messages from an attached projection", async () => {
  const screen = await renderWithProviders(<App />);

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options, attachWithCommittedMessages());

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("Hello from App")).toBeVisible();
  await expect.element(screen.getByText("Committed App response")).toBeVisible();
});

test("App keeps the document pinned to the bottom after attaching a long transcript", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  scrollToDocumentBottom();
  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-attach", [
        agentMessage("agent-scroll-attach", longTranscriptText("Attached transcript")),
      ]),
    ]),
  );

  await expect.element(screen.getByText("Attached transcript line 96")).toBeVisible();
  await vi.waitFor(expectDocumentAtBottom);
});

test("App keeps the document pinned to the bottom after a live committed message", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live", [
        agentMessage("agent-scroll-live-existing", longTranscriptText("Existing transcript")),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Existing transcript line 96")).toBeVisible();
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "commit-scroll-live-new",
        "turn-scroll-live",
        agentMessage("agent-scroll-live-new", "Live sticky bottom message"),
      ),
      {
        // attachResponse.snapshot.headCommitId is null, so override the fixture parent to test
        // sticky-bottom behavior rather than the commit-chain mismatch path.
        parentCommitId: null,
      },
    ),
  );

  await expect.element(screen.getByText("Live sticky bottom message")).toBeVisible();
  await vi.waitFor(expectDocumentAtBottom);
});

test("App does not force the document to the bottom after a live message when the user scrolled up", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-away", [
        agentMessage("agent-scroll-away-existing", longTranscriptText("Scrollable transcript")),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Scrollable transcript line 96")).toBeVisible();
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  const scroller = documentScroller();
  scrollToDocumentTop();
  await waitForBrowserFrame();
  await waitForBrowserFrame();
  const scrollTopBeforeMessage = scroller.scrollTop;
  expect(distanceFromDocumentBottom()).toBeGreaterThan(40);

  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "commit-scroll-away-new",
        "turn-scroll-away",
        agentMessage("agent-scroll-away-new", "Message while reading history"),
      ),
      {
        // attachResponse.snapshot.headCommitId is null, so override the fixture parent to test
        // sticky-bottom behavior rather than the commit-chain mismatch path.
        parentCommitId: null,
      },
    ),
  );

  await expect.element(screen.getByText("Message while reading history")).toBeVisible();
  await expectDocumentScrollStaysAwayFromBottom(scrollTopBeforeMessage + 4);
});

test("App keeps the document pinned to the bottom after a live assistant delta", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live-delta-history", [
        agentMessage(
          "agent-scroll-live-delta-existing",
          longTranscriptText("Existing delta transcript"),
        ),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Existing delta transcript line 96")).toBeVisible();

  const turnStartedEvent = turnStarted(
    eventTurnStarted,
    "commit-scroll-live-delta-turn",
    inProgressTurn("turn-scroll-live-delta"),
  );
  const itemStartedEvent = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-scroll-live-delta-started",
      "turn-scroll-live-delta",
      agentMessage("agent-scroll-live-delta", ""),
    ),
    { parentCommitId: turnStartedEvent.commitId },
  );

  emitProjectionEvent(options, eventWithEnvelope(turnStartedEvent, { parentCommitId: null }));
  emitProjectionEvent(options, itemStartedEvent);
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  const scrollToSpy = vi.spyOn(documentScroller(), "scrollTo");
  try {
    emitProjectionDelta(
      options,
      agentMessageDelta(
        eventAgentMessageDelta,
        "turn-scroll-live-delta",
        "agent-scroll-live-delta",
        longTranscriptText("Streaming delta transcript"),
      ),
    );
    await waitForBrowserFrame();

    await expect.element(screen.getByText("Streaming delta transcript line 96")).toBeVisible();
    await vi.waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalled();
    });
    await vi.waitFor(expectDocumentAtBottom);
  } finally {
    scrollToSpy.mockRestore();
  }
});

test("App does not force the document to the bottom after a live assistant delta when the user scrolled up", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live-delta-away-history", [
        agentMessage(
          "agent-scroll-live-delta-away-existing",
          longTranscriptText("Readable delta transcript"),
        ),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Readable delta transcript line 96")).toBeVisible();

  const turnStartedEvent = turnStarted(
    eventTurnStarted,
    "commit-scroll-live-delta-away-turn",
    inProgressTurn("turn-scroll-live-delta-away"),
  );
  const itemStartedEvent = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-scroll-live-delta-away-started",
      "turn-scroll-live-delta-away",
      agentMessage("agent-scroll-live-delta-away", ""),
    ),
    { parentCommitId: turnStartedEvent.commitId },
  );

  emitProjectionEvent(options, eventWithEnvelope(turnStartedEvent, { parentCommitId: null }));
  emitProjectionEvent(options, itemStartedEvent);
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  const scroller = documentScroller();
  scrollToDocumentTop();
  await waitForBrowserFrame();
  await waitForBrowserFrame();
  const scrollTopBeforeDelta = scroller.scrollTop;
  expect(distanceFromDocumentBottom()).toBeGreaterThan(40);

  emitProjectionDelta(
    options,
    agentMessageDelta(
      eventAgentMessageDelta,
      "turn-scroll-live-delta-away",
      "agent-scroll-live-delta-away",
      longTranscriptText("Streaming while reading history"),
    ),
  );
  await waitForBrowserFrame();

  await expect.element(screen.getByText("Streaming while reading history line 96")).toBeVisible();
  await expectDocumentScrollStaysAwayFromBottom(scrollTopBeforeDelta + 4);
});

test("App keeps the accepted replay baseline after a mismatched attach", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const mismatchedThreadId = "00000000-0000-0000-0000-000000000999";
  const validAttach = attachWithTurns(attachResponse, [eventTurnStarted.event.notification.turn]);
  const validAttachWithOldHead = attachWithHeadCommitId(
    validAttach,
    eventTurnStarted.parentCommitId,
  );
  const mismatchedAttach = attachWithThreadId(attachResponse, mismatchedThreadId);

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options, validAttachWithOldHead);
  const runtimeBeforeMismatch = selectThreadRuntimeRecord(store.getState());
  attachProjection(options, mismatchedAttach);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId,
    attachedThreadId: mismatchedThreadId,
    attachStatus: "mismatch",
  });
  expect(selectThreadRuntimeRecord(store.getState())).toStrictEqual(runtimeBeforeMismatch);

  emitProjectionEvent(options, eventTurnStarted);

  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: eventTurnStarted, replay: "snapshotDuplicate" },
  ]);
});

test("App stops forwarding runtime events after backpressure requires manual reconnect", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStarted;
  const projectionClosed = closedBackpressure;

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options);
  emitProjectionClosed(options, projectionClosed);
  emitProjectionEvent(options, projectionEvent);

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.threadId).toBe(launchThreadId);
  expect(runtime?.snapshotTurns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "manualReconnectRequired",
    reason: "backpressure",
    subscriptionId: attachResponse.subscriptionId,
  });
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
});

test("App disables composer after projection backpressure requires reconnect", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);
  const projectionClosed = closedBackpressure;
  emitProjectionClosed(options, projectionClosed);

  await expectAppComposerDisabled(screen);
});

test("App disables composer when host commands become unavailable", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);

  await expect.element(screen.getByPlaceholder("Message Codex")).toBeEnabled();
  options.onCommandsUnavailable?.();

  await expectAppComposerDisabled(screen);
});

test("App records manual reconnect when a projection event breaks the baseline", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventItemStarted;

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options);
  emitProjectionEvent(options, projectionEvent);

  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "manualReconnectRequired",
    reason: "commitChainMismatch",
    subscriptionId: attachResponse.subscriptionId,
  });
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
});

test("App closes the host connection when unmounted", async () => {
  const screen = await renderWithProviders(<App />);

  await screen.unmount();

  expect(getCleanupConnectionCallCount()).toBe(1);
});

test("App owns one queue coordinator for the matching attached launch thread until cleanup", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  const createQueueCoordinator = vi.mocked(createComposerInputQueueCoordinator);
  const observeAcceptedEvent = vi.fn<ComposerInputQueueCoordinator["observeAcceptedEvent"]>();
  const dispose = vi.fn<ComposerInputQueueCoordinator["dispose"]>();
  const queueCoordinator = {
    submit: vi.fn<ComposerInputQueueCoordinator["submit"]>(),
    recover: vi.fn<ComposerInputQueueCoordinator["recover"]>(),
    observeAcceptedEvent,
    getSnapshot: vi.fn<ComposerInputQueueCoordinator["getSnapshot"]>().mockReturnValue({
      queuedCount: 0,
      recoveryCount: 0,
      isRecovering: false,
    }),
    subscribe: vi
      .fn<ComposerInputQueueCoordinator["subscribe"]>()
      .mockReturnValue(vi.fn<() => void>()),
    dispose,
  } satisfies ComposerInputQueueCoordinator;
  createQueueCoordinator.mockReturnValue(queueCoordinator);
  const mismatchedAttach = attachWithThreadId(attachResponse, "thread-mismatch");

  attachProjection(options, mismatchedAttach);
  markCommandsReady(options, commands);

  expect(createQueueCoordinator).not.toHaveBeenCalled();

  attachProjection(options, attachResponse);
  markCommandsReady(options, commands);

  expect(createQueueCoordinator).toHaveBeenCalledOnce();
  expect(createQueueCoordinator).toHaveBeenCalledWith({
    threadId: launchThreadId,
    activeTurnId: null,
    startTurn: commands.startTurn,
  });
  emitProjectionEvent(options, eventTurnStarted);

  expect(observeAcceptedEvent).toHaveBeenCalledOnce();
  expect(observeAcceptedEvent).toHaveBeenCalledWith({
    notification: eventTurnStarted,
    replay: "live",
  });

  attachProjection(options, mismatchedAttach);
  markCommandsUnavailable(options);

  expect(createQueueCoordinator).toHaveBeenCalledOnce();
  expect(dispose).not.toHaveBeenCalled();

  await screen.unmount();

  expect(dispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);

  emitProjectionEvent(options, eventTurnStarted);
  attachProjection(options, attachResponse);
  markCommandsReady(options, commands);

  expect(observeAcceptedEvent).toHaveBeenCalledOnce();
  expect(createQueueCoordinator).toHaveBeenCalledOnce();
});

test("App cancels pending projection delta frame dispatch when unmounted", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const screen = await renderWithProviders(<App />);
    const { store } = screen;
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-cleanup", "");

    attachProjection(options, attachWithTurns(attachResponse, []));
    const turnStartedEvent = turnStarted(
      eventTurnStarted,
      "commit-raf-cleanup-turn",
      inProgressTurn("turn-raf-cleanup"),
    );
    const itemStartedEvent = eventWithEnvelope(
      itemStarted(eventItemStarted, "commit-raf-cleanup-started", "turn-raf-cleanup", initialItem),
      { parentCommitId: turnStartedEvent.commitId },
    );
    emitProjectionEvent(options, turnStartedEvent);
    emitProjectionEvent(options, itemStartedEvent);
    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-cleanup", "agent-raf-cleanup", "Lost"),
    );

    await screen.unmount();
    vi.advanceTimersToNextFrame();

    expect(getCleanupConnectionCallCount()).toBe(1);
    const entryId = transcriptEntryIdFor("turn-raf-cleanup", "agent-raf-cleanup");
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "live",
      id: "agent-raf-cleanup",
      key: entryId,
      turnId: "turn-raf-cleanup",
      itemId: "agent-raf-cleanup",
      status: "started",
      initialItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("App does not render optimistic user messages after send", async () => {
  const commandHandle = createGuiHostCommands();
  const { screen } = await renderReadyApp(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Not optimistic");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  await expect.element(screen.getByText("Not optimistic")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
