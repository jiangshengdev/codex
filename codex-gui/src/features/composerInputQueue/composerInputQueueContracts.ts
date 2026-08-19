import type {
  ThreadItem,
  ThreadProjectionEventNotification,
  Turn,
  TurnStartParams,
} from "@codex-protocol/v2";

type TurnIdentity = Turn["id"];
type CommitIdentity = ThreadProjectionEventNotification["commitId"];
type TerminalStatus = Exclude<Turn["status"], "inProgress">;
type ObservedClientIdentity = NonNullable<Extract<ThreadItem, { type: "userMessage" }>["clientId"]>;

export type ComposerQueueMessage = Readonly<{
  id: string;
  input: readonly TurnStartParams["input"][number][];
}>;

export type RecoveryBatch = Readonly<{
  reason: "interrupted" | "startDefinitelyNotAccepted";
  messages: readonly ComposerQueueMessage[];
}>;

export type ComposerInputQueueResult =
  | Readonly<{ type: "claimIssued" }>
  | Readonly<{ type: "queued"; messageId: string }>
  | Readonly<{
      type: "applied";
      operation:
        | "observationRecorded"
        | "startAccepted"
        | "turnCompleted"
        | "turnStarted"
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
      type: "idempotentReplay";
      subject: "runtimeCommit" | "runtimeObservation" | "startSettlement";
    }>
  | Readonly<{
      type: "stale";
      subject: "runtimeCommit" | "runtimeObservation" | "startSettlement";
    }>
  | Readonly<{
      type: "ownershipMismatch";
      subject: "runtimeCommit" | "runtimeTurn" | "startClaim";
    }>;

export type ComposerInputQueuePendingStartPhase =
  | "issuing"
  | "acceptedAwaitingRuntime"
  | "deliveryUnknown";

export type ComposerInputQueueReleaseBlocker =
  | Readonly<{ type: "ordinaryQueued"; count: number }>
  | Readonly<{ type: "pendingStart"; phase: ComposerInputQueuePendingStartPhase }>;

export type ComposerInputQueueReleaseState =
  | Readonly<{ type: "safe" }>
  | Readonly<{ type: "blocked"; blockers: readonly ComposerInputQueueReleaseBlocker[] }>;

export type ComposerInputQueueView = Readonly<{
  queuedCount: number;
  releaseState: ComposerInputQueueReleaseState;
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
      status: TerminalStatus;
      commitId: CommitIdentity;
    }>;

export type CreateComposerInputQueueInput = Readonly<{
  activeTurnId: TurnIdentity | null;
}>;
