import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import { StrictMode, useEffect } from "react";
import {
  attachResponse,
  createDeferred,
  createGuiHostCommands,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getConnectionStartCount,
  getHostOptions,
  initializeHost,
  launchThreadId,
  markCommandsUnavailable,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import {
  useActiveThreadSession,
  useActiveThreadSessionSnapshot,
} from "@/features/appShell/AppCapabilities";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type {
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  attachReplacement,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithThreadId,
  attachWithTurns,
  contextCompaction,
  eventWithEnvelope,
  inProgressTurn,
  itemStarted,
  turnCompleted,
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
      <button
        disabled={
          session == null ||
          (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") ||
          !snapshot.compaction.canRequest
        }
        onClick={() => {
          if (snapshot.phase === "active" || snapshot.phase === "projectionUnavailable") {
            snapshot.compactionRole.requestCompaction(snapshot.revision);
          }
        }}
        type="button"
      >
        Request context compaction
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
      <output aria-label="Context compaction phase">
        {available ? snapshot.compaction.phase : "none"}
      </output>
    </section>
  );
}

function ThreadSwitchComposerProbe() {
  return (
    <>
      <ThreadSwitchCapabilityProbe />
      <CurrentTaskPage />
    </>
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

const readPendingItems = (
  coordinator: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
  limit = 20,
): readonly ComposerPendingInputPageItem[] => {
  const snapshot = coordinator.getSnapshot();
  const result = coordinator.readPendingInputPage({
    lane,
    revision: snapshot.detailRevision,
    cursor: null,
    limit,
  });
  if (result.type !== "page") {
    throw new Error(`expected ${lane} pending-input page, received ${result.type}`);
  }
  return result.items;
};

const readPendingTextPreviews = (
  coordinator: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
): string[] =>
  readPendingItems(coordinator, lane).map(({ preview }) =>
    preview.type === "text" ? preview.text : "nonText",
  );

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

const getAppComposer = (screen: Awaited<ReturnType<typeof renderWithProviders>>) =>
  screen.getByRole("combobox", { name: "Message Codex", exact: true });

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

test("App releases an edited owner only after its marker settles and drains", async () => {
  const drainedTurn = inProgressTurn("turn-old-owner-drained-input");
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({ turn: drainedTurn });
  const commands: GuiHostCommands = { ...createGuiHostCommands(), startTurn };
  const screen = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchComposerProbe} />,
  );
  const options = getHostOptions(startGuiHostConnectionMock);
  const activeTurn = inProgressTurn("turn-active-owner-switch");
  queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, [activeTurn]));
  initializeHost(options, commands);
  await expect.poll(() => vi.mocked(createComposerInputQueueCoordinator).mock.calls.length).toBe(1);
  const oldCoordinatorResult = vi.mocked(createComposerInputQueueCoordinator).mock.results.at(0);
  if (oldCoordinatorResult?.type !== "return") {
    throw new Error("initial App owner must create a queue coordinator");
  }
  const oldCoordinator = oldCoordinatorResult.value;
  const observeAcceptedEvent = vi.spyOn(oldCoordinator, "observeAcceptedEvent");
  const beginPendingInputEdit = oldCoordinator.beginPendingInputEdit;
  const editCapture: {
    begun: Extract<
      ReturnType<ComposerInputQueueCoordinator["beginPendingInputEdit"]>,
      { type: "begun" }
    > | null;
  } = { begun: null };
  const beginEdit = vi
    .spyOn(oldCoordinator, "beginPendingInputEdit")
    .mockImplementation((request, restore) => {
      const result = beginPendingInputEdit(request, restore);
      if (result.type === "begun") editCapture.begun = result;
      return result;
    });
  const deletePendingInput = vi.spyOn(oldCoordinator, "deletePendingInput");
  const movePendingInput = vi.spyOn(oldCoordinator, "movePendingInput");
  const readPendingInputDetail = vi.spyOn(oldCoordinator, "readPendingInputDetail");
  const readPendingInputPage = vi.spyOn(oldCoordinator, "readPendingInputPage");
  const composer = getAppComposer(screen);

  await composer.fill("Old owner edited ordinary");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => oldCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
  const oldRevision = oldCoordinator.getSnapshot().detailRevision;
  const oldPage = oldCoordinator.readPendingInputPage({
    lane: "ordinary",
    revision: oldRevision,
    cursor: null,
    limit: 1,
  });
  if (oldPage.type !== "page" || oldPage.items[0] == null) {
    throw new Error("old owner must expose its ordinary page");
  }
  const oldDetailKey = oldPage.items[0].key;
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const oldDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await oldDialog.getByRole("button", { name: "Edit", exact: true }).click();
  const oldEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await oldEditor.fill("Old owner must not write this draft to the replacement");
  const begun = editCapture.begun;
  if (begun == null) throw new Error("old owner edit must begin");
  const save = vi.spyOn(begun.reservation, "save");
  const cancel = vi.spyOn(begun.reservation, "cancel");
  expect(readPendingItems(oldCoordinator, "ordinary")).toMatchObject([
    { key: oldDetailKey, lane: "ordinary", management: { type: "editing" } },
  ]);
  expect(oldCoordinator.reserveRelease()).toEqual({
    type: "blocked",
    blockers: [{ type: "ordinaryQueued", count: 1 }],
  });

  const { session: activeThreadSession } = await waitForThreadSwitchProbeSession();
  const blockedCandidateAttach = attachWithThreadId(attachResponse, candidateThreadId);
  queueAttachProjectionResponse(commands, blockedCandidateAttach);
  threadSwitchProbePromise = activeThreadSession.activate(candidateThreadId);
  await expect(threadSwitchProbePromise).resolves.toMatchObject({
    type: "unavailable",
    failure: { type: "currentThreadUnresolved" },
  });
  expect(commands.detachThreadProjection).toHaveBeenNthCalledWith(1, {
    threadId: candidateThreadId,
  });
  await expect.element(oldEditor).toBeVisible();
  expect(oldCoordinator.getReleaseReadiness()).toEqual({
    type: "blocked",
    blockers: [{ type: "ordinaryQueued", count: 1 }],
  });

  const oldTerminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "commit-old-owner-terminal", {
      ...activeTurn,
      status: "completed",
    }),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, oldTerminal);
  expect(observeAcceptedEvent).toHaveBeenCalledExactlyOnceWith({
    notification: oldTerminal,
    replay: "live",
  });
  expect(startTurn).not.toHaveBeenCalled();
  expect(oldCoordinator.getReleaseReadiness()).toEqual({
    type: "blocked",
    blockers: [{ type: "ordinaryQueued", count: 1 }],
  });
  expect(oldCoordinator.reserveRelease()).toEqual({
    type: "blocked",
    blockers: [{ type: "ordinaryQueued", count: 1 }],
  });

  queueAttachProjectionResponse(commands, blockedCandidateAttach);
  threadSwitchProbePromise = activeThreadSession.activate(candidateThreadId);
  await expect(threadSwitchProbePromise).resolves.toMatchObject({
    type: "unavailable",
    failure: { type: "currentThreadUnresolved" },
  });
  expect(commands.detachThreadProjection).toHaveBeenNthCalledWith(2, {
    threadId: candidateThreadId,
  });
  expect(startTurn).not.toHaveBeenCalled();
  await expect.element(oldEditor).toBeVisible();

  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  const oldListDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(oldListDialog.getByText("No pending messages", { exact: true }))
    .toBeVisible();
  expect(cancel).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  expectStartTurnCalledOnceWithText(startTurn, "Old owner edited ordinary");
  await expect
    .poll(() => oldCoordinator.getReleaseReadiness())
    .toEqual({
      type: "blocked",
      blockers: [{ type: "pendingStart", phase: "acceptedAwaitingRuntime" }],
    });
  const drainedStarted = eventWithEnvelope(
    turnStarted(eventTurnStarted, "commit-old-owner-drained-started", drainedTurn),
    { parentCommitId: oldTerminal.commitId },
  );
  emitProjectionEvent(options, drainedStarted);
  await expect.poll(() => oldCoordinator.getReleaseReadiness()).toEqual({ type: "safe" });
  const releaseProbe = oldCoordinator.reserveRelease();
  if (releaseProbe.type !== "reserved") {
    throw new Error("settled and drained owner must become releasable");
  }
  releaseProbe.reservation.release();
  await expect.poll(() => oldCoordinator.getReleaseReadiness()).toEqual({ type: "safe" });
  const callsBeforeOwnerReplacement = {
    beginEdit: beginEdit.mock.calls.length,
    cancel: cancel.mock.calls.length,
    deletePendingInput: deletePendingInput.mock.calls.length,
    movePendingInput: movePendingInput.mock.calls.length,
    readDetail: readPendingInputDetail.mock.calls.length,
    readPage: readPendingInputPage.mock.calls.length,
    save: save.mock.calls.length,
  };

  const replacementTurn = inProgressTurn("turn-replacement-owner");
  const candidateAttach = attachWithThreadId(
    attachWithTurns(attachResponse, [replacementTurn]),
    candidateThreadId,
  );
  queueAttachProjectionResponse(commands, candidateAttach);
  threadSwitchProbePromise = activeThreadSession.activate(candidateThreadId);
  await threadSwitchProbePromise;
  await expect.poll(() => vi.mocked(createComposerInputQueueCoordinator).mock.calls.length).toBe(4);
  await expect.element(composer).toHaveFocus();
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await expect
    .poll(() => {
      const snapshot = activeThreadSession.getSnapshot();
      return snapshot.phase === "active" ? snapshot.activeTurnId : null;
    })
    .toBe(replacementTurn.id);
  await expect.element(oldListDialog).not.toBeInTheDocument();
  const replacementResult = vi.mocked(createComposerInputQueueCoordinator).mock.results.at(-1);
  if (replacementResult?.type !== "return") {
    throw new Error("replacement App owner must create a queue coordinator");
  }
  const replacementCoordinator = replacementResult.value;
  expect(replacementCoordinator.ownerThreadId).toBe(candidateThreadId);
  const replacementSnapshot = replacementCoordinator.getSnapshot();
  const replacementTranscript = screen.store.getState().transcriptState;
  expect(
    replacementCoordinator.readPendingInputPage({
      lane: "ordinary",
      revision: replacementSnapshot.detailRevision,
      cursor: null,
      limit: 1,
    }),
  ).toEqual({
    type: "page",
    revision: replacementSnapshot.detailRevision,
    items: [],
    nextCursor: null,
  });
  expect(
    replacementCoordinator.readPendingInputDetail({
      key: oldDetailKey,
      revision: replacementSnapshot.detailRevision,
    }),
  ).toEqual({ type: "missing", revision: replacementSnapshot.detailRevision });

  await Promise.resolve();
  expect({
    beginEdit: beginEdit.mock.calls.length,
    cancel: cancel.mock.calls.length,
    deletePendingInput: deletePendingInput.mock.calls.length,
    movePendingInput: movePendingInput.mock.calls.length,
    readDetail: readPendingInputDetail.mock.calls.length,
    readPage: readPendingInputPage.mock.calls.length,
    save: save.mock.calls.length,
  }).toEqual(callsBeforeOwnerReplacement);

  expect(oldCoordinator.getReleaseReadiness()).toEqual({
    type: "blocked",
    blockers: [{ type: "disposed" }],
  });
  expect(
    oldCoordinator.readPendingInputDetail({ key: oldDetailKey, revision: oldRevision }),
  ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "disposed" });
  expect(begun.reservation.save(composerDraftCapture("Old owner late save"))).toEqual({
    type: "unavailable",
    scope: "ownerGone",
    reason: "disposed",
  });
  expect(begun.reservation.cancel()).toEqual({
    type: "unavailable",
    scope: "ownerGone",
    reason: "disposed",
  });
  expect(save).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(deletePendingInput).not.toHaveBeenCalled();
  expect(startTurn).toHaveBeenCalledOnce();
  expect(replacementCoordinator.getSnapshot()).toBe(replacementSnapshot);
  expect(screen.store.getState().transcriptState).toBe(replacementTranscript);

  for (const text of ["Replacement owner order A", "Replacement owner order B"]) {
    await composer.fill(text);
    await screen.getByRole("button", { name: "Send", exact: true }).click();
  }
  await expect.poll(() => replacementCoordinator.getSnapshot().ordinaryQueuedCount).toBe(2);
  const replacementOrderBeforeOldMove = readPendingTextPreviews(replacementCoordinator, "ordinary");
  expect(replacementOrderBeforeOldMove).toEqual([
    "Replacement owner order A",
    "Replacement owner order B",
  ]);
  expect(
    oldCoordinator.movePendingInput({
      key: oldDetailKey,
      revision: oldRevision,
      destination: "first",
    }),
  ).toEqual({ type: "unavailable", scope: "ownerGone", reason: "disposed" });
  expect(movePendingInput).toHaveBeenCalledOnce();
  expect(readPendingTextPreviews(replacementCoordinator, "ordinary")).toEqual(
    replacementOrderBeforeOldMove,
  );

  const replacementMoveTarget = readPendingItems(replacementCoordinator, "ordinary").at(1);
  if (replacementMoveTarget == null) {
    throw new Error("replacement owner must expose its second ordinary input");
  }
  expect(
    replacementCoordinator.movePendingInput({
      key: replacementMoveTarget.key,
      revision: replacementCoordinator.getSnapshot().detailRevision,
      destination: "first",
    }),
  ).toMatchObject({ type: "moved", lane: "ordinary", position: 1, count: 2 });
  expect(readPendingTextPreviews(replacementCoordinator, "ordinary")).toEqual([
    "Replacement owner order B",
    "Replacement owner order A",
  ]);
  await expect
    .element(
      screen.getByText("Old owner must not write this draft to the replacement", { exact: true }),
    )
    .not.toBeInTheDocument();
});

test("App owns one live queue under StrictMode and disposes it once", async () => {
  const screen = await renderWithProviders(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  const createQueueCoordinator = vi.mocked(createComposerInputQueueCoordinator);
  const queue = createQueueCoordinatorMock(launchThreadId);
  createQueueCoordinator.mockReturnValue(queue.coordinator);
  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);

  await expect.poll(() => createQueueCoordinator.mock.calls.length).toBe(1);
  expect(createQueueCoordinator).toHaveBeenCalledWith({
    threadId: launchThreadId,
    activeTurnId: null,
    startTurn: commands.startTurn,
    steerTurn: commands.steerTurn,
    interruptTurn: commands.interruptTurn,
  });
  emitProjectionEvent(options, eventTurnStarted);

  expect(queue.observeAcceptedEvent).toHaveBeenCalledOnce();
  expect(queue.observeAcceptedEvent).toHaveBeenCalledWith({
    notification: eventTurnStarted,
    replay: "live",
  });

  markCommandsUnavailable(options);

  expect(createQueueCoordinator).toHaveBeenCalledOnce();
  expect(queue.dispose).toHaveBeenCalledOnce();

  await screen.unmount();

  expect(queue.dispose).toHaveBeenCalledOnce();
  expect(getConnectionStartCount(startGuiHostConnectionMock)).toBe(2);
  expect(getCleanupConnectionCallCount()).toBe(2);

  emitProjectionEvent(options, eventTurnStarted);

  expect(queue.observeAcceptedEvent).toHaveBeenCalledOnce();
  expect(createQueueCoordinator).toHaveBeenCalledOnce();
});

test("App publishes compaction command and canonical lifecycle through its session snapshot", async () => {
  const commands = createGuiHostCommands();
  const compactResponse = createDeferred<Awaited<ReturnType<GuiHostCommands["compactThread"]>>>();
  vi.mocked(commands.compactThread).mockReturnValue(compactResponse.promise);
  const { options, screen } = await renderThreadSwitchProbe(commands);
  const compactButton = screen.getByRole("button", { name: "Request context compaction" });
  const phase = screen.getByLabelText("Context compaction phase");

  await expect.element(compactButton).toBeEnabled();
  await compactButton.click();
  expect(commands.compactThread).toHaveBeenCalledExactlyOnceWith({ threadId: launchThreadId });
  await expect.element(phase).toHaveTextContent("requestPending");
  await expect.element(compactButton).toBeDisabled();

  emitProjectionEvent(options, eventTurnStarted);
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("expected a turnStarted fixture");
  }
  const compactionStarted = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-app-compaction-started",
      eventTurnStarted.event.notification.turn.id,
      contextCompaction("app-compaction-item"),
    ),
    { parentCommitId: eventTurnStarted.commitId },
  );
  emitProjectionEvent(options, compactionStarted);
  await expect.element(phase).toHaveTextContent("running");

  compactResponse.resolve({});
  await compactResponse.promise;
  await expect.element(phase).toHaveTextContent("running");
});

test("App keeps the initial session when its queue blocks a thread switch", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId, {
    type: "blocked",
    blockers: [{ type: "ordinaryQueued", count: 1 }],
  });
  const candidateQueue = createQueueCoordinatorMock(candidateThreadId);
  vi.mocked(createComposerInputQueueCoordinator).mockImplementation(({ threadId }) =>
    threadId === launchThreadId ? initialQueue.coordinator : candidateQueue.coordinator,
  );
  const commands = createGuiHostCommands();
  const { continueButton, screen } = await renderThreadSwitchProbe(commands);
  const { session: activeThreadSession, snapshot: initialSnapshot } =
    await waitForThreadSwitchProbeSession();
  queueAttachProjectionResponse(commands, attachWithThreadId(attachReplacement, candidateThreadId));

  await continueButton.click();
  await expect(requireThreadSwitchProbePromise()).resolves.toMatchObject({
    type: "unavailable",
    failure: { type: "currentThreadUnresolved" },
  });

  expect(commands.resumeThread).toHaveBeenCalledExactlyOnceWith({ threadId: candidateThreadId });
  expect(commands.attachThreadProjection).toHaveBeenCalledTimes(2);
  expect(activeThreadSession.getSnapshot()).toBe(initialSnapshot);
  await expect
    .element(screen.getByLabelText("Active thread session"))
    .toHaveTextContent(launchThreadId);
  expect(initialQueue.dispose).not.toHaveBeenCalled();
  expect(candidateQueue.dispose).toHaveBeenCalledOnce();
  expect(commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: candidateThreadId,
  });
});

test("App cleans up once on unmount and ignores a late switch candidate completion", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId);
  vi.mocked(createComposerInputQueueCoordinator).mockReturnValue(initialQueue.coordinator);
  const pendingAttach =
    createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
  const candidateAttach = attachWithThreadId(attachReplacement, candidateThreadId);
  const commands = createGuiHostCommands();
  const { continueButton, screen } = await renderThreadSwitchProbe(commands);
  vi.mocked(commands.attachThreadProjection).mockReturnValueOnce(pendingAttach.promise);
  await continueButton.click();
  await expect.poll(() => vi.mocked(commands.attachThreadProjection).mock.calls.length).toBe(2);
  expect(commands.attachThreadProjection).toHaveBeenNthCalledWith(2, {
    threadId: candidateThreadId,
  });
  const switching = requireThreadSwitchProbePromise();
  await screen.unmount();

  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);
  pendingAttach.resolve(candidateAttach);
  await expect(switching).resolves.toMatchObject({
    type: "unavailable",
    failure: { type: "connectionLost", progress: "beforeCommit" },
  });

  expect(createComposerInputQueueCoordinator).toHaveBeenCalledOnce();
  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);
  expect(commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: candidateThreadId,
  });
  expect(selectThreadRuntimeRecord(screen.store.getState())?.threadId).toBe(launchThreadId);
  expect(screen.store.getState().transcriptState.threadId).toBe(launchThreadId);
});

test("App reports connection loss after commit when unmounted during previous owner detach", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId);
  const candidateQueue = createQueueCoordinatorMock(candidateThreadId);
  vi.mocked(createComposerInputQueueCoordinator).mockImplementation(({ threadId }) =>
    threadId === launchThreadId ? initialQueue.coordinator : candidateQueue.coordinator,
  );
  const pendingDetach =
    createDeferred<Awaited<ReturnType<GuiHostCommands["detachThreadProjection"]>>>();
  const candidateAttach = attachWithThreadId(attachReplacement, candidateThreadId);
  const commands = createGuiHostCommands();
  const { continueButton, screen } = await renderThreadSwitchProbe(commands);
  queueAttachProjectionResponse(commands, candidateAttach);
  vi.mocked(commands.detachThreadProjection).mockReturnValueOnce(pendingDetach.promise);
  const { session: activeThreadSession } = await waitForThreadSwitchProbeSession();

  await continueButton.click();
  const switching = requireThreadSwitchProbePromise();
  await expect
    .poll(() => {
      const snapshot = activeThreadSession.getSnapshot();
      return snapshot.phase === "active" || snapshot.phase === "projectionUnavailable"
        ? snapshot.threadId
        : null;
    })
    .toBe(candidateThreadId);
  await expect.poll(() => vi.mocked(commands.detachThreadProjection).mock.calls.length).toBe(1);
  expect(commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
  });

  await screen.unmount();
  pendingDetach.resolve({ status: "detached" });

  await expect(switching).resolves.toMatchObject({
    type: "unavailable",
    failure: {
      type: "connectionLost",
      progress: "afterCommit",
      threadId: candidateThreadId,
    },
  });
  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(candidateQueue.dispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);
});
