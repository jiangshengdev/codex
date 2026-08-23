import type { ThreadItem, ThreadProjectionEventNotification, Turn } from "@codex-protocol/v2";
import type {
  ComposerDraft,
  ComposerDraftCapture,
  ComposerDraftRestoreResult,
} from "@/features/composerEditor/composerDraft";
import type { ComposerInputPreview } from "./composerInputPreview";
import type { ReadonlyComposerInputPayload } from "./composerInputPayload";
import type { InterruptTerminalDisposition } from "./composerInterruptState";
import type {
  RejectedSteer,
  RejectedSteerTransfer,
  SteerRecoveryTransfer,
} from "./composerSteerQueueState";

type TurnIdentity = Turn["id"];
type CommitIdentity = ThreadProjectionEventNotification["commitId"];
type TerminalStatus = Exclude<Turn["status"], "inProgress">;
type NonInterruptedTerminalStatus = Exclude<TerminalStatus, "interrupted">;
type ObservedClientIdentity = NonNullable<Extract<ThreadItem, { type: "userMessage" }>["clientId"]>;

export type ComposerQueueMessage = Readonly<{
  type: "recoverable";
  id: string;
  draft: ComposerDraft;
  input: ReadonlyComposerInputPayload;
}>;

declare const composerPendingInputDisplayKeyBrand: unique symbol;
declare const composerPendingInputCursorBrand: unique symbol;

export type ComposerPendingInputLane = "ordinary" | "steer";

export type ComposerPendingInputDisplayKey = string &
  Readonly<{ [composerPendingInputDisplayKeyBrand]: true }>;

export type ComposerPendingInputCursor = Readonly<{
  [composerPendingInputCursorBrand]: true;
}>;

export type ComposerPendingInputManagement =
  | Readonly<{ type: "manageable" }>
  | Readonly<{ type: "editing" }>
  | Readonly<{ type: "readOnly"; reason: "deliveryInProgress" }>;

export type ComposerPendingInputPageItem = Readonly<{
  key: ComposerPendingInputDisplayKey;
  lane: ComposerPendingInputLane;
  management: ComposerPendingInputManagement;
  preview: ComposerInputPreview;
}>;

export type ComposerPendingInputPageRequest = Readonly<{
  lane: ComposerPendingInputLane;
  revision: number;
  cursor: ComposerPendingInputCursor | null;
  limit: number;
}>;

export type ComposerPendingInputPageResult =
  | Readonly<{
      type: "page";
      revision: number;
      items: readonly ComposerPendingInputPageItem[];
      nextCursor: ComposerPendingInputCursor | null;
    }>
  | Readonly<{ type: "stale"; revision: number }>
  | Readonly<{ type: "unavailable" }>;

export type ComposerPendingInputDetailRequest = Readonly<{
  key: ComposerPendingInputDisplayKey;
  revision: number;
}>;

export type ComposerPendingInputDetailResult =
  | Readonly<{
      type: "detail";
      key: ComposerPendingInputDisplayKey;
      revision: number;
      text: string;
    }>
  | Readonly<{ type: "missing"; revision: number }>
  | Readonly<{ type: "stale"; revision: number }>
  | Readonly<{ type: "unavailable" }>;

export type ComposerPendingInputManagementRequest = Readonly<{
  key: ComposerPendingInputDisplayKey;
  revision: number;
}>;

export type ComposerPendingInputDrainIntent = Readonly<{
  lane: ComposerPendingInputLane;
}>;

export type ComposerPendingInputEditReservation = Readonly<{
  save(capture: ComposerDraftCapture): ComposerPendingInputEditSaveResult;
  cancel(): ComposerPendingInputEditCancelResult;
}>;

type ComposerPendingInputManagementFailure =
  | Readonly<{ type: "stale"; revision: number }>
  | Readonly<{ type: "notManageable"; revision: number }>
  | Readonly<{ type: "conflict"; reason: "editInProgress"; revision: number }>;

export type ComposerPendingInputBeginEditResult =
  | Readonly<{
      type: "begun";
      revision: number;
      reservation: ComposerPendingInputEditReservation;
    }>
  | Readonly<{ type: "invalidDraft"; revision: number }>
  | ComposerPendingInputManagementFailure;

export type ComposerPendingInputEditRestore = (draft: ComposerDraft) => ComposerDraftRestoreResult;

export type ComposerPendingInputEditSaveResult =
  | Readonly<{
      type: "saved";
      revision: number;
      drainIntent: ComposerPendingInputDrainIntent;
    }>
  | Readonly<{ type: "invalidInput"; reason: "emptyInput"; revision: number }>
  | Readonly<{ type: "unavailable"; reason: "sessionSettled"; revision: number }>;

export type ComposerPendingInputEditCancelResult =
  | Readonly<{
      type: "cancelled";
      revision: number;
      drainIntent: ComposerPendingInputDrainIntent;
    }>
  | Readonly<{ type: "unavailable"; reason: "sessionSettled"; revision: number }>;

export type ComposerPendingInputDeleteResult =
  | Readonly<{
      type: "deleted";
      revision: number;
      drainIntent: ComposerPendingInputDrainIntent;
    }>
  | ComposerPendingInputManagementFailure;

export type ComposerInterruptedDisposition = InterruptTerminalDisposition;

export type UserStoppedRecoveryBatch = Readonly<{
  reason: "userStopped";
  rejected: RejectedSteerTransfer | null;
  messages: readonly ComposerQueueMessage[];
}>;

export type RecoveryBatch =
  | UserStoppedRecoveryBatch
  | Readonly<{
      reason: "startDefinitelyNotAccepted";
      messages: readonly ComposerQueueMessage[];
    }>
  | Readonly<{
      reason: "steerDefinitelyNotAccepted";
      transfer: SteerRecoveryTransfer;
    }>;

export type ComposerInputQueueResult =
  | Readonly<{ type: "claimIssued" }>
  | Readonly<{ type: "queued"; messageId: string }>
  | Readonly<{ type: "interruptedTerminalPrepared"; turnId: TurnIdentity }>
  | Readonly<{
      type: "applied";
      operation:
        | "observationRecorded"
        | "pendingInputManagementDrained"
        | "rejectedSteerStartRestored"
        | "startAccepted"
        | "steerAccepted"
        | "steerCommitted"
        | "steerQueued"
        | "steerRejected"
        | "steerRecoveryRestored"
        | "turnCompleted"
        | "turnStarted"
        | "userStoppedRecoveryRestored"
        | "userMessageCommitted";
    }>
  | Readonly<{ type: "deliveryUnknown" }>
  | Readonly<{
      type: "recoveryProduced";
      reason: RecoveryBatch["reason"];
      messageIds: readonly string[];
    }>
  | Readonly<{ type: "invalidInput"; reason: "emptyInput" }>
  | Readonly<{ type: "duplicateIdentity"; messageId: string }>
  | Readonly<{
      type: "noOp";
      reason: "noActiveTurn" | "ordinaryQueueEmpty" | "ordinaryQueueBlockedByEdit";
    }>
  | Readonly<{
      type: "idempotentReplay";
      subject: "runtimeCommit" | "runtimeObservation" | "startSettlement";
    }>
  | Readonly<{
      type: "stale";
      subject: "runtimeCommit" | "runtimeObservation" | "startSettlement";
    }>
  | Readonly<{
      type: "ownershipMismatch";
      subject:
        | "runtimeCommit"
        | "runtimeTurn"
        | "startClaim"
        | "steerClaim"
        | "steerRecoveryTransfer"
        | "interruptedTurn"
        | "pendingInputEdit"
        | "userStoppedRecovery";
    }>;

export type ComposerInputQueuePendingStartPhase =
  | "issuing"
  | "acceptedAwaitingRuntime"
  | "deliveryUnknown";

export type ComposerInputQueueReleaseBlocker =
  | Readonly<{ type: "ordinaryQueued"; count: number }>
  | Readonly<{ type: "pendingStart"; phase: ComposerInputQueuePendingStartPhase }>
  | Readonly<{ type: "steerQueued"; count: number }>
  | Readonly<{
      type: "pendingSteers";
      count: number;
      hasUnknown: boolean;
    }>
  | Readonly<{ type: "rejectedSteers"; count: number }>;

export type ComposerInputQueueReleaseState =
  | Readonly<{ type: "safe" }>
  | Readonly<{ type: "blocked"; blockers: readonly ComposerInputQueueReleaseBlocker[] }>;

export type ComposerRejectedSteerView = Readonly<{
  key: string;
  preview: ComposerInputPreview;
  reason: RejectedSteer["reason"];
}>;

export type ComposerInputQueueView = Readonly<{
  ordinaryQueuedCount: number;
  guidingCount: number;
  detailRevision: number;
  rejectedSteers: readonly ComposerRejectedSteerView[];
  hasUnknownSteer: boolean;
  releaseState: ComposerInputQueueReleaseState;
}>;

export type InterruptedTurnCompletedObservation = Readonly<{
  type: "turnCompleted";
  turnId: TurnIdentity;
  status: "interrupted";
  commitId: CommitIdentity;
}>;

export type RuntimeObservation =
  | Readonly<{ type: "turnStarted"; turnId: TurnIdentity; commitId: CommitIdentity }>
  | Readonly<{
      type: "userMessageCommitted";
      clientId: ObservedClientIdentity;
      turnId: TurnIdentity;
      commitId: CommitIdentity;
    }>
  | Readonly<{
      type: "turnCompleted";
      turnId: TurnIdentity;
      status: NonInterruptedTerminalStatus;
      commitId: CommitIdentity;
    }>
  | InterruptedTurnCompletedObservation;

export type NonInterruptedRuntimeObservation = Exclude<
  RuntimeObservation,
  InterruptedTurnCompletedObservation
>;

export type CreateComposerInputQueueInput = Readonly<{
  threadId: string;
  activeTurnId: TurnIdentity | null;
}>;
