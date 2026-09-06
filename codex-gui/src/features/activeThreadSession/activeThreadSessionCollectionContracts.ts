import type { ComposerInputQueueCoordinatorReleaseBlocker } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { LiveActiveThreadSession } from "./activeThreadSessionContracts";
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
      phase: "resume" | "attach" | "prepare" | "activate";
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
  getCollectionSnapshot(): ActiveThreadCollectionSnapshot;
  subscribe(listener: () => void): () => void;
  activate(threadId: string): Promise<ActiveThreadActivationOutcome>;
  retry(threadId: string): Promise<ActiveThreadRetryOutcome>;
  remove(threadId: string): Promise<ActiveThreadRemovalOutcome>;
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
  canRemove: boolean;
  removalBlockers: readonly ActiveThreadRemovalBlocker[];
}>;

export type ActiveThreadCollectionSnapshot = Readonly<{
  viewedThreadId: string | null;
  members: readonly ActiveThreadCollectionMember[];
  error: unknown;
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
