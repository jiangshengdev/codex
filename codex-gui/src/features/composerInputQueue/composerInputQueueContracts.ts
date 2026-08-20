import type {
  ThreadItem,
  ThreadProjectionEventNotification,
  Turn,
  TurnStartParams,
} from "@codex-protocol/v2";
import type { ComposerInputPreview } from "./composerInputPreview";
import type { InterruptTerminalDisposition } from "./composerInterruptState";
import type {
  PendingSteerPhase,
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
  id: string;
  input: readonly TurnStartParams["input"][number][];
}>;

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
  | Readonly<{ type: "noOp"; reason: "noActiveTurn" | "ordinaryQueueEmpty" }>
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

export type ComposerPendingSteerView = Readonly<{
  key: string;
  preview: ComposerInputPreview;
  phase: PendingSteerPhase;
}>;

export type ComposerQueuedSteerView = Readonly<{
  key: string;
  preview: ComposerInputPreview;
}>;

export type ComposerRejectedSteerView = Readonly<{
  key: string;
  preview: ComposerInputPreview;
  reason: RejectedSteer["reason"];
}>;

export type ComposerInputQueueView = Readonly<{
  queuedCount: number;
  pendingSteers: readonly ComposerPendingSteerView[];
  queuedSteers: readonly ComposerQueuedSteerView[];
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
