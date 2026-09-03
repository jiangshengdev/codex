import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  attachResponse,
  createGuiHostCommands,
  emitProjectionDelta,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessageDelta,
  agentMessage,
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  selectTranscriptEntry,
  transcriptEntryIdFor,
} from "@/features/transcriptState/transcriptStateSlice";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
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

const initializeAppWithProjection = (
  options: StartGuiHostConnectionOptions,
  response = attachResponse,
  commands = createGuiHostCommands(),
): GuiHostCommands => {
  queueAttachProjectionResponse(commands, response);
  initializeHost(options, commands);
  return commands;
};

afterEach(() => {
  scrollToDocumentTop();
});

test("App batches accepted projection deltas until the next animation frame", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const screen = await renderWithProviders(<App />);
    const { store } = screen;
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-batch", "");
    const commands = createGuiHostCommands();

    queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, []));
    initializeHost(options, commands);
    await expect
      .poll(() => selectThreadRuntimeRecord(store.getState())?.threadId)
      .toBe(launchThreadId);
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
    const commands = createGuiHostCommands();

    queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, []));
    initializeHost(options, commands);
    await expect
      .poll(() => selectThreadRuntimeRecord(store.getState())?.threadId)
      .toBe(launchThreadId);
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

test("App keeps the document pinned to the bottom after attaching a long transcript", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  scrollToDocumentBottom();
  initializeAppWithProjection(
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

  initializeAppWithProjection(
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

  initializeAppWithProjection(
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

  initializeAppWithProjection(
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
  const nativeIntersectionObserverDescriptor = Object.getOwnPropertyDescriptor(
    window,
    "IntersectionObserver",
  );
  if (nativeIntersectionObserverDescriptor == null) {
    throw new Error("window.IntersectionObserver descriptor must be available");
  }

  const NativeIntersectionObserver = window.IntersectionObserver;
  const delayedNonIntersectingCallbacks: (() => void)[] = [];

  // IntersectionObserver notifications use a separate task source, so hold the non-intersecting
  // callback to exercise that valid delayed schedule.
  class DelayedNonIntersectingIntersectionObserver extends NativeIntersectionObserver {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      super((entries, observer) => {
        if (entries.some((entry) => !entry.isIntersecting)) {
          delayedNonIntersectingCallbacks.push(() => {
            callback(entries, observer);
          });
          return;
        }

        callback(entries, observer);
      }, options);
    }
  }

  Object.defineProperty(window, "IntersectionObserver", {
    ...nativeIntersectionObserverDescriptor,
    value: DelayedNonIntersectingIntersectionObserver,
  });

  try {
    const screen = await renderWithProviders(<App />);
    const options = getHostOptions(startGuiHostConnectionMock);

    initializeAppWithProjection(
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
  } finally {
    delayedNonIntersectingCallbacks.length = 0;
    Object.defineProperty(window, "IntersectionObserver", nativeIntersectionObserverDescriptor);
  }
});

test("App cancels pending projection delta frame dispatch when unmounted", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const screen = await renderWithProviders(<App />);
    const { store } = screen;
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-cleanup", "");

    initializeAppWithProjection(options, attachWithTurns(attachResponse, []));
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

    const entryId = transcriptEntryIdFor("turn-raf-cleanup", "agent-raf-cleanup");
    const baselineEntry = {
      type: "live",
      id: "agent-raf-cleanup",
      key: entryId,
      turnId: "turn-raf-cleanup",
      itemId: "agent-raf-cleanup",
      status: "started",
      initialItem,
      transientText: "",
      revision: 0,
    } as const;
    await expect
      .poll(() => store.getState().transcriptState.entriesById[entryId])
      .toStrictEqual(baselineEntry);
    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-cleanup", "agent-raf-cleanup", "Lost"),
    );
    await screen.unmount();
    vi.advanceTimersToNextFrame();

    expect(getCleanupConnectionCallCount()).toBe(1);
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual(baselineEntry);
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
