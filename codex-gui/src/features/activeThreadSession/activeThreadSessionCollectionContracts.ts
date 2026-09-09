import type { ComposerInputQueueCoordinatorReleaseBlocker } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type {
  LiveActiveThreadSession,
  ProjectionRecoveryOutcome,
} from "./activeThreadSessionContracts";
import type { ActiveThreadSessionIdentity } from "./activeThreadSessionIdentity";
import type {
  ThreadProjectionClosedNotification,
  ThreadProjectionDeltaNotification,
  ThreadProjectionEventNotification,
  ThreadStatusChangedNotification,
} from "@codex-protocol/v2";

export type ActiveThreadSessionScheduler = Readonly<{
  requestFrame(callback: () => void): number;
  cancelFrame(frameId: number): void;
}>;

export type ActiveThreadComposerRole = Readonly<
  Pick<
    LiveActiveThreadSession,
    | "beginPendingInputEdit"
    | "deletePendingInput"
    | "interruptActiveTurn"
    | "movePendingInput"
    | "promoteOrdinaryFrontToSteer"
    | "readPendingInputDetail"
    | "readPendingInputPage"
    | "recover"
    | "submit"
    | "submitSteer"
    | "getDraft"
    | "saveDraft"
    | "retryPersistence"
    | "resumeRestored"
    | "discardUnknown"
  >
>;

export type ActiveThreadSkillsRole = Readonly<
  Pick<LiveActiveThreadSession, "invalidateSkills" | "refreshSkills" | "retrySkills">
>;

export type ActiveThreadCompactionRole = Readonly<
  Pick<LiveActiveThreadSession, "requestCompaction">
>;

export type ActiveThreadSessionRoles = Readonly<{
  compactionRole: ActiveThreadCompactionRole;
  composerRole: ActiveThreadComposerRole;
  skillsRole: ActiveThreadSkillsRole;
}>;

export type ActiveThreadSessionSnapshot =
  | Readonly<{ phase: "empty"; revision: number }>
  | Readonly<{ phase: "loading" | "failed"; threadId: string; revision: number; error: unknown }>
  | (Exclude<ReturnType<LiveActiveThreadSession["getSnapshot"]>, { phase: "disposed" }> &
      ActiveThreadSessionRoles)
  | Readonly<{ phase: "disposed"; revision: number }>;

export type ActiveThreadActivationWarning =
  | Readonly<{ type: "authorizationPersistenceFailed"; error: unknown }>
  | Readonly<{ type: "previousOwnerCleanupFailed"; error: unknown }>;

export type ActiveThreadActivationFailure =
  | Readonly<{
      type: "collectionFailed";
      operation: Extract<
        ActiveThreadCollectionError["operation"],
        "collectionRead" | "membershipAdd" | "removeSelection" | "membershipRemove"
      >;
      threadId: string | null;
    }>
  | Readonly<{ type: "switchInProgress" }>
  | Readonly<{
      type: "currentThreadChanged";
      activeThreadId: string | null;
      expectedRevision: number;
      actualRevision: number;
    }>
  | Readonly<{
      type: "currentThreadUnresolved";
      activeThreadId: string;
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
    }>
  | Readonly<{
      type: "connectionLost";
      progress: "beforeCommit" | "afterCommit";
      threadId: string | null;
      cleanupError: unknown;
    }>
  | Readonly<{
      type: "operationFailed";
      phase: "loaded" | "resume" | "attach" | "prepare" | "activate";
      error: unknown;
      cleanupError: unknown;
    }>;

export type ActiveThreadActivationOutcome =
  | Readonly<{
      type: "ready";
      threadId: string;
      warnings: readonly ActiveThreadActivationWarning[];
    }>
  | Readonly<{ type: "empty" }>
  | Readonly<{ type: "unavailable"; failure: ActiveThreadActivationFailure }>;

export type ActiveThreadSession = Readonly<{
  getSnapshot(): ActiveThreadSessionSnapshot;
  getHistoryCwd(): string | null;
  getCollectionSnapshot(): ActiveThreadCollectionSnapshot;
  subscribe(listener: () => void): () => void;
  activate(threadId: string): Promise<ActiveThreadActivationOutcome>;
  view(threadId: string): Promise<ActiveThreadActivationOutcome>;
  retry(threadId: string): Promise<ActiveThreadRetryOutcome>;
  recoverProjection(
    threadId: string,
    expectedIdentity: ActiveThreadSessionIdentity,
  ): Promise<ProjectionRecoveryOutcome>;
  remove(threadId: string): Promise<ActiveThreadRemovalOutcome>;
  setOperationError(
    threadId: string,
    operation: ActiveThreadMemberOperationError["operation"],
    error: unknown,
  ): void;
}>;

export type ActiveThreadSessionController = Readonly<{
  session: ActiveThreadSession;
  activateRecoveryThread(preferredThreadId?: string | null): Promise<ActiveThreadActivationOutcome>;
  handleProjectionEvent(notification: ThreadProjectionEventNotification): void;
  handleProjectionDelta(notification: ThreadProjectionDeltaNotification): void;
  handleProjectionClosed(notification: ThreadProjectionClosedNotification): void;
  handleSkillsChanged(): void;
  handleThreadStatusChanged(notification: ThreadStatusChangedNotification): void;
  connectionUnavailable(): void;
  suspendRestoredQueue(): void;
  dispose(): void;
}>;

export type ActiveThreadRemovalBlocker =
  | ComposerInputQueueCoordinatorReleaseBlocker
  | "initializing"
  | "statusUnknown"
  | "activeTurn"
  | "compaction"
  | "projectionUnavailable"
  | "changed"
  | "restoredPaused";

export type ActiveThreadCollectionMember = Readonly<{
  threadId: string;
  phase: "initializing" | "ready" | "failed" | "cleanupPending" | "removalPending";
  snapshot: ActiveThreadSessionSnapshot | null;
  error: unknown;
  operationErrors: readonly ActiveThreadMemberOperationError[];
  retryAction: "load" | "remove" | "status";
  retryPending: boolean;
  removalPending: boolean;
  canRemove: boolean;
  removalBlockers: readonly ActiveThreadRemovalBlocker[];
}>;

export type ActiveThreadMemberOperationError = Readonly<{
  operation: "navigation" | "remove";
  error: unknown;
}>;

export type ActiveThreadCollectionError = Readonly<{
  operation:
    | "collectionRead"
    | "membershipAdd"
    | "viewSelection"
    | "removeSelection"
    | "membershipRemove"
    | "navigation"
    | "remove"
    | "dispose";
  threadId: string | null;
  error: unknown;
}>;

export type ActiveThreadCollectionSnapshot = Readonly<{
  viewedThreadId: string | null;
  members: readonly ActiveThreadCollectionMember[];
  errors: readonly ActiveThreadCollectionError[];
}>;

export type ActiveThreadRemovalOutcome =
  | Readonly<{ type: "removed"; threadId: string; wasViewed: boolean }>
  | Readonly<{ type: "blocked"; threadId: string; blockers: readonly ActiveThreadRemovalBlocker[] }>
  | Readonly<{
      type: "failed";
      threadId: string;
      phase: "selection" | "detach" | "membership";
      error: unknown;
    }>
  | Readonly<{ type: "unavailable"; threadId: string }>;

export type ActiveThreadRetryOutcome =
  | ActiveThreadActivationOutcome
  | Extract<ActiveThreadRemovalOutcome, { type: "removed" }>;
