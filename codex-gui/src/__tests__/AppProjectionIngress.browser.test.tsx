import { beforeEach, expect, test, vi } from "vitest";
import { useEffect } from "react";
import {
  attachResponse,
  attachWithCommittedMessages,
  createGuiHostCommands,
  emitRawHostStatus,
  emitProjectionEvent,
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
  eventSubscriptionReplacement,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithHeadCommitId,
  attachWithThreadId,
  attachWithTurns,
  eventWithEnvelope,
  inProgressTurn,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
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

test("App does not render optimistic user messages after send", async () => {
  const commandHandle = createGuiHostCommands();
  const { screen } = await renderReadyApp(commandHandle);

  await getAppComposer(screen).fill("Not optimistic");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  await expect.element(screen.getByText("Not optimistic")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
