import type { ComposerDraftCapture } from "@/features/composerEditor/composerDraft";
import type {
  ComposerInputQueueCoordinator,
  ComposerInputQueueCoordinatorSnapshot,
  ComposerInputQueueCoordinatorReserveReleaseResult,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import type {
  Thread,
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
} from "@codex-protocol/v2";
import type { ActiveThreadProjectionInputOutcome } from "./activeThreadProjection";
import type { ActiveThreadCompactionState } from "./activeThreadCompaction";

export type ActiveThreadSessionOperationUnavailable = Readonly<{
  type: "unavailable";
  scope: "activeThreadSession";
  reason: "staleRevision" | "projectionUnavailable" | "disposed";
  revision: number;
}>;

export type ActiveThreadSessionOperationResult<Result> =
  | Result
  | ActiveThreadSessionOperationUnavailable;

export type ActiveThreadCompactionView =
  | Readonly<{
      phase: "idle";
      canRequest: boolean;
      startFailure: string | null;
    }>
  | Readonly<{
      phase: Exclude<ActiveThreadCompactionState["phase"], "idle">;
      canRequest: false;
      startFailure: null;
    }>;

export type ActiveThreadRequestCompactionResult =
  | Readonly<{ type: "accepted" }>
  | Readonly<{ type: "rejected"; reason: "activeTurn" | "operationInProgress" }>
  | Exclude<ComposerInputQueueCoordinatorReserveReleaseResult, { type: "reserved" }>;

type ActiveSnapshotContents = Readonly<{
  revision: number;
  threadId: string;
  subscriptionId: string;
  activeTurnId: string | null;
  threadStatus: Thread["status"] | null;
  compaction: ActiveThreadCompactionView;
  composer: ComposerInputQueueCoordinatorSnapshot;
  skills: SkillCatalogState;
}>;

export type LiveActiveThreadSessionSnapshot =
  | (Readonly<{ phase: "active" }> & ActiveSnapshotContents)
  | (Readonly<{
      phase: "projectionUnavailable";
      reason: ProjectionManualReconnectReason;
      recovery: "connectionRestartRequired";
    }> &
      ActiveSnapshotContents)
  | Readonly<{ phase: "disposed"; revision: number }>;

type QueueBeginEditResult = ReturnType<ComposerInputQueueCoordinator["beginPendingInputEdit"]>;
type QueueEditBegun = Extract<QueueBeginEditResult, { type: "begun" }>;

export type ActiveThreadPendingInputEditReservation = Readonly<{
  save(
    capture: ComposerDraftCapture,
  ): ActiveThreadSessionOperationResult<ReturnType<QueueEditBegun["reservation"]["save"]>>;
  cancel(): ActiveThreadSessionOperationResult<ReturnType<QueueEditBegun["reservation"]["cancel"]>>;
}>;

export type ActiveThreadBeginPendingInputEditResult =
  | Exclude<QueueBeginEditResult, QueueEditBegun>
  | Readonly<{
      type: "begun";
      revision: number;
      reservation: ActiveThreadPendingInputEditReservation;
    }>;

export type ActiveThreadReleaseReservation = Readonly<{
  release(): ActiveThreadSessionOperationResult<Readonly<{ type: "released" }>>;
  commit(): ActiveThreadSessionOperationResult<Readonly<{ type: "committed" }>>;
}>;

export type ActiveThreadReserveReleaseResult =
  | Exclude<ComposerInputQueueCoordinatorReserveReleaseResult, { type: "reserved" }>
  | Readonly<{ type: "reserved"; reservation: ActiveThreadReleaseReservation }>;

export type LiveActiveThreadSession = Readonly<{
  getSnapshot(): LiveActiveThreadSessionSnapshot;
  subscribe(listener: () => void): () => void;
  submit(
    expectedRevision: number,
    capture: Parameters<ComposerInputQueueCoordinator["submit"]>[0],
  ): ActiveThreadSessionOperationResult<ReturnType<ComposerInputQueueCoordinator["submit"]>>;
  submitSteer(
    expectedRevision: number,
    capture: Parameters<ComposerInputQueueCoordinator["submitSteer"]>[0],
  ): ActiveThreadSessionOperationResult<ReturnType<ComposerInputQueueCoordinator["submitSteer"]>>;
  promoteOrdinaryFrontToSteer(
    expectedRevision: number,
  ): ActiveThreadSessionOperationResult<boolean>;
  interruptActiveTurn(expectedRevision: number): ActiveThreadSessionOperationResult<boolean>;
  recover(expectedRevision: number): ActiveThreadSessionOperationResult<boolean>;
  requestCompaction(
    expectedRevision: number,
  ): ActiveThreadSessionOperationResult<ActiveThreadRequestCompactionResult>;
  readPendingInputPage(
    request: Parameters<ComposerInputQueueCoordinator["readPendingInputPage"]>[0],
  ): ReturnType<ComposerInputQueueCoordinator["readPendingInputPage"]>;
  readPendingInputDetail(
    request: Parameters<ComposerInputQueueCoordinator["readPendingInputDetail"]>[0],
  ): ReturnType<ComposerInputQueueCoordinator["readPendingInputDetail"]>;
  beginPendingInputEdit(
    expectedRevision: number,
    request: Parameters<ComposerInputQueueCoordinator["beginPendingInputEdit"]>[0],
    restore: Parameters<ComposerInputQueueCoordinator["beginPendingInputEdit"]>[1],
  ): ActiveThreadSessionOperationResult<ActiveThreadBeginPendingInputEditResult>;
  deletePendingInput(
    expectedRevision: number,
    request: Parameters<ComposerInputQueueCoordinator["deletePendingInput"]>[0],
  ): ActiveThreadSessionOperationResult<
    ReturnType<ComposerInputQueueCoordinator["deletePendingInput"]>
  >;
  movePendingInput(
    expectedRevision: number,
    request: Parameters<ComposerInputQueueCoordinator["movePendingInput"]>[0],
  ): ActiveThreadSessionOperationResult<
    ReturnType<ComposerInputQueueCoordinator["movePendingInput"]>
  >;
  getReleaseReadiness(): ReturnType<ComposerInputQueueCoordinator["getReleaseReadiness"]>;
  reserveRelease(
    expectedRevision: number,
  ): ActiveThreadSessionOperationResult<ActiveThreadReserveReleaseResult>;
  retrySkills(expectedRevision: number): ActiveThreadSessionOperationResult<boolean>;
  refreshSkills(expectedRevision: number): ActiveThreadSessionOperationResult<boolean>;
  invalidateSkills(expectedRevision: number): ActiveThreadSessionOperationResult<boolean>;
  invalidateThreadStatus(): boolean;
  settleThreadStatusInvalidations(): Promise<void>;
  handleProjectionEvent(
    notification: ThreadProjectionEventNotification,
  ): ActiveThreadProjectionInputOutcome;
  handleProjectionDelta(
    notification: ThreadProjectionDeltaNotification,
  ): ActiveThreadProjectionInputOutcome;
  handleProjectionClosed(
    notification: ThreadProjectionClosedNotification,
  ): ActiveThreadProjectionInputOutcome;
  flushProjection(): void;
  dispose(): void;
}>;
