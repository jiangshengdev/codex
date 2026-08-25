import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useEffect } from "react";
import {
  createDeferred,
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
} from "../appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "../appBrowserRenderHarness";
import {
  useActiveThreadSession,
  useActiveThreadSessionSnapshot,
} from "@/features/appShell/AppCapabilities";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  attachReplacement,
  eventAgentMessageDelta,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  agentMessageDelta,
  attachWithThreadId,
  attachWithTurns,
  deltaForThreadOwner,
  eventForThreadOwner,
  eventWithEnvelope,
  inProgressTurn,
  itemStarted,
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
let threadSwitchProbePromise: ReturnType<ActiveThreadSession["activate"]> | null = null;

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
          threadSwitchProbePromise = session?.activate(candidateThreadId) ?? null;
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

const createQueueCoordinatorMock = (
  threadId: string,
  releaseReadiness: ReturnType<ComposerInputQueueCoordinator["getReleaseReadiness"]> = {
    type: "safe",
  },
) => {
  const reservationRelease = vi.fn<() => void>();
  const observeAcceptedEvent = vi.fn<ComposerInputQueueCoordinator["observeAcceptedEvent"]>();
  const dispose = vi.fn<ComposerInputQueueCoordinator["dispose"]>();
  const coordinator = {
    ownerThreadId: threadId,
    submit: vi.fn<ComposerInputQueueCoordinator["submit"]>().mockReturnValue({ type: "accepted" }),
    submitSteer: vi
      .fn<ComposerInputQueueCoordinator["submitSteer"]>()
      .mockReturnValue({ type: "accepted" }),
    promoteOrdinaryFrontToSteer: vi
      .fn<ComposerInputQueueCoordinator["promoteOrdinaryFrontToSteer"]>()
      .mockReturnValue(false),
    interruptActiveTurn: vi
      .fn<ComposerInputQueueCoordinator["interruptActiveTurn"]>()
      .mockReturnValue(false),
    recover: vi.fn<ComposerInputQueueCoordinator["recover"]>().mockReturnValue(false),
    observeAcceptedEvent,
    getReleaseReadiness: vi
      .fn<ComposerInputQueueCoordinator["getReleaseReadiness"]>()
      .mockReturnValue(releaseReadiness),
    reserveRelease: vi
      .fn<ComposerInputQueueCoordinator["reserveRelease"]>()
      .mockImplementation(() =>
        releaseReadiness.type === "blocked"
          ? releaseReadiness
          : { type: "reserved", reservation: { release: reservationRelease } },
      ),
    readPendingInputPage: vi
      .fn<ComposerInputQueueCoordinator["readPendingInputPage"]>()
      .mockReturnValue({ type: "unavailable", scope: "ownerGone", reason: "disposed" }),
    readPendingInputDetail: vi
      .fn<ComposerInputQueueCoordinator["readPendingInputDetail"]>()
      .mockReturnValue({ type: "unavailable", scope: "ownerGone", reason: "disposed" }),
    beginPendingInputEdit: vi
      .fn<ComposerInputQueueCoordinator["beginPendingInputEdit"]>()
      .mockReturnValue({ type: "unavailable", scope: "ownerGone", reason: "disposed" }),
    deletePendingInput: vi
      .fn<ComposerInputQueueCoordinator["deletePendingInput"]>()
      .mockReturnValue({ type: "unavailable", scope: "ownerGone", reason: "disposed" }),
    movePendingInput: vi
      .fn<ComposerInputQueueCoordinator["movePendingInput"]>()
      .mockReturnValue({ type: "unavailable", scope: "ownerGone", reason: "disposed" }),
    getSnapshot: vi.fn<ComposerInputQueueCoordinator["getSnapshot"]>().mockReturnValue({
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
    }),
    subscribe: vi
      .fn<ComposerInputQueueCoordinator["subscribe"]>()
      .mockReturnValue(vi.fn<() => void>()),
    dispose,
  } satisfies ComposerInputQueueCoordinator;
  return { coordinator, dispose, observeAcceptedEvent, reservationRelease };
};

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

const requireThreadSwitchProbePromise = () => {
  if (threadSwitchProbePromise == null) {
    throw new Error("thread switch probe must start a switch");
  }
  return threadSwitchProbePromise;
};

const renderThreadSwitchProbe = async (commands: GuiHostCommands) => {
  const screen = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchCapabilityProbe} />,
  );
  const options = getHostOptions(startGuiHostConnectionMock);
  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);
  const continueButton = screen.getByRole("button", { name: "Continue candidate thread" });
  await expect.element(continueButton).toBeEnabled();
  const { snapshot } = await waitForThreadSwitchProbeSession();
  expect(snapshot.threadId).toBe(launchThreadId);
  return { continueButton, options, screen };
};

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
  threadSwitchProbeSession = null;
  threadSwitchProbePromise = null;
});

afterEach(() => {
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
});

test("App publishes a completed thread switch atomically through one session", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId);
  const candidateQueue = createQueueCoordinatorMock(candidateThreadId);
  vi.mocked(createComposerInputQueueCoordinator).mockImplementation(({ threadId }) =>
    threadId === launchThreadId ? initialQueue.coordinator : candidateQueue.coordinator,
  );
  const pendingAttach =
    createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
  const candidateItem = agentMessage("candidate-switch-item", "");
  const candidateAttach = attachWithThreadId(
    attachWithTurns(attachReplacement, [inProgressTurn("candidate-switch-turn")]),
    candidateThreadId,
  );
  const commands = createGuiHostCommands();
  const { continueButton, options, screen } = await renderThreadSwitchProbe(commands);
  vi.mocked(commands.attachThreadProjection).mockReturnValueOnce(pendingAttach.promise);
  const activeThread = screen.getByLabelText("Active thread session");
  const { session: activeThreadSession } = await waitForThreadSwitchProbeSession();

  await expect.element(activeThread).toHaveTextContent(launchThreadId);
  await continueButton.click();
  await expect.poll(() => vi.mocked(commands.attachThreadProjection).mock.calls.length).toBe(2);
  expect(commands.attachThreadProjection).toHaveBeenNthCalledWith(2, {
    threadId: candidateThreadId,
  });

  const candidateOwner = {
    threadId: candidateThreadId,
    subscriptionId: candidateAttach.subscriptionId,
  };
  const candidateEvent = eventForThreadOwner(
    eventWithEnvelope(
      itemStarted(
        eventItemStarted,
        "commit-candidate-switch-item",
        "candidate-switch-turn",
        candidateItem,
      ),
      { parentCommitId: candidateAttach.snapshot.headCommitId },
    ),
    candidateOwner,
  );
  const candidateDelta = deltaForThreadOwner(
    agentMessageDelta(
      eventAgentMessageDelta,
      "candidate-switch-turn",
      candidateItem.id,
      "Candidate notification replayed",
    ),
    candidateOwner,
  );
  emitProjectionEvent(options, candidateEvent);
  emitProjectionDelta(options, candidateDelta);

  await expect.element(activeThread).toHaveTextContent(launchThreadId);
  expect(threadSwitchProbeSession).toBe(activeThreadSession);
  expect(
    selectTranscriptEntry(
      screen.store.getState(),
      transcriptEntryIdFor("candidate-switch-turn", candidateItem.id),
    ),
  ).toBeNull();
  pendingAttach.resolve(candidateAttach);
  await expect(requireThreadSwitchProbePromise()).resolves.toEqual({
    type: "ready",
    threadId: candidateThreadId,
    warnings: [],
  });

  await expect.element(activeThread).toHaveTextContent(candidateThreadId);
  await expect
    .poll(() =>
      selectTranscriptEntry(
        screen.store.getState(),
        transcriptEntryIdFor("candidate-switch-turn", candidateItem.id),
      ),
    )
    .toStrictEqual({
      type: "message",
      id: candidateItem.id,
      turnId: "candidate-switch-turn",
      role: "assistant",
      rendering: { mode: "streamingMarkdown", source: "Candidate notification replayed" },
      revision: 1,
    });
  await expect
    .poll(() => {
      const snapshot = activeThreadSession.getSnapshot();
      return snapshot.phase === "active" || snapshot.phase === "projectionUnavailable"
        ? snapshot.threadId
        : null;
    })
    .toBe(candidateThreadId);
  expect(activeThreadSession.getSnapshot()).toMatchObject({
    phase: "active",
    threadId: candidateThreadId,
    subscriptionId: candidateAttach.subscriptionId,
    activeTurnId: "candidate-switch-turn",
  });
  expect(selectThreadRuntimeRecord(screen.store.getState())?.threadId).toBe(candidateThreadId);
  expect(screen.store.getState().transcriptState.threadId).toBe(candidateThreadId);
  expect(candidateQueue.observeAcceptedEvent).toHaveBeenCalledExactlyOnceWith({
    notification: candidateEvent,
    replay: "live",
  });
  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(candidateQueue.dispose).not.toHaveBeenCalled();
  expect(commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
  });

  await screen.unmount();

  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(candidateQueue.dispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);
});

test("App keeps the initial session when attaching the switch candidate fails", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId);
  vi.mocked(createComposerInputQueueCoordinator).mockReturnValue(initialQueue.coordinator);
  const error = new Error("candidate attach failed");
  const commands = createGuiHostCommands();
  const { continueButton, screen } = await renderThreadSwitchProbe(commands);
  vi.mocked(commands.attachThreadProjection).mockRejectedValueOnce(error);
  const { session: activeThreadSession, snapshot: initialSnapshot } =
    await waitForThreadSwitchProbeSession();

  await continueButton.click();
  await expect(requireThreadSwitchProbePromise()).resolves.toMatchObject({
    type: "unavailable",
    failure: { type: "operationFailed", phase: "attach", error },
  });

  expect(commands.resumeThread).toHaveBeenCalledOnce();
  expect(commands.attachThreadProjection).toHaveBeenCalledTimes(2);
  expect(commands.attachThreadProjection).toHaveBeenNthCalledWith(2, {
    threadId: candidateThreadId,
  });
  expect(commands.detachThreadProjection).not.toHaveBeenCalled();
  expect(activeThreadSession.getSnapshot()).toBe(initialSnapshot);
  await expect
    .element(screen.getByLabelText("Active thread session"))
    .toHaveTextContent(launchThreadId);
  expect(initialQueue.reservationRelease).not.toHaveBeenCalled();
  expect(initialQueue.dispose).not.toHaveBeenCalled();
});
