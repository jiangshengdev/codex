import type { AppDispatch } from "@/app/store";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
  type CreateComposerInputQueueCoordinatorInput,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  GuiHostCommandError,
  isGuiHostCommandError,
} from "@/features/guiHost/guiHostCommandGateway";
import { SkillCatalogOwner } from "@/features/skillCatalog/skillCatalogOwner";
import { createListenerSet } from "@/subscriptions/listenerSet";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import { createActiveThreadStatus, type ActiveThreadStatus } from "./activeThreadStatus";
import {
  type ActiveThreadProjection,
  type ActiveThreadProjectionStagedBatch,
} from "./activeThreadProjection";
import {
  createActiveThreadCompaction,
  type ActiveThreadCompaction,
  type ActiveThreadCompactionClaim,
  type ActiveThreadCompactionSettlement,
} from "./activeThreadCompaction";
import type { ActiveThreadProjectionAcceptedEvent } from "./activeThreadProjectionFacts";
import type { ActiveThreadSessionIdentity } from "./activeThreadSessionIdentity";
import { activeThreadReadModelTransitionApplied } from "./activeThreadSessionReadModel";
import type {
  ActiveThreadBeginPendingInputEditResult,
  ActiveThreadCompactionView,
  ActiveThreadPendingInputEditReservation,
  ActiveThreadReserveReleaseResult,
  ActiveThreadSessionOperationResult,
  ActiveThreadSessionOperationUnavailable,
  LiveActiveThreadSession,
  LiveActiveThreadSessionSnapshot,
} from "./activeThreadSessionContracts";

type LiveActiveThreadSessionCommands = Pick<
  GuiHostCommands,
  "compactThread" | "interruptTurn" | "listSkills" | "readThread" | "startTurn" | "steerTurn"
>;

export type CreateLiveActiveThreadSessionInput = Readonly<{
  identity: ActiveThreadSessionIdentity;
  sessionRevision: number;
  attachResponse: ThreadProjectionAttachResponse;
  projection: ActiveThreadProjection;
  commands: LiveActiveThreadSessionCommands;
  dispatch: AppDispatch;
  persistence: CreateComposerInputQueueCoordinatorInput["persistence"];
}>;

class LiveActiveThreadSessionImpl implements LiveActiveThreadSession {
  readonly identity: ActiveThreadSessionIdentity;
  private readonly threadId: string;
  private subscriptionId: string;
  private projection: ActiveThreadProjection;
  private readonly queue: ComposerInputQueueCoordinator;
  private readonly compaction: ActiveThreadCompaction;
  private readonly compactThread: LiveActiveThreadSessionCommands["compactThread"];
  private readonly skillCatalog: SkillCatalogOwner;
  private readonly threadStatus: ActiveThreadStatus;
  private readonly dispatch: AppDispatch;
  private readonly listeners = createListenerSet();
  private readonly unsubscribeQueue: () => void;
  private readonly unsubscribeSkills: () => void;
  private readonly unsubscribeThreadStatus: () => void;
  private snapshot: LiveActiveThreadSessionSnapshot;
  private revision: number;
  private generation = 0;
  private editGeneration = 0;
  private projectionRecovery: Extract<
    LiveActiveThreadSessionSnapshot,
    { phase: "projectionUnavailable" }
  >["recovery"] = {
    pending: false,
    error: null,
  };
  private activeTurnId: Turn["id"] | null;
  private projectionUnavailableReason:
    | Extract<LiveActiveThreadSessionSnapshot, { phase: "projectionUnavailable" }>["reason"]
    | null = null;
  private transactionDepth = 0;
  private childChanged = false;
  private releaseHandoff: ReleaseHandoff | null = null;
  private disposed = false;

  constructor({
    identity,
    sessionRevision,
    attachResponse,
    projection,
    commands,
    dispatch,
    persistence,
  }: CreateLiveActiveThreadSessionInput) {
    const thread = attachResponse.snapshot.thread;
    if (
      identity.threadId !== thread.id ||
      projection.threadId !== thread.id ||
      projection.subscriptionId !== attachResponse.subscriptionId
    ) {
      throw new Error("Live active thread session projection identity mismatch");
    }
    this.threadId = thread.id;
    this.identity = identity;
    this.subscriptionId = attachResponse.subscriptionId;
    this.projection = projection;
    this.compactThread = commands.compactThread;
    this.dispatch = dispatch;
    this.revision = sessionRevision;
    this.activeTurnId = activeTurnIdFromTurns(thread.turns);
    this.queue = createComposerInputQueueCoordinator({
      threadId: this.threadId,
      activeTurnId: this.activeTurnId,
      startTurn: commands.startTurn,
      steerTurn: commands.steerTurn,
      interruptTurn: commands.interruptTurn,
      persistence,
    });
    this.compaction = createActiveThreadCompaction();
    this.skillCatalog = new SkillCatalogOwner({ cwd: thread.cwd, listSkills: commands.listSkills });
    this.threadStatus = createActiveThreadStatus({
      threadId: this.threadId,
      initialStatus: thread.status,
      readThread: commands.readThread,
    });
    this.transactionDepth = 1;
    this.unsubscribeQueue = this.queue.subscribe(this.handleChildPublication);
    this.unsubscribeSkills = this.skillCatalog.subscribe(this.handleChildPublication);
    this.unsubscribeThreadStatus = this.threadStatus.subscribe(this.handleChildPublication);
    try {
      this.skillCatalog.start();
      this.queue.reconcileRestoredTurns(thread.turns);
      const initialBatch = this.projection.flush();
      this.applyProjectionPhase(initialBatch);
      this.applyQueueFacts(initialBatch.acceptedQueueFacts);
      this.queue.completeRestoreReconciliation();
      this.transactionDepth = 0;
      this.childChanged = false;
      this.dispatch(
        activeThreadReadModelTransitionApplied({
          identity: this.identity,
          sessionRevision: this.revision,
          facts: initialBatch.readModelFacts,
        }),
      );
      this.snapshot = this.buildSnapshot();
    } catch (error: unknown) {
      try {
        this.dispose();
      } catch (cleanupError: unknown) {
        throw new AggregateError(
          [error, cleanupError],
          "Live session initialization and cleanup failed",
          { cause: cleanupError },
        );
      }
      throw error;
    }
  }

  getSnapshot = (): LiveActiveThreadSessionSnapshot => this.snapshot;

  beginProjectionRecovery = (): boolean => {
    if (
      this.disposed ||
      this.projectionUnavailableReason == null ||
      this.projectionRecovery.pending
    )
      return false;
    this.projectionRecovery = { ...this.projectionRecovery, pending: true };
    this.publishTransition([]);
    return !this.disposed;
  };

  failProjectionRecovery = (error: unknown): void => {
    if (this.disposed) return;
    this.projectionRecovery = { pending: false, error };
    this.publishTransition([]);
  };

  commitProjectionRecovery: LiveActiveThreadSession["commitProjectionRecovery"] = (
    response,
    projection,
    drainCandidate,
  ) => {
    if (this.disposed || !this.projectionRecovery.pending || !drainCandidate())
      return { type: "unavailable" };
    if (
      response.snapshot.thread.id !== this.threadId ||
      projection.threadId !== this.threadId ||
      projection.subscriptionId !== response.subscriptionId
    ) {
      throw new Error("Recovered projection identity mismatch");
    }
    const originalReason = this.projectionUnavailableReason;
    const fail = (
      result: Extract<
        ReturnType<LiveActiveThreadSession["commitProjectionRecovery"]>,
        { type: "failed" | "blocked" }
      >,
    ) => {
      this.projectionUnavailableReason = originalReason;
      this.failProjectionRecovery(result.error);
      return result;
    };
    const saveBatch = (batch: ActiveThreadProjectionStagedBatch, turns: readonly Turn[] | null) => {
      if (batch.readModelFacts.some((fact) => fact.type === "projectionUnavailable")) {
        return {
          type: "failed",
          error: new Error("The new subscription stopped during synchronization recovery"),
        } as const;
      }
      return this.queue.reconcileProjection(turns, batch.acceptedQueueFacts);
    };
    const facts: ActiveThreadProjectionStagedBatch["readModelFacts"][number][] = [];
    const queueFacts: ActiveThreadProjectionAcceptedEvent[] = [];
    this.transactionDepth += 1;
    try {
      let turns: readonly Turn[] | null = response.snapshot.thread.turns;
      while (!this.isDisposed()) {
        if (!drainCandidate()) return { type: "unavailable" };
        const batch = projection.flush();
        if (
          turns == null &&
          batch.readModelFacts.length === 0 &&
          batch.acceptedQueueFacts.length === 0
        )
          break;
        const result = saveBatch(batch, turns);
        if (this.isDisposed()) return { type: "unavailable" };
        if (result.type !== "committed") return fail(result);
        facts.push(...batch.readModelFacts);
        queueFacts.push(...batch.acceptedQueueFacts);
        turns = null;
      }
      if (this.isDisposed()) return { type: "unavailable" };
      this.activeTurnId = activeTurnIdFromTurns(response.snapshot.thread.turns);
      this.compaction.reconcileSnapshot(response.snapshot.thread.turns);
      this.threadStatus.rebase(response.snapshot.thread.status);
      this.applyOwnerFacts(queueFacts);
      this.projection = projection;
      this.subscriptionId = response.subscriptionId;
    } finally {
      if (!this.isDisposed()) this.transactionDepth -= 1;
      this.childChanged = false;
    }
    if (this.isDisposed()) return { type: "unavailable" };
    this.publishTransition(facts);
    // Publications can synchronously deliver new notifications. Keep sending frozen
    // until each notification buffered during the handoff has been accepted.
    const drainPublished = (): ReturnType<LiveActiveThreadSession["commitProjectionRecovery"]> => {
      while (!this.isDisposed() && drainCandidate()) {
        const next = projection.flush();
        if (next.readModelFacts.length === 0 && next.acceptedQueueFacts.length === 0)
          return { type: "recovered" };
        this.transactionDepth += 1;
        try {
          const result = saveBatch(next, null);
          if (this.isDisposed()) return { type: "unavailable" };
          if (result.type !== "committed") return fail(result);
          this.applyOwnerFacts(next.acceptedQueueFacts);
        } finally {
          if (!this.isDisposed()) this.transactionDepth -= 1;
          this.childChanged = false;
        }
        this.publishTransition(next.readModelFacts);
      }
      return { type: "unavailable" };
    };
    const drained = drainPublished();
    if (drained.type !== "recovered") return drained;
    this.projectionUnavailableReason = null;
    this.publishTransition([]);
    const published = drainPublished();
    if (published.type !== "recovered") return published;
    this.projectionRecovery = { pending: false, error: null };
    this.runChildTransaction(() => {
      this.queue.setProjectionUnavailable(false);
    });
    if (this.isDisposed()) return { type: "unavailable" };
    return { type: "recovered" };
  };

  getDraft: LiveActiveThreadSession["getDraft"] = () => this.queue.getDraft();

  saveDraft: LiveActiveThreadSession["saveDraft"] = (expectedRevision, draft) =>
    this.mutate(expectedRevision, () => this.queue.saveDraft(draft));

  retryPersistence: LiveActiveThreadSession["retryPersistence"] = (expectedRevision) =>
    this.mutate(expectedRevision, () => this.queue.retryPersistence());

  resumeRestored: LiveActiveThreadSession["resumeRestored"] = (
    expectedRevision,
    expectedPersistenceRevision,
  ) => this.mutate(expectedRevision, () => this.queue.resumeRestored(expectedPersistenceRevision));

  discardUnknown: LiveActiveThreadSession["discardUnknown"] = (
    expectedRevision,
    id,
    expectedPersistenceRevision,
  ) =>
    this.mutate(expectedRevision, () => this.queue.discardUnknown(id, expectedPersistenceRevision));

  suspendRestored = (): void => {
    if (!this.disposed)
      this.runChildTransaction(() => {
        this.queue.suspendRestored();
      });
  };

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    return this.listeners.subscribe(listener);
  };

  submit: LiveActiveThreadSession["submit"] = (expectedRevision, capture) =>
    this.mutate(expectedRevision, () => this.queue.submit(capture));

  submitSteer: LiveActiveThreadSession["submitSteer"] = (expectedRevision, capture) =>
    this.mutate(expectedRevision, () => this.queue.submitSteer(capture));

  promoteOrdinaryFrontToSteer: LiveActiveThreadSession["promoteOrdinaryFrontToSteer"] = (
    expectedRevision,
  ) => this.mutate(expectedRevision, () => this.queue.promoteOrdinaryFrontToSteer());

  interruptActiveTurn: LiveActiveThreadSession["interruptActiveTurn"] = (expectedRevision) =>
    this.mutate(expectedRevision, () => this.queue.interruptActiveTurn());

  recover: LiveActiveThreadSession["recover"] = (expectedRevision) =>
    this.mutate(expectedRevision, () => this.queue.recover());

  requestCompaction: LiveActiveThreadSession["requestCompaction"] = (expectedRevision) => {
    const unavailable = this.operationUnavailable(expectedRevision);
    if (unavailable != null) return unavailable;
    if (this.activeTurnId != null) return { type: "rejected", reason: "activeTurn" };
    if (this.compaction.getState().phase !== "idle") {
      return { type: "rejected", reason: "operationInProgress" };
    }

    const claimResult = this.runChildTransaction(() => {
      const reserved = this.queue.reserveRelease();
      if (reserved.type === "blocked") return reserved;
      return this.compaction.claimRequest(reserved.reservation);
    });
    if (claimResult.type === "blocked") {
      if ("blockers" in claimResult) return claimResult;
      return claimResult.reason === "disposed"
        ? this.unavailable("disposed")
        : { type: "rejected", reason: "operationInProgress" };
    }

    const generation = this.generation;
    const claim = claimResult.claim;
    this.compactThread({ threadId: this.threadId }).then(
      () => {
        this.settleCompactionRequest(generation, claim, { type: "accepted" });
      },
      (error: unknown) => {
        this.settleCompactionRequest(generation, claim, {
          type: "rejected",
          error: compactionCommandError(error),
        });
      },
    );
    return { type: "accepted" };
  };

  readPendingInputPage: LiveActiveThreadSession["readPendingInputPage"] = (request) =>
    this.queue.readPendingInputPage(request);

  readPendingInputDetail: LiveActiveThreadSession["readPendingInputDetail"] = (request) =>
    this.queue.readPendingInputDetail(request);

  beginPendingInputEdit: LiveActiveThreadSession["beginPendingInputEdit"] = (
    expectedRevision,
    request,
    restore,
  ) => {
    const result = this.mutate(expectedRevision, () =>
      this.queue.beginPendingInputEdit(request, restore),
    );
    if (isSessionUnavailable(result) || result.type !== "begun") return result;
    const capabilityGeneration = this.editGeneration;
    const childReservation = result.reservation;
    let cleanupCompleted = false;
    const unavailableAfterCleanup = (
      unavailable: ActiveThreadSessionOperationUnavailable,
    ): ActiveThreadSessionOperationUnavailable => {
      if (!cleanupCompleted) {
        cleanupCompleted = true;
        if (unavailable.reason !== "disposed") {
          this.runChildTransaction(childReservation.cancel);
        }
      }
      return this.unavailable(unavailable.reason);
    };
    const runCapabilityOperation = <Result>(
      operation: () => Result,
    ): ActiveThreadSessionOperationResult<Result> => {
      const unavailable = this.pendingEditUnavailable(capabilityGeneration);
      if (unavailable != null) return unavailableAfterCleanup(unavailable);
      return this.runChildTransaction(operation);
    };
    const reservation: ActiveThreadPendingInputEditReservation = {
      save: (capture) => runCapabilityOperation(() => childReservation.save(capture)),
      cancel: () => runCapabilityOperation(childReservation.cancel),
    };
    return { ...result, reservation } satisfies ActiveThreadBeginPendingInputEditResult;
  };

  deletePendingInput: LiveActiveThreadSession["deletePendingInput"] = (expectedRevision, request) =>
    this.mutate(expectedRevision, () => this.queue.deletePendingInput(request));

  movePendingInput: LiveActiveThreadSession["movePendingInput"] = (expectedRevision, request) =>
    this.mutate(expectedRevision, () => this.queue.movePendingInput(request));

  getReleaseReadiness: LiveActiveThreadSession["getReleaseReadiness"] = () =>
    this.queue.getReleaseReadiness();

  reserveRelease: LiveActiveThreadSession["reserveRelease"] = (expectedRevision) => {
    const unavailable = this.operationUnavailable(expectedRevision);
    if (unavailable != null) return unavailable;
    if (this.releaseHandoff != null) {
      const nested = this.queue.reserveRelease();
      switch (nested.type) {
        case "blocked":
          return nested;
        case "reserved":
          throw new Error("Nested active thread release unexpectedly reserved the child queue");
      }
    }
    const handoff: ReleaseHandoff = {
      revision: this.revision,
      generation: this.generation,
      snapshot: this.snapshot,
      queueCapability: this.queueCapabilityFingerprint(),
      settled: false,
    };
    this.transactionDepth += 1;
    let result: ReturnType<ComposerInputQueueCoordinator["reserveRelease"]>;
    try {
      result = this.queue.reserveRelease();
    } catch (error: unknown) {
      this.transactionDepth -= 1;
      this.childChanged = false;
      throw error;
    }
    if (result.type !== "reserved") {
      this.transactionDepth -= 1;
      this.childChanged = false;
      return result;
    }
    this.childChanged = false;
    this.releaseHandoff = handoff;
    const childReservation = result.reservation;
    const reservation = {
      release: () => {
        const blocked = this.releaseHandoffUnavailable(handoff);
        if (this.disposed || this.releaseHandoff !== handoff || handoff.settled)
          return blocked ?? this.unavailable("staleRevision");
        const changed = this.childChanged || handoff.revision !== this.revision;
        try {
          childReservation.release();
        } finally {
          this.closeReleaseHandoff(handoff);
        }
        if (changed) this.publishTransition([]);
        if (!changed && this.queueCapabilityFingerprint() !== handoff.queueCapability) {
          throw new Error("Aborted active thread release did not restore queue capability");
        }
        return { type: "released" } as const;
      },
      commit: () => {
        const blocked = this.releaseHandoffUnavailable(handoff);
        if (blocked != null) return blocked;
        this.closeReleaseHandoff(handoff);
        return { type: "committed" } as const;
      },
    };
    return { type: "reserved", reservation } satisfies ActiveThreadReserveReleaseResult;
  };

  retrySkills: LiveActiveThreadSession["retrySkills"] = (expectedRevision) =>
    this.mutate(expectedRevision, () => this.skillCatalog.retry());

  refreshSkills: LiveActiveThreadSession["refreshSkills"] = (expectedRevision) =>
    this.mutate(expectedRevision, () => this.skillCatalog.invalidate());

  invalidateSkills: LiveActiveThreadSession["invalidateSkills"] = (expectedRevision) =>
    this.mutate(expectedRevision, () => this.skillCatalog.invalidate());

  invalidateThreadStatus = (): boolean => this.threadStatus.invalidate();

  settleThreadStatusInvalidations = (): Promise<void> => this.threadStatus.settleInvalidations();

  handleProjectionEvent = (
    notification: ThreadProjectionEventNotification,
  ): ReturnType<ActiveThreadProjection["handleEvent"]> => {
    const outcome = this.projection.handleEvent(notification);
    if (outcome.type !== "ignored") this.applyProjectionBatch(this.projection.flush());
    return outcome;
  };

  handleProjectionDelta = (
    notification: ThreadProjectionDeltaNotification,
  ): ReturnType<ActiveThreadProjection["handleDelta"]> => this.projection.handleDelta(notification);

  handleProjectionClosed = (
    notification: ThreadProjectionClosedNotification,
  ): ReturnType<ActiveThreadProjection["handleClosed"]> => {
    const outcome = this.projection.handleClosed(notification);
    if (outcome.type !== "ignored") this.applyProjectionBatch(this.projection.flush());
    return outcome;
  };

  flushProjection = (): void => {
    this.applyProjectionBatch(this.projection.flush());
  };

  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.releaseHandoff = null;
    this.transactionDepth = 0;
    this.childChanged = false;
    this.unsubscribeQueue();
    this.unsubscribeSkills();
    this.unsubscribeThreadStatus();
    try {
      this.compaction.dispose();
      this.queue.dispose();
    } finally {
      try {
        this.skillCatalog.dispose();
      } finally {
        this.threadStatus.dispose();
      }
    }
    this.revision += 1;
    this.snapshot = { phase: "disposed", revision: this.revision };
    this.notifyListeners();
    this.listeners.clear();
  };

  private readonly handleChildPublication = (): void => {
    if (this.disposed) return;
    if (this.transactionDepth > 0) {
      this.childChanged = true;
      return;
    }
    this.publishTransition([]);
  };

  private mutate<Result>(
    expectedRevision: number,
    operation: () => Result,
  ): ActiveThreadSessionOperationResult<Result> {
    const unavailable = this.operationUnavailable(expectedRevision);
    if (unavailable != null) return unavailable;
    return this.runChildTransaction(operation);
  }

  private runChildTransaction<Result>(operation: () => Result): Result {
    const outermost = this.transactionDepth === 0;
    const queueCapabilityBefore = outermost ? this.queueCapabilityFingerprint() : null;
    const compactionStateBefore = outermost ? this.compaction.getState() : null;
    this.transactionDepth += 1;
    try {
      return operation();
    } finally {
      this.transactionDepth -= 1;
      const queueCapabilityChanged =
        outermost && queueCapabilityBefore !== this.queueCapabilityFingerprint();
      const compactionStateChanged =
        outermost && compactionStateBefore !== this.compaction.getState();
      if (
        this.transactionDepth === 0 &&
        (this.childChanged || queueCapabilityChanged || compactionStateChanged)
      ) {
        this.childChanged = false;
        this.publishTransition([]);
      }
    }
  }

  private pendingEditUnavailable(
    expectedGeneration: number,
  ): ActiveThreadSessionOperationUnavailable | null {
    if (this.disposed) return this.unavailable("disposed");
    if (this.projectionUnavailableReason != null) {
      return this.unavailable("projectionUnavailable");
    }
    if (expectedGeneration !== this.editGeneration) return this.unavailable("staleRevision");
    return null;
  }

  private operationUnavailable(
    expectedRevision: number,
  ): ActiveThreadSessionOperationUnavailable | null {
    if (this.disposed) return this.unavailable("disposed");
    if (expectedRevision !== this.revision) return this.unavailable("staleRevision");
    if (this.projectionUnavailableReason != null || this.projectionRecovery.pending)
      return this.unavailable("projectionUnavailable");
    return null;
  }

  private unavailable(
    reason: ActiveThreadSessionOperationUnavailable["reason"],
  ): ActiveThreadSessionOperationUnavailable {
    return { type: "unavailable", scope: "activeThreadSession", reason, revision: this.revision };
  }

  private queueCapabilityFingerprint(): string {
    return JSON.stringify({
      snapshot: this.queue.getSnapshot(),
      releaseReadiness: this.queue.getReleaseReadiness(),
    });
  }

  private releaseHandoffUnavailable(
    handoff: ReleaseHandoff,
  ): ActiveThreadSessionOperationUnavailable | null {
    if (this.disposed || handoff.generation !== this.generation) {
      return this.unavailable("disposed");
    }
    if (
      handoff.settled ||
      this.releaseHandoff !== handoff ||
      handoff.revision !== this.revision ||
      this.childChanged
    ) {
      return this.unavailable("staleRevision");
    }
    if (this.projectionUnavailableReason != null) {
      return this.unavailable("projectionUnavailable");
    }
    return null;
  }

  private closeReleaseHandoff(handoff: ReleaseHandoff): void {
    handoff.settled = true;
    if (this.releaseHandoff === handoff) this.releaseHandoff = null;
    this.transactionDepth -= 1;
    this.childChanged = false;
    if (handoff.revision === this.revision) this.snapshot = handoff.snapshot;
  }

  private applyProjectionBatch(batch: ActiveThreadProjectionStagedBatch): void {
    if (batch.readModelFacts.length === 0 && batch.acceptedQueueFacts.length === 0) return;
    this.transactionDepth += 1;
    try {
      this.applyProjectionPhase(batch);
      this.applyQueueFacts(batch.acceptedQueueFacts);
    } finally {
      this.transactionDepth -= 1;
    }
    this.childChanged = false;
    this.publishTransition(batch.readModelFacts);
  }

  private applyQueueFacts(facts: readonly ActiveThreadProjectionAcceptedEvent[]): void {
    for (const fact of facts) {
      this.queue.observeAcceptedEvent(fact);
    }
    this.applyOwnerFacts(facts);
  }

  private applyOwnerFacts(facts: readonly ActiveThreadProjectionAcceptedEvent[]): void {
    for (const fact of facts) {
      if (fact.replay === "live") {
        switch (fact.notification.event.type) {
          case "turnStarted":
            this.activeTurnId = fact.notification.event.notification.turn.id;
            break;
          case "turnCompleted":
            if (this.activeTurnId === fact.notification.event.notification.turn.id) {
              this.activeTurnId = null;
            }
            break;
          case "itemStarted":
          case "itemCompleted":
          case "tokenUsageUpdated":
            break;
        }
      }
      this.compaction.observeAcceptedEvent(fact);
    }
  }

  private applyProjectionPhase(batch: ActiveThreadProjectionStagedBatch): void {
    for (const fact of batch.readModelFacts) {
      if (fact.type === "projectionUnavailable") {
        if (this.projectionUnavailableReason == null) {
          this.editGeneration += 1;
          this.projectionRecovery = { pending: false, error: null };
        }
        this.projectionUnavailableReason = fact.reason;
        this.queue.setProjectionUnavailable(true);
      }
    }
  }

  private publishTransition(
    facts: Parameters<typeof activeThreadReadModelTransitionApplied>[0]["facts"],
  ): void {
    if (this.disposed) return;
    const revision = this.revision + 1;
    this.dispatch(
      activeThreadReadModelTransitionApplied({
        identity: this.identity,
        sessionRevision: revision,
        facts,
      }),
    );
    if (this.isDisposed()) return;
    this.revision = revision;
    this.snapshot = this.buildSnapshot();
    this.notifyListeners();
  }

  private buildSnapshot(): LiveActiveThreadSessionSnapshot {
    if (this.disposed) return { phase: "disposed", revision: this.revision };
    const contents = {
      identity: this.identity,
      revision: this.revision,
      threadId: this.threadId,
      subscriptionId: this.subscriptionId,
      activeTurnId: this.activeTurnId,
      threadStatus: this.threadStatus.getSnapshot(),
      compaction: this.compactionView(),
      composer: this.queue.getSnapshot(),
      skills: this.skillCatalog.getSnapshot(),
    };
    return this.projectionUnavailableReason == null
      ? { phase: "active", ...contents }
      : {
          phase: "projectionUnavailable",
          reason: this.projectionUnavailableReason,
          recovery: this.projectionRecovery,
          ...contents,
        };
  }

  private notifyListeners(): void {
    this.listeners.notify();
  }

  private isDisposed(): boolean {
    // Child publications and dispatch subscribers may synchronously dispose this owner.
    return this.disposed;
  }

  private settleCompactionRequest(
    generation: number,
    claim: ActiveThreadCompactionClaim,
    settlement: ActiveThreadCompactionSettlement,
  ): void {
    if (this.disposed || generation !== this.generation) return;
    this.runChildTransaction(() => this.compaction.settleRequest(claim, settlement));
  }

  private compactionView(): ActiveThreadCompactionView {
    const state = this.compaction.getState();
    if (state.phase !== "idle") {
      return {
        phase: state.phase,
        canRequest: false,
        startFailure: state.phase === "running" ? null : state.startFailure,
      };
    }
    return {
      phase: "idle",
      canRequest:
        this.projectionUnavailableReason == null &&
        this.activeTurnId == null &&
        this.queue.getReleaseReadiness().type === "safe",
      startFailure: state.startFailure,
    };
  }
}

const activeTurnIdFromTurns = (turns: Turn[]): Turn["id"] | null =>
  turns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null;

function isSessionUnavailable(result: {
  type: string;
  scope?: string;
}): result is ActiveThreadSessionOperationUnavailable {
  return result.type === "unavailable" && result.scope === "activeThreadSession";
}

function compactionCommandError(error: unknown): GuiHostCommandError {
  if (isGuiHostCommandError(error)) return error;
  return new GuiHostCommandError({
    source: "send",
    delivery: "deliveryUnknown",
    error: error instanceof Error ? error : new Error("Unexpected compaction command failure"),
  });
}

type ReleaseHandoff = {
  revision: number;
  generation: number;
  snapshot: LiveActiveThreadSessionSnapshot;
  queueCapability: string;
  settled: boolean;
};

export function createLiveActiveThreadSession(
  input: CreateLiveActiveThreadSessionInput,
): LiveActiveThreadSession {
  return new LiveActiveThreadSessionImpl(input);
}
