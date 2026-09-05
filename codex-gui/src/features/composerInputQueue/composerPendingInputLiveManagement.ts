import type { ActiveThreadProjectionAcceptedEvent } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import type { ComposerDraftCapture } from "@/features/composerEditor/composerDraft";
import type { ComposerInputQueue } from "./composerInputQueue";
import type {
  ComposerPendingInputDrainIntent,
  ComposerPendingInputEditInvalidation,
  ComposerPendingInputEditRestore,
  ComposerPendingInputEditSaveResult,
  ComposerPendingInputManagementRequest,
  ComposerPendingInputMoveRequest,
  ComposerPendingInputMoveResult,
  ComposerPendingInputOwnerGoneResult,
} from "./composerInputQueueContracts";

export type ComposerPendingInputLiveInvalidation = Readonly<{
  type: "unavailable";
  scope: "liveOwner";
  reason: "targetInvalidated";
  revision: number;
  key: ComposerPendingInputEditInvalidation["key"];
  lane: ComposerPendingInputEditInvalidation["lane"];
  targetReason: ComposerPendingInputEditInvalidation["targetReason"];
}>;

type ComposerPendingInputLiveSessionInvalidation = Readonly<{
  type: "unavailable";
  scope: "liveOwner";
  reason: "sessionInvalidated" | "mutationPending";
  revision: number;
}>;

type ComposerPendingInputCoordinatorManagementFailure =
  | Readonly<{ type: "stale"; scope: "liveOwner"; revision: number }>
  | Readonly<{ type: "notManageable"; scope: "liveOwner"; revision: number }>
  | ComposerPendingInputLiveSessionInvalidation
  | ComposerPendingInputOwnerGoneResult;

export type ComposerPendingInputCoordinatorEditReservation = Readonly<{
  save(
    capture: ComposerDraftCapture,
  ):
    | Readonly<{ type: "saved"; revision: number }>
    | Extract<ComposerPendingInputEditSaveResult, { type: "invalidInput" }>
    | ComposerPendingInputLiveInvalidation
    | ComposerPendingInputLiveSessionInvalidation
    | ComposerPendingInputOwnerGoneResult;
  cancel():
    | Readonly<{ type: "cancelled"; revision: number }>
    | ComposerPendingInputLiveInvalidation
    | ComposerPendingInputLiveSessionInvalidation
    | ComposerPendingInputOwnerGoneResult;
}>;

export type ComposerPendingInputCoordinatorBeginEditResult =
  | Readonly<{
      type: "begun";
      revision: number;
      reservation: ComposerPendingInputCoordinatorEditReservation;
    }>
  | Readonly<{ type: "invalidDraft"; scope: "liveOwner"; revision: number }>
  | ComposerPendingInputLiveInvalidation
  | ComposerPendingInputCoordinatorManagementFailure;

export type ComposerPendingInputCoordinatorDeleteResult =
  | Readonly<{ type: "deleted"; revision: number }>
  | ComposerPendingInputCoordinatorManagementFailure;

export type ComposerPendingInputCoordinatorMoveUnavailable = Readonly<{
  type: "unavailable";
  scope: "liveOwner";
  reason: "editInProgress" | "mutationPending" | "releaseReserved" | "recoveryPending";
  revision: number;
}>;

export type ComposerPendingInputCoordinatorMoveResult =
  | Extract<ComposerPendingInputMoveResult, { type: "moved" | "noOp" }>
  | Readonly<{ type: "stale"; scope: "liveOwner"; revision: number }>
  | Readonly<{ type: "notManageable"; scope: "liveOwner"; revision: number }>
  | ComposerPendingInputCoordinatorMoveUnavailable
  | ComposerPendingInputOwnerGoneResult;

type PendingInputManagementSession = {
  key: ComposerPendingInputManagementRequest["key"];
  reservation: Extract<
    ReturnType<ComposerInputQueue["beginPendingInputEdit"]>,
    { type: "begun" }
  >["reservation"];
  invalidation: ComposerPendingInputLiveInvalidation | null;
  settled: boolean;
};

type AcceptedEventReplayResult =
  | Readonly<{ type: "flushed" }>
  | Readonly<{ type: "failed"; error: unknown }>;

type ComposerPendingInputDrainResult = "consumed" | "consumedRecoveryPending" | "deferred";

export type ComposerPendingInputLiveManagementHost = Readonly<{
  applyAcceptedEvent(payload: Readonly<ActiveThreadProjectionAcceptedEvent>): void;
  publishSnapshot(): void;
  drainPendingInput(intent: ComposerPendingInputDrainIntent): ComposerPendingInputDrainResult;
}>;

export type ComposerPendingInputLiveManagement = Readonly<{
  beginPendingInputEdit(
    request: ComposerPendingInputManagementRequest,
    restore: ComposerPendingInputEditRestore,
    blockedByCoordinator: boolean,
  ): ComposerPendingInputCoordinatorBeginEditResult;
  deletePendingInput(
    request: ComposerPendingInputManagementRequest,
    blockedByCoordinator: boolean,
  ): ComposerPendingInputCoordinatorDeleteResult;
  movePendingInput(
    request: ComposerPendingInputMoveRequest,
    unavailableReason: ComposerPendingInputCoordinatorMoveUnavailable["reason"] | null,
  ): ComposerPendingInputCoordinatorMoveResult;
  observeAcceptedEvent(payload: Readonly<ActiveThreadProjectionAcceptedEvent>): void;
  consumeEditInvalidation(invalidation: ComposerPendingInputEditInvalidation | undefined): void;
  flushDeferredDrains(): void;
  mutationPending(): boolean;
  hasActiveSession(): boolean;
  blocksInterruptForSnapshot(): boolean;
  outcome(): ComposerPendingInputLiveInvalidation | null;
  dispose(ownerGone: ComposerPendingInputOwnerGoneResult): void;
}>;

class ComposerPendingInputLiveManagementImpl implements ComposerPendingInputLiveManagement {
  private readonly queue: ComposerInputQueue;
  private readonly host: ComposerPendingInputLiveManagementHost;
  private readonly deferredDrainLanes = new Set<ComposerPendingInputDrainIntent["lane"]>();
  private readonly deferredAcceptedEvents: ActiveThreadProjectionAcceptedEvent[] = [];
  private activeSession: PendingInputManagementSession | null = null;
  private managementOutcome: ComposerPendingInputLiveInvalidation | null = null;
  private ownerGone: ComposerPendingInputOwnerGoneResult | null = null;
  private acquiring = false;
  private mutating = false;
  private projectingSettledMoveSnapshot = false;
  private replayingAcceptedEvents = false;

  constructor(queue: ComposerInputQueue, host: ComposerPendingInputLiveManagementHost) {
    this.queue = queue;
    this.host = host;
  }

  beginPendingInputEdit(
    request: ComposerPendingInputManagementRequest,
    restore: ComposerPendingInputEditRestore,
    blockedByCoordinator: boolean,
  ): ComposerPendingInputCoordinatorBeginEditResult {
    if (this.ownerGone != null) return this.ownerGone;
    if (this.mutationPending()) return this.liveMutationPending();
    if (blockedByCoordinator || this.activeSession != null) {
      return this.liveSessionInvalidation();
    }

    this.acquiring = true;
    let acquisition:
      | Readonly<{
          type: "result";
          result: ReturnType<ComposerInputQueue["beginPendingInputEdit"]>;
        }>
      | Readonly<{ type: "failed"; error: unknown }>;
    try {
      acquisition = {
        type: "result",
        result: this.queue.beginPendingInputEdit(request, restore),
      };
    } catch (error: unknown) {
      acquisition = { type: "failed", error };
    } finally {
      this.acquiring = false;
    }
    const ownerGoneAfterAcquisition = this.readOwnerGone();
    if (ownerGoneAfterAcquisition != null) return ownerGoneAfterAcquisition;
    if (acquisition.type === "failed") {
      const replay = this.flushDeferredAcceptedEvents();
      const ownerGoneAfterFailedAcquisitionReplay = this.readOwnerGone();
      if (ownerGoneAfterFailedAcquisitionReplay != null) {
        return ownerGoneAfterFailedAcquisitionReplay;
      }
      if (replay.type === "failed") {
        throw new AggregateError(
          [acquisition.error, replay.error],
          "Restore and runtime replay failed",
        );
      }
      throw acquisition.error;
    }

    const settledResult = acquisition.result;
    switch (settledResult.type) {
      case "begun": {
        const session: PendingInputManagementSession = {
          key: request.key,
          reservation: settledResult.reservation,
          invalidation: null,
          settled: false,
        };
        this.activeSession = session;
        this.managementOutcome = null;
        const replay = this.flushDeferredAcceptedEvents();
        const ownerGoneAfterBegunReplay = this.readOwnerGone();
        if (ownerGoneAfterBegunReplay != null) return ownerGoneAfterBegunReplay;
        if (replay.type === "failed") {
          this.cancelUndeliveredManagementSession(session);
          this.host.publishSnapshot();
          const ownerGoneAfterCancelPublication = this.readOwnerGone();
          if (ownerGoneAfterCancelPublication != null) return ownerGoneAfterCancelPublication;
          throw replay.error;
        }
        this.host.publishSnapshot();
        const ownerGoneAfterBeginPublication = this.readOwnerGone();
        if (ownerGoneAfterBeginPublication != null) return ownerGoneAfterBeginPublication;
        const unavailable = this.managementSessionUnavailable(session);
        if (unavailable != null) return unavailable;
        return {
          type: "begun",
          revision: this.queue.detailRevision(),
          reservation: this.createManagementCapability(session),
        };
      }
      case "invalidDraft":
      case "stale":
      case "notManageable": {
        const replay = this.flushDeferredAcceptedEvents();
        const ownerGoneAfterInvalidResultReplay = this.readOwnerGone();
        if (ownerGoneAfterInvalidResultReplay != null) return ownerGoneAfterInvalidResultReplay;
        if (replay.type === "failed") throw replay.error;
        return { ...settledResult, scope: "liveOwner", revision: this.queue.detailRevision() };
      }
      case "conflict": {
        const replay = this.flushDeferredAcceptedEvents();
        const ownerGoneAfterConflictReplay = this.readOwnerGone();
        if (ownerGoneAfterConflictReplay != null) return ownerGoneAfterConflictReplay;
        if (replay.type === "failed") throw replay.error;
        return this.liveSessionInvalidation();
      }
    }
  }

  deletePendingInput(
    request: ComposerPendingInputManagementRequest,
    blockedByCoordinator: boolean,
  ): ComposerPendingInputCoordinatorDeleteResult {
    if (this.ownerGone != null) return this.ownerGone;
    if (this.mutationPending()) return this.liveMutationPending();
    if (blockedByCoordinator) return this.liveSessionInvalidation();
    const result = this.queue.deletePendingInput(request);
    switch (result.type) {
      case "deleted": {
        this.managementOutcome = null;
        this.handleManagementDrain(result.drainIntent);
        this.host.publishSnapshot();
        const ownerGoneAfterDeletePublication = this.readOwnerGone();
        if (ownerGoneAfterDeletePublication != null) return ownerGoneAfterDeletePublication;
        return { type: "deleted", revision: this.queue.detailRevision() };
      }
      case "stale":
      case "notManageable":
        return { ...result, scope: "liveOwner" };
      case "conflict":
        return this.liveSessionInvalidation(result.revision);
    }
  }

  movePendingInput(
    request: ComposerPendingInputMoveRequest,
    unavailableReason: ComposerPendingInputCoordinatorMoveUnavailable["reason"] | null,
  ): ComposerPendingInputCoordinatorMoveResult {
    if (this.ownerGone != null) return this.ownerGone;
    if (this.mutationPending()) return this.pendingInputMoveUnavailable("mutationPending");
    if (unavailableReason != null) return this.pendingInputMoveUnavailable(unavailableReason);
    if (this.activeSession != null) {
      return this.pendingInputMoveUnavailable("editInProgress");
    }

    this.mutating = true;
    try {
      const result = this.queue.movePendingInput(request);
      switch (result.type) {
        case "moved": {
          this.managementOutcome = null;
          this.projectingSettledMoveSnapshot = true;
          let firstFailure: AcceptedEventReplayResult = { type: "flushed" };
          try {
            this.host.publishSnapshot();
          } catch (error: unknown) {
            firstFailure = { type: "failed", error };
          }
          const ownerGoneAfterMovePublication = this.readOwnerGone();
          if (ownerGoneAfterMovePublication != null) return ownerGoneAfterMovePublication;

          while (this.deferredAcceptedEvents.length > 0) {
            const replay = this.flushDeferredAcceptedEvents();
            const ownerGoneAfterMoveReplay = this.readOwnerGone();
            if (ownerGoneAfterMoveReplay != null) return ownerGoneAfterMoveReplay;
            if (firstFailure.type === "flushed" && replay.type === "failed") {
              firstFailure = replay;
            }
          }
          const ownerGoneAfterMoveReplays = this.readOwnerGone();
          if (ownerGoneAfterMoveReplays != null) return ownerGoneAfterMoveReplays;
          if (firstFailure.type === "failed") throw firstFailure.error;

          const movement = this.queue.readPendingInputMovement({
            key: request.key,
            revision: this.queue.detailRevision(),
          });
          switch (movement.type) {
            case "movement":
              return {
                type: "moved",
                revision: movement.revision,
                lane: movement.lane,
                position: movement.movement.position,
                count: movement.movement.count,
              };
            case "stale":
            case "notManageable":
              return { ...movement, scope: "liveOwner" };
            case "conflict":
              return this.pendingInputMoveUnavailable("editInProgress", movement.revision);
          }
          movement satisfies never;
          throw new Error("Unhandled pending input movement result");
        }
        case "noOp":
          return result;
        case "stale":
        case "notManageable":
          return { ...result, scope: "liveOwner" };
        case "conflict":
          return this.pendingInputMoveUnavailable("editInProgress", result.revision);
      }
    } finally {
      this.projectingSettledMoveSnapshot = false;
      this.mutating = false;
    }
  }

  observeAcceptedEvent(payload: Readonly<ActiveThreadProjectionAcceptedEvent>): void {
    if (this.ownerGone != null) return;
    this.deferredAcceptedEvents.push(payload);
    if (this.acquiring || this.mutating || this.replayingAcceptedEvents) return;
    const replay = this.flushDeferredAcceptedEvents();
    const ownerGoneAfterReplay = this.readOwnerGone();
    if (ownerGoneAfterReplay != null) return;
    if (replay.type === "failed") throw replay.error;
    this.flushDeferredDrains();
  }

  consumeEditInvalidation(invalidation: ComposerPendingInputEditInvalidation | undefined): void {
    const session = this.activeSession;
    if (invalidation == null || session?.key !== invalidation.key) return;
    const outcome: ComposerPendingInputLiveInvalidation = {
      type: "unavailable",
      scope: "liveOwner",
      reason: "targetInvalidated",
      revision: this.queue.detailRevision(),
      key: invalidation.key,
      lane: invalidation.lane,
      targetReason: invalidation.targetReason,
    };
    session.invalidation = outcome;
    this.activeSession = null;
    this.managementOutcome = outcome;
  }

  flushDeferredDrains(): void {
    const lanes = [...this.deferredDrainLanes];
    this.deferredDrainLanes.clear();
    for (const [index, lane] of lanes.entries()) {
      const result = this.host.drainPendingInput({ lane });
      if (result === "consumed") continue;
      const firstDeferredIndex = result === "deferred" ? index : index + 1;
      for (const deferredLane of lanes.slice(firstDeferredIndex)) {
        this.deferredDrainLanes.add(deferredLane);
      }
      return;
    }
  }

  mutationPending(): boolean {
    return (
      this.acquiring ||
      this.mutating ||
      this.replayingAcceptedEvents ||
      this.deferredAcceptedEvents.length > 0
    );
  }

  hasActiveSession(): boolean {
    return this.activeSession != null;
  }

  blocksInterruptForSnapshot(): boolean {
    if (!this.projectingSettledMoveSnapshot) {
      return this.mutationPending() || this.activeSession != null;
    }
    return (
      this.acquiring ||
      this.replayingAcceptedEvents ||
      this.deferredAcceptedEvents.length > 0 ||
      this.activeSession != null
    );
  }

  outcome(): ComposerPendingInputLiveInvalidation | null {
    return this.managementOutcome;
  }

  dispose(ownerGone: ComposerPendingInputOwnerGoneResult): void {
    this.ownerGone = ownerGone;
    this.deferredDrainLanes.clear();
    this.deferredAcceptedEvents.length = 0;
    this.activeSession = null;
    this.managementOutcome = null;
    this.acquiring = false;
    this.mutating = false;
    this.projectingSettledMoveSnapshot = false;
    this.replayingAcceptedEvents = false;
  }

  private createManagementCapability(
    session: PendingInputManagementSession,
  ): ComposerPendingInputCoordinatorEditReservation {
    return {
      save: (capture) => {
        const unavailable = this.managementSessionUnavailable(session);
        if (unavailable != null) return unavailable;
        const result = session.reservation.save(capture);
        if (result.type === "invalidInput") return result;
        if (result.type === "unavailable") {
          return this.invalidateManagementSession(session);
        }
        const completion = this.completeManagementMutation(session, result.drainIntent);
        if ("type" in completion) return completion;
        return { type: "saved", revision: completion.revision };
      },
      cancel: () => {
        const unavailable = this.managementSessionUnavailable(session);
        if (unavailable != null) return unavailable;
        const result = session.reservation.cancel();
        if (result.type === "unavailable") {
          return this.invalidateManagementSession(session);
        }
        const completion = this.completeManagementMutation(session, result.drainIntent);
        if ("type" in completion) return completion;
        return { type: "cancelled", revision: completion.revision };
      },
    };
  }

  private completeManagementMutation(
    session: PendingInputManagementSession,
    drainIntent: ComposerPendingInputDrainIntent,
  ): Readonly<{ revision: number }> | ComposerPendingInputOwnerGoneResult {
    this.settleManagementSession(session);
    this.handleManagementDrain(drainIntent);
    this.host.publishSnapshot();
    if (this.ownerGone != null) return this.ownerGone;
    return { revision: this.queue.detailRevision() };
  }

  private readOwnerGone(): ComposerPendingInputOwnerGoneResult | null {
    return this.ownerGone;
  }

  private managementSessionUnavailable(
    session: PendingInputManagementSession,
  ):
    | ComposerPendingInputLiveInvalidation
    | ComposerPendingInputLiveSessionInvalidation
    | ComposerPendingInputOwnerGoneResult
    | null {
    if (this.ownerGone != null) return this.ownerGone;
    if (this.mutationPending()) return this.liveMutationPending();
    if (session.invalidation != null) return session.invalidation;
    if (session.settled || this.activeSession !== session) {
      return this.liveSessionInvalidation();
    }
    return null;
  }

  private settleManagementSession(session: PendingInputManagementSession): void {
    session.settled = true;
    if (this.activeSession === session) this.activeSession = null;
    this.managementOutcome = null;
  }

  private invalidateManagementSession(
    session: PendingInputManagementSession,
  ): ComposerPendingInputLiveSessionInvalidation {
    session.settled = true;
    if (this.activeSession === session) this.activeSession = null;
    const invalidation = this.liveSessionInvalidation();
    this.host.publishSnapshot();
    return invalidation;
  }

  private handleManagementDrain(intent: ComposerPendingInputDrainIntent): void {
    if (this.host.drainPendingInput(intent) === "deferred") {
      this.deferredDrainLanes.add(intent.lane);
    }
  }

  private flushDeferredAcceptedEvents(): AcceptedEventReplayResult {
    if (this.replayingAcceptedEvents) return { type: "flushed" };
    let replay: AcceptedEventReplayResult = { type: "flushed" };
    this.replayingAcceptedEvents = true;
    try {
      while (this.deferredAcceptedEvents.length > 0) {
        if (this.ownerGone != null) break;
        const payload = this.deferredAcceptedEvents.shift();
        if (payload == null) break;
        try {
          this.host.applyAcceptedEvent(payload);
        } catch (error: unknown) {
          replay = { type: "failed", error };
          break;
        }
      }
    } finally {
      this.replayingAcceptedEvents = false;
    }
    if (this.deferredAcceptedEvents.length === 0 && this.ownerGone == null) {
      try {
        this.host.publishSnapshot();
      } catch (error: unknown) {
        replay = {
          type: "failed",
          error:
            replay.type === "failed"
              ? new AggregateError(
                  [replay.error, error],
                  "Runtime replay and final snapshot publication failed",
                )
              : error,
        };
      }
    }
    return replay;
  }

  private cancelUndeliveredManagementSession(session: PendingInputManagementSession): void {
    if (this.activeSession !== session) return;
    const cancelled = session.reservation.cancel();
    if (cancelled.type === "cancelled") {
      this.settleManagementSession(session);
      this.deferredDrainLanes.add(cancelled.drainIntent.lane);
      return;
    }
    this.invalidateManagementSession(session);
  }

  private liveSessionInvalidation(
    revision: number = this.queue.detailRevision(),
  ): ComposerPendingInputLiveSessionInvalidation {
    return {
      type: "unavailable",
      scope: "liveOwner",
      reason: "sessionInvalidated",
      revision,
    };
  }

  private liveMutationPending(): ComposerPendingInputLiveSessionInvalidation {
    return {
      type: "unavailable",
      scope: "liveOwner",
      reason: "mutationPending",
      revision: this.queue.detailRevision(),
    };
  }

  private pendingInputMoveUnavailable(
    reason: ComposerPendingInputCoordinatorMoveUnavailable["reason"],
    revision: number = this.queue.detailRevision(),
  ): ComposerPendingInputCoordinatorMoveUnavailable {
    return {
      type: "unavailable",
      scope: "liveOwner",
      reason,
      revision,
    };
  }
}

export function createComposerPendingInputLiveManagement(
  queue: ComposerInputQueue,
  host: ComposerPendingInputLiveManagementHost,
): ComposerPendingInputLiveManagement {
  return new ComposerPendingInputLiveManagementImpl(queue, host);
}
