import type { AppDispatch } from "@/app/store";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { SkillCatalogOwner } from "@/features/skillCatalog/skillCatalogOwner";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  Turn,
} from "@codex-protocol/v2";
import {
  type ActiveThreadProjection,
  type ActiveThreadProjectionAcceptedQueueFact,
  type ActiveThreadProjectionStagedBatch,
} from "./activeThreadProjection";
import { activeThreadReadModelTransitionApplied } from "./activeThreadSessionReadModel";
import type {
  ActiveThreadBeginPendingInputEditResult,
  ActiveThreadPendingInputEditReservation,
  ActiveThreadReserveReleaseResult,
  ActiveThreadSessionOperationResult,
  ActiveThreadSessionOperationUnavailable,
  LiveActiveThreadSession,
  LiveActiveThreadSessionSnapshot,
} from "./activeThreadSessionContracts";

type LiveActiveThreadSessionCommands = Pick<
  GuiHostCommands,
  "interruptTurn" | "listSkills" | "startTurn" | "steerTurn"
>;

export type CreateLiveActiveThreadSessionInput = Readonly<{
  sessionRevision: number;
  attachResponse: ThreadProjectionAttachResponse;
  projection: ActiveThreadProjection;
  commands: LiveActiveThreadSessionCommands;
  dispatch: AppDispatch;
}>;

class LiveActiveThreadSessionImpl implements LiveActiveThreadSession {
  private readonly threadId: string;
  private readonly subscriptionId: string;
  private readonly projection: ActiveThreadProjection;
  private readonly queue: ComposerInputQueueCoordinator;
  private readonly skillCatalog: SkillCatalogOwner;
  private readonly dispatch: AppDispatch;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeQueue: () => void;
  private readonly unsubscribeSkills: () => void;
  private snapshot: LiveActiveThreadSessionSnapshot;
  private revision: number;
  private generation = 0;
  private activeTurnId: Turn["id"] | null;
  private projectionUnavailableReason: Extract<
    LiveActiveThreadSessionSnapshot,
    { phase: "projectionUnavailable" }
  >["reason"] | null = null;
  private transactionDepth = 0;
  private childChanged = false;
  private releaseHandoff: ReleaseHandoff | null = null;
  private disposed = false;

  constructor({
    sessionRevision,
    attachResponse,
    projection,
    commands,
    dispatch,
  }: CreateLiveActiveThreadSessionInput) {
    const thread = attachResponse.snapshot.thread;
    if (
      projection.threadId !== thread.id ||
      projection.subscriptionId !== attachResponse.subscriptionId
    ) {
      throw new Error("Live active thread session projection identity mismatch");
    }
    this.threadId = thread.id;
    this.subscriptionId = attachResponse.subscriptionId;
    this.projection = projection;
    this.dispatch = dispatch;
    this.revision = sessionRevision;
    this.activeTurnId = activeTurnIdFromTurns(thread.turns);
    this.queue = createComposerInputQueueCoordinator({
      threadId: this.threadId,
      activeTurnId: this.activeTurnId,
      startTurn: commands.startTurn,
      steerTurn: commands.steerTurn,
      interruptTurn: commands.interruptTurn,
    });
    this.skillCatalog = new SkillCatalogOwner({ cwd: thread.cwd, listSkills: commands.listSkills });
    this.transactionDepth = 1;
    this.unsubscribeQueue = this.queue.subscribe(this.handleChildPublication);
    this.unsubscribeSkills = this.skillCatalog.subscribe(this.handleChildPublication);
    this.skillCatalog.start();
    const initialBatch = this.projection.flush();
    this.applyQueueFacts(initialBatch.acceptedQueueFacts);
    this.applyProjectionPhase(initialBatch);
    this.transactionDepth = 0;
    this.childChanged = false;
    this.dispatch(
      activeThreadReadModelTransitionApplied({
        sessionRevision: this.revision,
        facts: initialBatch.readModelFacts,
      }),
    );
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): LiveActiveThreadSessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => undefined;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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
    const capabilityRevision = this.revision;
    const capabilityGeneration = this.generation;
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
      const unavailable = this.capabilityUnavailable(capabilityRevision, capabilityGeneration);
      if (unavailable != null) return unavailableAfterCleanup(unavailable);
      return this.runChildTransaction(operation);
    };
    const reservation: ActiveThreadPendingInputEditReservation = {
      save: (capture) => runCapabilityOperation(() => childReservation.save(capture)),
      cancel: () => runCapabilityOperation(childReservation.cancel),
    };
    return { ...result, reservation } satisfies ActiveThreadBeginPendingInputEditResult;
  };

  deletePendingInput: LiveActiveThreadSession["deletePendingInput"] = (
    expectedRevision,
    request,
  ) => this.mutate(expectedRevision, () => this.queue.deletePendingInput(request));

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
    this.releaseHandoff = handoff;
    const childReservation = result.reservation;
    const reservation = {
      release: () => {
        const blocked = this.releaseHandoffUnavailable(handoff);
        if (blocked != null) return blocked;
        try {
          childReservation.release();
        } finally {
          this.closeReleaseHandoff(handoff);
        }
        if (this.queueCapabilityFingerprint() !== handoff.queueCapability) {
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
    try {
      this.queue.dispose();
    } finally {
      this.skillCatalog.dispose();
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
    this.transactionDepth += 1;
    try {
      return operation();
    } finally {
      this.transactionDepth -= 1;
      const queueCapabilityChanged =
        outermost && queueCapabilityBefore !== this.queueCapabilityFingerprint();
      if (this.transactionDepth === 0 && (this.childChanged || queueCapabilityChanged)) {
        this.childChanged = false;
        this.publishTransition([]);
      }
    }
  }

  private capabilityUnavailable(
    expectedRevision: number,
    expectedGeneration: number,
  ): ActiveThreadSessionOperationUnavailable | null {
    if (this.disposed) return this.unavailable("disposed");
    if (expectedGeneration !== this.generation) {
      return this.unavailable("staleRevision");
    }
    if (this.projectionUnavailableReason != null) {
      return this.unavailable("projectionUnavailable");
    }
    return this.operationUnavailable(expectedRevision);
  }

  private operationUnavailable(expectedRevision: number): ActiveThreadSessionOperationUnavailable | null {
    if (this.disposed) return this.unavailable("disposed");
    if (expectedRevision !== this.revision) return this.unavailable("staleRevision");
    if (this.projectionUnavailableReason != null) return this.unavailable("projectionUnavailable");
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
      handoff.revision !== this.revision
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
    this.snapshot = handoff.snapshot;
  }

  private applyProjectionBatch(batch: ActiveThreadProjectionStagedBatch): void {
    if (batch.readModelFacts.length === 0 && batch.acceptedQueueFacts.length === 0) return;
    this.transactionDepth += 1;
    try {
      this.applyQueueFacts(batch.acceptedQueueFacts);
      this.applyProjectionPhase(batch);
    } finally {
      this.transactionDepth -= 1;
    }
    this.childChanged = false;
    this.publishTransition(batch.readModelFacts);
  }

  private applyQueueFacts(facts: readonly ActiveThreadProjectionAcceptedQueueFact[]): void {
    for (const fact of facts) {
      this.queue.observeAcceptedEvent(fact);
      if (fact.replay !== "live") continue;
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
  }

  private applyProjectionPhase(batch: ActiveThreadProjectionStagedBatch): void {
    for (const fact of batch.readModelFacts) {
      if (fact.type === "projectionUnavailable") {
        this.projectionUnavailableReason = fact.reason;
      }
    }
  }

  private publishTransition(
    facts: Parameters<typeof activeThreadReadModelTransitionApplied>[0]["facts"],
  ): void {
    if (this.disposed) return;
    const revision = this.revision + 1;
    this.dispatch(activeThreadReadModelTransitionApplied({ sessionRevision: revision, facts }));
    this.revision = revision;
    this.snapshot = this.buildSnapshot();
    this.notifyListeners();
  }

  private buildSnapshot(): LiveActiveThreadSessionSnapshot {
    if (this.disposed) return { phase: "disposed", revision: this.revision };
    const contents = {
      revision: this.revision,
      threadId: this.threadId,
      subscriptionId: this.subscriptionId,
      activeTurnId: this.activeTurnId,
      composer: this.queue.getSnapshot(),
      skills: this.skillCatalog.getSnapshot(),
    };
    return this.projectionUnavailableReason == null
      ? { phase: "active", ...contents }
      : {
          phase: "projectionUnavailable",
          reason: this.projectionUnavailableReason,
          recovery: "connectionRestartRequired",
          ...contents,
        };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) listener();
  }
}

const activeTurnIdFromTurns = (turns: Turn[]): Turn["id"] | null =>
  turns.toReversed().find((turn) => turn.status === "inProgress")?.id ?? null;

function isSessionUnavailable(
  result: { type: string; scope?: string },
): result is ActiveThreadSessionOperationUnavailable {
  return result.type === "unavailable" && result.scope === "activeThreadSession";
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
