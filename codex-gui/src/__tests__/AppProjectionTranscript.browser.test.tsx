import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useEffect } from "react";
import {
  attachResponse,
  attachWithCommittedMessages,
  createGuiHostCommands,
  emitRawHostStatus,
  emitProjectionClosed,
  emitProjectionDelta,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getHostOptions,
  initializeHost,
  launchThreadId,
  markCommandsUnavailable,
  queueAttachProjectionResponse,
  queueDeferredAttachProjection,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import {
  useActiveThreadSession,
  useActiveThreadSessionSnapshot,
} from "@/features/appShell/AppCapabilities";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventSubscriptionReplacement,
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
vi.mock("@/features/composerInputQueue/composerInputQueueCoordinator", { spy: true });

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

const candidateThreadId = "00000000-0000-0000-0000-000000000002";
let threadSwitchProbeSession: ActiveThreadSession | null = null;

function ThreadSwitchCapabilityProbe() {
  const session = useActiveThreadSession();
  const snapshot = useActiveThreadSessionSnapshot();
  const available = snapshot.phase === "active" || snapshot.phase === "projectionUnavailable";
  useEffect(() => {
    threadSwitchProbeSession = session;
  }, [session]);

  return (
    <section aria-label="Thread switch capability probe">
      <button
        disabled={session == null || !available}
        onClick={() => {
          void session?.activate(candidateThreadId);
        }}
        type="button"
      >
        Continue candidate thread
      </button>
      <output aria-label="Active thread session">{available ? snapshot.threadId : "none"}</output>
      <output aria-label="Active skill catalog status">
        {available ? snapshot.skills.type : "none"}
      </output>
      <output aria-label="Active skill catalog">
        {available
          ? snapshot.skills.candidates.map(({ name }) => name).join(",") || "none"
          : "none"}
      </output>
    </section>
  );
}

const requireThreadSwitchProbeSession = (): ActiveThreadSession => {
  if (threadSwitchProbeSession == null) {
    throw new Error("thread switch probe must expose an active session");
  }
  return threadSwitchProbeSession;
};

const waitForThreadSwitchProbeSession = async () => {
  await expect
    .poll(() => {
      const snapshot = threadSwitchProbeSession?.getSnapshot();
      return snapshot?.phase === "active" || snapshot?.phase === "projectionUnavailable";
    })
    .toBe(true);
  const session = requireThreadSwitchProbeSession();
  const snapshot = session.getSnapshot();
  if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") {
    throw new Error("thread switch probe session must be available");
  }
  return { session, snapshot };
};

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
  threadSwitchProbeSession = null;
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

const getAppComposer = (screen: Awaited<ReturnType<typeof renderWithProviders>>) =>
  screen.getByRole("combobox", { name: "Message Codex", exact: true });

const renderReadyApp = async (commandHandle = createGuiHostCommands()) => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  queueAttachProjectionResponse(commandHandle);
  initializeHost(options, commandHandle);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");

  return { commandHandle, options, screen };
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

const expectAppComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "false");
  for (const control of [
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

test("App dispatches projection display facts and updates the active session", async () => {
  const { store } = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchCapabilityProbe} />,
  );
  const projectionEvent = eventTurnStarted;
  const threadId = attachResponse.snapshot.thread.id;
  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);
  await expect.poll(() => selectThreadRuntimeRecord(store.getState())?.threadId).toBe(threadId);
  emitProjectionEvent(options, projectionEvent);

  const { snapshot: sessionSnapshot } = await waitForThreadSwitchProbeSession();
  if (sessionSnapshot.phase !== "active") throw new Error("expected an active session");
  const { turns: _turns, ...thread } = attachResponse.snapshot.thread;
  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime).toStrictEqual({
    sessionRevision: sessionSnapshot.revision,
    threadId,
    thread,
    tokenUsage: attachResponse.snapshot.tokenUsage,
  });
  expect(sessionSnapshot.activeTurnId).toBe(projectionEvent.event.notification.turn.id);
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

test("App classifies snapshot-ahead projection events as snapshot duplicate replay", async () => {
  const { store } = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchCapabilityProbe} />,
  );
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
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(commands, snapshotAheadWithOldHead);
  initializeHost(options, commands);
  await expect
    .poll(() => selectThreadRuntimeRecord(store.getState())?.threadId)
    .toBe(launchThreadId);
  emitProjectionEvent(options, eventTurnStarted);

  const { snapshot } = await waitForThreadSwitchProbeSession();
  if (snapshot.phase !== "active") throw new Error("expected an active session");
  expect(snapshot.activeTurnId).toBe(eventTurnStarted.event.notification.turn.id);
  expect(selectThreadRuntimeRecord(store.getState())?.threadId).toBe(launchThreadId);
});

test("App replays startup notifications against the accepted attach baseline", async () => {
  await renderWithProviders(<App currentTaskComponent={ThreadSwitchCapabilityProbe} />);
  if (eventSubscriptionReplacement.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const oldOnlyTurn = inProgressTurn("old-baseline-only");
  const replacementTurn = eventSubscriptionReplacement.event.notification.turn;
  const replacementAttach = attachWithTurns(attachReplacement, [replacementTurn]);
  const oldOnlyEvent = eventWithEnvelope(
    turnStarted(eventSubscriptionReplacement, "commit-old-baseline-only", oldOnlyTurn),
    { parentCommitId: replacementAttach.snapshot.headCommitId },
  );
  const snapshotDuplicateEvent = eventWithEnvelope(eventSubscriptionReplacement, {
    parentCommitId: oldOnlyEvent.commitId,
  });
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  const pendingAttach = queueDeferredAttachProjection(commands);

  initializeHost(options, commands);
  await expect.poll(pendingAttach.getState).toBe("pending");
  emitProjectionEvent(options, oldOnlyEvent);
  emitProjectionEvent(options, snapshotDuplicateEvent);
  pendingAttach.resolve(replacementAttach);

  await expect
    .poll(() => {
      const snapshot = threadSwitchProbeSession?.getSnapshot();
      return snapshot?.phase === "active" ? snapshot.activeTurnId : null;
    })
    .toBe(oldOnlyTurn.id);
});

test("App does not publish a late startup session or overwrite a terminal host error", async () => {
  const commands = createGuiHostCommands();
  const pendingAttach = queueDeferredAttachProjection(commands);
  const screen = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchCapabilityProbe} />,
  );
  const options = getHostOptions(startGuiHostConnectionMock);
  const activeThread = screen.getByLabelText("Active thread session");
  const continueButton = screen.getByRole("button", { name: "Continue candidate thread" });

  initializeHost(options, commands);
  await expect.poll(pendingAttach.getState).toBe("pending");
  await expect.poll(() => threadSwitchProbeSession).toBeNull();
  await expect.element(continueButton).toBeDisabled();
  markCommandsUnavailable(options);
  emitRawHostStatus(options, { label: "error", message: "GUI host transport failed" });
  pendingAttach.reject(new Error("late attach failure"));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  await expect.element(activeThread).toHaveTextContent("none");
  await expect.element(continueButton).toBeDisabled();
  await expect.poll(() => threadSwitchProbeSession).toBeNull();
  await expect
    .element(screen.getByText("GUI host transport failed", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("late attach failure", { exact: true }))
    .not.toBeInTheDocument();
  expect(createComposerInputQueueCoordinator).not.toHaveBeenCalled();
});

test("App renders committed transcript messages from an attached projection", async () => {
  const screen = await renderWithProviders(<App />);

  const options = getHostOptions(startGuiHostConnectionMock);
  initializeAppWithProjection(options, attachWithCommittedMessages());

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("Hello from App")).toBeVisible();
  await expect.element(screen.getByText("Committed App response")).toBeVisible();
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

test("App rejects a startup attach that returns a different thread identity", async () => {
  const screen = await renderWithProviders(<App />);
  const { store } = screen;
  const mismatchedThreadId = "00000000-0000-0000-0000-000000000999";
  const mismatchedAttach = attachWithThreadId(attachResponse, mismatchedThreadId);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();

  queueAttachProjectionResponse(commands, mismatchedAttach);
  initializeHost(options, commands);

  await expect
    .element(screen.getByRole("main").getByRole("alert"))
    .toHaveTextContent("thread/projection/attach returned a different thread identity");
  expect(selectThreadRuntimeRecord(store.getState())).toBeNull();
  expect(createComposerInputQueueCoordinator).not.toHaveBeenCalled();
});

test("App stops forwarding runtime events after backpressure requires manual reconnect", async () => {
  const { store } = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchCapabilityProbe} />,
  );
  const projectionEvent = eventTurnStarted;
  const projectionClosed = closedBackpressure;

  const options = getHostOptions(startGuiHostConnectionMock);
  initializeAppWithProjection(options);
  const { session } = await waitForThreadSwitchProbeSession();
  emitProjectionClosed(options, projectionClosed);
  await expect.poll(() => session.getSnapshot().phase).toBe("projectionUnavailable");
  const unavailableSnapshot = session.getSnapshot();
  if (unavailableSnapshot.phase !== "projectionUnavailable") {
    throw new Error("expected projectionUnavailable");
  }
  const runtimeAfterClose = selectThreadRuntimeRecord(store.getState());
  emitProjectionEvent(options, projectionEvent);

  expect(unavailableSnapshot).toMatchObject({
    phase: "projectionUnavailable",
    reason: "backpressure",
    recovery: "connectionRestartRequired",
    threadId: launchThreadId,
  });
  expect(selectThreadRuntimeRecord(store.getState())).toBe(runtimeAfterClose);
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
  const composer = screen.getByRole("region", { name: "Message composer" });
  const input = getAppComposer(screen);
  const qrButton = screen.getByRole("button", { name: "Scan with phone" });

  await expect.element(input).toHaveAttribute("contenteditable", "true");
  options.onCommandsUnavailable?.();

  await expect.element(composer).not.toBeInTheDocument();
  await expect.element(input).not.toBeInTheDocument();
  await expect.element(qrButton).not.toBeInTheDocument();
});

test("App records manual reconnect when a projection event breaks the baseline", async () => {
  await renderWithProviders(<App currentTaskComponent={ThreadSwitchCapabilityProbe} />);
  const projectionEvent = eventItemStarted;

  const options = getHostOptions(startGuiHostConnectionMock);
  initializeAppWithProjection(options);
  const { session } = await waitForThreadSwitchProbeSession();
  emitProjectionEvent(options, projectionEvent);

  await expect
    .poll(() => session.getSnapshot())
    .toMatchObject({
      phase: "projectionUnavailable",
      reason: "commitChainMismatch",
      recovery: "connectionRestartRequired",
      threadId: launchThreadId,
    });
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

test("App does not render optimistic user messages after send", async () => {
  const commandHandle = createGuiHostCommands();
  const { screen } = await renderReadyApp(commandHandle);

  await getAppComposer(screen).fill("Not optimistic");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  await expect.element(screen.getByText("Not optimistic")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
