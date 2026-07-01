import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  attachProjection,
  attachResponse,
  attachWithCommittedMessages,
  createGuiHostCommands,
  emitProjectionClosed,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getHostOptions,
  launchThreadId,
  markCommandsReady,
  markHostAttached,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import App from "@/App";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  closedBackpressure,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  itemCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  buildSnapshotReplayMaterials,
  selectSnapshotReplayMaterials,
} from "@/features/snapshotReplay/snapshotReplay";
import { selectLiveEventMaterials } from "@/features/liveEventHandling/liveEventHandling";
import { selectThreadIdentityState } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";

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

const renderReadyApp = async (commandHandle = createGuiHostCommands()) => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  attachProjection(options);
  markHostAttached(options);
  markCommandsReady(options, commandHandle);

  return { commandHandle, options, screen };
};

const expectAppComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  for (const control of [
    screen.getByPlaceholder("Message Codex"),
    screen.getByRole("button", { name: "Send" }),
    screen.getByRole("button", { name: "Stop" }),
  ]) {
    await expect.element(control).toBeDisabled();
  }
};

afterEach(() => {
  scrollToDocumentTop();
});

test("App renders the committed transcript shell without visible host debug details", async () => {
  const screen = await renderWithProviders(<App />);

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "connecting");
  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});

test("App renders composer in the shell without visible host debug details", async () => {
  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
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

test("App displays GUI host startup errors", async () => {
  startGuiHostConnectionMock.mockImplementation(() => {
    throw new Error("Missing launch token fragment");
  });

  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
  await expect.element(screen.getByText("Missing launch token fragment")).toBeVisible();
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
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
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(
    buildSnapshotReplayMaterials(runtime),
  );
});

test("App classifies snapshot-ahead projection events as snapshot duplicate replay", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const snapshotAheadAttach = attachWithTurns(attachResponse, [
    eventTurnStarted.event.notification.turn,
  ]);
  const snapshotAheadWithOldHead: ThreadProjectionAttachResponse = {
    ...snapshotAheadAttach,
    snapshot: {
      ...snapshotAheadAttach.snapshot,
      headCommitId: eventTurnStarted.parentCommitId,
    },
  };

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options, snapshotAheadWithOldHead);
  emitProjectionEvent(options, eventTurnStarted);

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.snapshotTurns).toStrictEqual([eventTurnStarted.event.notification.turn]);
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: eventTurnStarted, replay: "snapshotDuplicate" },
  ]);
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(
    buildSnapshotReplayMaterials(runtime),
  );
  expect(selectLiveEventMaterials(store.getState())).toStrictEqual([]);
});

test("App passes ready commands to composer and sends plain text", async () => {
  const commandHandle = createGuiHostCommands();
  const { screen } = await renderReadyApp(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Hello from App composer");
  await screen.getByRole("button", { name: "Send" }).click();

  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId: launchThreadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "Hello from App composer", text_elements: [] }],
  });
});

test("App enables Stop for the current active turn", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);
  const projectionEvent = eventTurnStarted;
  emitProjectionEvent(options, projectionEvent);

  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
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

  emitProjectionEvent(options, {
    ...itemCompleted(
      eventItemCompleted,
      "commit-scroll-live-new",
      "turn-scroll-live",
      agentMessage("agent-scroll-live-new", "Live sticky bottom message"),
    ),
    // attachResponse.snapshot.headCommitId is null, so override the fixture parent to test
    // sticky-bottom behavior rather than the commit-chain mismatch path.
    parentCommitId: null,
  });

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

  emitProjectionEvent(options, {
    ...itemCompleted(
      eventItemCompleted,
      "commit-scroll-away-new",
      "turn-scroll-away",
      agentMessage("agent-scroll-away-new", "Message while reading history"),
    ),
    // attachResponse.snapshot.headCommitId is null, so override the fixture parent to test
    // sticky-bottom behavior rather than the commit-chain mismatch path.
    parentCommitId: null,
  });

  await expect.element(screen.getByText("Message while reading history")).toBeVisible();
  await expectDocumentScrollStaysAwayFromBottom(scrollTopBeforeMessage + 4);
});

test("App records mismatched attach identity without advancing runtime state", async () => {
  const { store } = await renderWithProviders(<App />);
  const mismatchedThreadId = "00000000-0000-0000-0000-000000000999";
  const mismatchedAttachResponse: ThreadProjectionAttachResponse = {
    ...attachResponse,
    snapshot: {
      ...attachResponse.snapshot,
      thread: {
        ...attachResponse.snapshot.thread,
        id: mismatchedThreadId,
      },
    },
  };

  const options = getHostOptions(startGuiHostConnectionMock);
  attachProjection(options, mismatchedAttachResponse);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId,
    attachedThreadId: mismatchedThreadId,
    attachStatus: "mismatch",
  });
  expect(selectThreadRuntimeRecord(store.getState())).toBeNull();
  expect(selectThreadRuntimeSubscription(store.getState())).toBeNull();
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual([]);
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
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(
    buildSnapshotReplayMaterials(runtime),
  );
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

test("App does not render optimistic user messages after send", async () => {
  const commandHandle = createGuiHostCommands();
  const { screen } = await renderReadyApp(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Not optimistic");
  await screen.getByRole("button", { name: "Send" }).click();

  await expect.element(screen.getByText("Not optimistic")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
