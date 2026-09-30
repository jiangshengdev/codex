import { vi } from "vitest";
import type { ComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";

export const createQueueCoordinatorMock = (
  threadId: string,
  releaseReadiness: ReturnType<ComposerInputQueueCoordinator["getReleaseReadiness"]> = {
    type: "safe",
  },
) => {
  const reservationRelease = vi.fn<() => void>();
  const observeAcceptedEvent = vi.fn<ComposerInputQueueCoordinator["observeAcceptedEvent"]>();
  const dispose = vi.fn<ComposerInputQueueCoordinator["dispose"]>();
  const coordinator = {
    getDraft: vi.fn<ComposerInputQueueCoordinator["getDraft"]>().mockReturnValue(null),
    saveDraft: vi.fn<ComposerInputQueueCoordinator["saveDraft"]>().mockReturnValue(true),
    retainDraft: vi.fn<ComposerInputQueueCoordinator["retainDraft"]>().mockReturnValue(true),
    retryPersistence: vi
      .fn<ComposerInputQueueCoordinator["retryPersistence"]>()
      .mockReturnValue(false),
    resumeRestored: vi.fn<ComposerInputQueueCoordinator["resumeRestored"]>().mockReturnValue(false),
    suspendRestored: vi.fn<ComposerInputQueueCoordinator["suspendRestored"]>(),
    completeRestoreReconciliation:
      vi.fn<ComposerInputQueueCoordinator["completeRestoreReconciliation"]>(),
    reconcileRestoredTurns: vi.fn<ComposerInputQueueCoordinator["reconcileRestoredTurns"]>(),
    setProjectionUnavailable: vi.fn<ComposerInputQueueCoordinator["setProjectionUnavailable"]>(),
    setConnectionUnavailable: vi.fn<ComposerInputQueueCoordinator["setConnectionUnavailable"]>(),
    reconcileProjection: vi
      .fn<ComposerInputQueueCoordinator["reconcileProjection"]>()
      .mockReturnValue({ type: "committed" }),
    discardUnknown: vi.fn<ComposerInputQueueCoordinator["discardUnknown"]>().mockReturnValue(false),
    ownerThreadId: threadId,
    submitIndependent: vi
      .fn<ComposerInputQueueCoordinator["submitIndependent"]>()
      .mockReturnValue({ type: "accepted" }),
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
      persistence: { error: null, restoredPaused: false, revision: null, unknownMessages: [] },
    }),
    subscribe: vi
      .fn<ComposerInputQueueCoordinator["subscribe"]>()
      .mockReturnValue(vi.fn<() => void>()),
    dispose,
  } satisfies ComposerInputQueueCoordinator;
  return { coordinator, dispose, observeAcceptedEvent, reservationRelease };
};
