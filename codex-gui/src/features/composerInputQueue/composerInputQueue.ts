import type { Turn } from "@codex-protocol/v2";
import type {
  ComposerInterruptedDisposition,
  ComposerInputQueueResult,
  ComposerInputQueueView,
  ComposerQueueMessage,
  CreateComposerInputQueueInput,
  InterruptedTurnCompletedObservation,
  NonInterruptedRuntimeObservation,
  RecoveryBatch,
  RuntimeObservation,
  UserStoppedRecoveryBatch,
} from "./composerInputQueueContracts";
import { copyComposerInputPayload } from "./composerInputPayload";
import { projectComposerInputQueueView } from "./composerInputQueueProjection";
import {
  ComposerStartQueueState,
  type StartClaim,
  type StartSettlement,
} from "./composerStartQueueState";
import {
  createComposerSteerQueue,
  type SteerRecoveryTransfer,
  type SteerClaim,
} from "./composerSteerQueueState";

export type {
  ComposerInputQueuePendingStartPhase,
  ComposerInputQueueReleaseBlocker,
  ComposerInputQueueReleaseState,
  ComposerInputQueueResult,
  ComposerInputQueueView,
  ComposerInterruptedDisposition,
  ComposerQueueMessage,
  CreateComposerInputQueueInput,
  InterruptedTurnCompletedObservation,
  NonInterruptedRuntimeObservation,
  RecoveryBatch,
  RuntimeObservation,
  UserStoppedRecoveryBatch,
} from "./composerInputQueueContracts";
export type { StartClaim, StartSettlement } from "./composerStartQueueState";

type TurnIdentity = Turn["id"];
let nextRejectedMergeSequence = 0;

export type ComposerInputQueueEffect =
  | Readonly<{ type: "performStart"; claim: StartClaim }>
  | Readonly<{ type: "performSteer"; claim: SteerClaim }>
  | Readonly<{ type: "recover"; batch: RecoveryBatch }>;

export type ComposerInputQueueTransition = Readonly<{
  result: ComposerInputQueueResult;
  effects: readonly ComposerInputQueueEffect[];
}>;

export type ComposerInputQueue = Readonly<{
  view(): ComposerInputQueueView;
  currentTurnId(): TurnIdentity | null;
  submit(message: ComposerQueueMessage): ComposerInputQueueTransition;
  submitSteer(message: ComposerQueueMessage): ComposerInputQueueTransition;
  promoteOrdinaryFrontToSteer(): ComposerInputQueueTransition;
  restoreSteerRecovery(transfer: SteerRecoveryTransfer): ComposerInputQueueTransition;
  settleStart(settlement: StartSettlement): ComposerInputQueueTransition;
  settleSteer(settlement: SteerSettlement): ComposerInputQueueTransition;
  prepareInterruptedTerminal(
    observation: InterruptedTurnCompletedObservation,
  ): ComposerInputQueueTransition;
  applyInterruptedDisposition(
    turnId: TurnIdentity,
    disposition: ComposerInterruptedDisposition,
  ): ComposerInputQueueTransition;
  restoreUserStoppedRecovery(batch: UserStoppedRecoveryBatch): ComposerInputQueueTransition;
  observe(observation: NonInterruptedRuntimeObservation): ComposerInputQueueTransition;
}>;

export type SteerSettlement =
  | Readonly<{ type: "accepted"; claim: SteerClaim; turnId: TurnIdentity }>
  | Readonly<{ type: "activeTurnNotSteerable"; claim: SteerClaim }>
  | Readonly<{ type: "definitelyNotAccepted"; claim: SteerClaim }>
  | Readonly<{ type: "deliveryUnknown"; claim: SteerClaim }>;

type StartQueueOutcome = ReturnType<ComposerStartQueueState["observe"]>;
type TurnCompleted = Extract<RuntimeObservation, { type: "turnCompleted" }>;

const noEffects: readonly ComposerInputQueueEffect[] = [];

function transition(
  result: ComposerInputQueueResult,
  effects: readonly ComposerInputQueueEffect[] = noEffects,
): ComposerInputQueueTransition {
  return { result, effects: [...effects] };
}

function recoveryTransition(
  batch: RecoveryBatch,
  messageIds: readonly string[],
): ComposerInputQueueTransition {
  return transition({ type: "recoveryProduced", reason: batch.reason, messageIds }, [
    { type: "recover", batch },
  ]);
}

function ownMessage(message: ComposerQueueMessage): ComposerQueueMessage {
  return { id: message.id, input: copyComposerInputPayload(message.input) };
}
function hasMeaningfulInput(input: ComposerQueueMessage["input"]): boolean {
  return input.some((item) => item.type !== "text" || item.text.trim() !== "");
}

class ComposerInputQueueImpl implements ComposerInputQueue {
  private readonly ordinary: ComposerQueueMessage[] = [];
  private readonly knownMessageIds = new Set<string>();
  private readonly userStoppedRecoveryOwners = new WeakSet<UserStoppedRecoveryBatch>();
  private readonly startState = new ComposerStartQueueState();
  private readonly steerState = createComposerSteerQueue();
  private readonly threadId: string;
  private activeTurnId: TurnIdentity | null;
  private preparedInterruptedTurnId: TurnIdentity | null = null;

  constructor(input: CreateComposerInputQueueInput) {
    this.threadId = input.threadId;
    this.activeTurnId = input.activeTurnId;
  }

  public view = (): ComposerInputQueueView => {
    return projectComposerInputQueueView(
      this.ordinary.length,
      this.startState.pendingPhase(),
      this.steerState.state(),
    );
  };

  public currentTurnId = (): TurnIdentity | null => this.activeTurnId;

  private issueStart(
    message: ComposerQueueMessage,
    provenance: StartClaim["provenance"],
  ): ComposerInputQueueEffect {
    return { type: "performStart", claim: this.startState.issue(message, provenance) };
  }

  private drainNextStart(): ComposerInputQueueEffect | null {
    if (this.activeTurnId != null || this.startState.hasPending()) {
      return null;
    }
    const taken = this.steerState.transition({ type: "takeRejected" });
    if (taken.type === "rejectedTaken") {
      let messageId: string;
      do {
        nextRejectedMergeSequence += 1;
        messageId = `composer-rejected-steer-merge-${String(nextRejectedMergeSequence)}`;
      } while (this.knownMessageIds.has(messageId));
      const message: ComposerQueueMessage = {
        id: messageId,
        input: taken.transfer.entries.flatMap(({ intent }) =>
          copyComposerInputPayload(intent.input),
        ),
      };
      this.knownMessageIds.add(message.id);
      return this.issueStart(message, {
        type: "rejectedSteerMerge",
        transfer: taken.transfer,
      });
    }
    const message = this.ordinary.shift();
    return message == null ? null : this.issueStart(message, { type: "ordinary" });
  }

  private drainSteer(): ComposerInputQueueEffect | null {
    if (this.activeTurnId == null) {
      return null;
    }
    const result = this.steerState.transition({ type: "issueNext" });
    return result.type === "issued" ? { type: "performSteer", claim: result.claim } : null;
  }

  private drainTransition(
    operation: Extract<ComposerInputQueueResult, { type: "applied" }>["operation"],
    effect: ComposerInputQueueEffect | null,
  ): ComposerInputQueueTransition {
    return transition({ type: "applied", operation }, effect == null ? noEffects : [effect]);
  }

  private applyTerminal(observation: TurnCompleted): ComposerInputQueueTransition {
    if (this.activeTurnId === observation.turnId) {
      this.activeTurnId = null;
    }
    this.steerState.transition({
      type: "terminal",
      threadId: this.threadId,
      turnId: observation.turnId,
    });
    return this.drainTransition("turnCompleted", this.drainNextStart());
  }

  private releaseStartClaim(claim: StartClaim): void {
    this.knownMessageIds.delete(claim.message.id);
    if (claim.provenance.type === "rejectedSteerMerge") {
      const released = this.steerState.transition({
        type: "releaseRejected",
        transfer: claim.provenance.transfer,
      });
      if (released.type === "rejectedReleased") {
        for (const messageId of released.messageIds) {
          this.knownMessageIds.delete(messageId);
        }
      }
    }
  }

  private applyStartOutcome(outcome: StartQueueOutcome): ComposerInputQueueTransition {
    if (
      (outcome.type === "ownerAccepted" || outcome.type === "terminal") &&
      outcome.releasedClaim != null
    ) {
      this.releaseStartClaim(outcome.releasedClaim);
    }
    switch (outcome.type) {
      case "result":
        return transition(outcome.result);
      case "ownerAccepted":
        this.activeTurnId = outcome.observation.turnId;
        return transition({
          type: "applied",
          operation:
            outcome.observation.type === "turnStarted" ? "turnStarted" : "userMessageCommitted",
        });
      case "terminal":
        if (outcome.observation.status === "interrupted") {
          if (this.activeTurnId === outcome.observation.turnId) {
            this.activeTurnId = null;
          }
          this.preparedInterruptedTurnId = outcome.observation.turnId;
          return transition({
            type: "interruptedTerminalPrepared",
            turnId: outcome.observation.turnId,
          });
        }
        return this.applyTerminal(outcome.observation);
      case "definitelyNotAccepted": {
        if (outcome.claim.provenance.type === "rejectedSteerMerge") {
          this.knownMessageIds.delete(outcome.claim.message.id);
          this.steerState.transition({
            type: "restoreRejected",
            transfer: outcome.claim.provenance.transfer,
          });
          return transition({ type: "applied", operation: "rejectedSteerStartRestored" });
        }
        const recoveredMessage = outcome.claim.message;
        this.knownMessageIds.delete(recoveredMessage.id);
        const batch: RecoveryBatch = {
          reason: "startDefinitelyNotAccepted",
          messages: [recoveredMessage],
        };
        const effects: ComposerInputQueueEffect[] = [{ type: "recover", batch }];
        const nextStart = this.drainNextStart();
        if (nextStart != null) {
          effects.push(nextStart);
        }
        return transition(
          {
            type: "recoveryProduced",
            reason: "startDefinitelyNotAccepted",
            messageIds: [recoveredMessage.id],
          },
          effects,
        );
      }
    }
  }

  public submit = (message: ComposerQueueMessage): ComposerInputQueueTransition => {
    if (!hasMeaningfulInput(message.input)) {
      return transition({ type: "invalidInput", reason: "emptyInput" });
    }
    if (this.knownMessageIds.has(message.id)) {
      return transition({ type: "duplicateIdentity", messageId: message.id });
    }

    const ownedMessage = ownMessage(message);
    this.knownMessageIds.add(ownedMessage.id);
    if (this.activeTurnId == null && !this.startState.hasPending() && this.ordinary.length === 0) {
      return transition({ type: "claimIssued" }, [
        this.issueStart(ownedMessage, { type: "ordinary" }),
      ]);
    }
    this.ordinary.push(ownedMessage);
    return transition({ type: "queued", messageId: ownedMessage.id });
  };

  public submitSteer = (message: ComposerQueueMessage): ComposerInputQueueTransition => {
    if (this.activeTurnId == null) {
      return this.submit(message);
    }
    if (!hasMeaningfulInput(message.input)) {
      return transition({ type: "invalidInput", reason: "emptyInput" });
    }
    if (this.knownMessageIds.has(message.id)) {
      return transition({ type: "duplicateIdentity", messageId: message.id });
    }
    const ownedMessage = ownMessage(message);
    this.knownMessageIds.add(ownedMessage.id);
    const queued = this.steerState.transition({
      type: "enqueue",
      input: {
        messageId: ownedMessage.id,
        threadId: this.threadId,
        expectedTurnId: this.activeTurnId,
        input: ownedMessage.input,
        source: "direct",
      },
    });
    return this.drainTransition(
      queued.type === "rejected" ? "steerRejected" : "steerQueued",
      this.drainSteer(),
    );
  };

  public promoteOrdinaryFrontToSteer = (): ComposerInputQueueTransition => {
    if (this.activeTurnId == null) {
      return transition({ type: "noOp", reason: "noActiveTurn" });
    }
    const message = this.ordinary.shift();
    if (message == null) {
      return transition({ type: "noOp", reason: "ordinaryQueueEmpty" });
    }
    const queued = this.steerState.transition({
      type: "enqueue",
      input: {
        messageId: message.id,
        threadId: this.threadId,
        expectedTurnId: this.activeTurnId,
        input: message.input,
        source: "ordinaryPromotion",
      },
    });
    if (queued.type === "rejected") {
      return transition({ type: "applied", operation: "steerRejected" });
    }
    return this.drainTransition("steerQueued", this.drainSteer());
  };

  public restoreSteerRecovery = (transfer: SteerRecoveryTransfer): ComposerInputQueueTransition => {
    const restored = this.steerState.transition({ type: "restoreRecovery", transfer });
    if (restored.type !== "recoveryRestored") {
      return transition({ type: "ownershipMismatch", subject: "steerRecoveryTransfer" });
    }
    for (const messageId of restored.messageIds) {
      this.knownMessageIds.add(messageId);
    }
    return this.drainTransition("steerRecoveryRestored", this.drainSteer());
  };

  public settleStart = (settlement: StartSettlement): ComposerInputQueueTransition => {
    return this.applyStartOutcome(this.startState.settle(settlement));
  };

  public settleSteer = (settlement: SteerSettlement): ComposerInputQueueTransition => {
    const result = this.steerState.transition(
      settlement.type === "accepted"
        ? { type: "responseAccepted", claim: settlement.claim, turnId: settlement.turnId }
        : settlement,
    );
    if (result.type === "ownershipMismatch") {
      return transition({ type: "ownershipMismatch", subject: "steerClaim" });
    }
    if (result.type === "deliveryUnknown") {
      return transition({ type: "deliveryUnknown" });
    }
    if (result.type === "recoveryRequired") {
      const messageIds = result.transfer.intents.map(({ messageId }) => messageId);
      for (const messageId of messageIds) {
        this.knownMessageIds.delete(messageId);
      }
      return recoveryTransition(
        { reason: "steerDefinitelyNotAccepted", transfer: result.transfer },
        messageIds,
      );
    }
    const operation =
      result.type === "accepted"
        ? "steerAccepted"
        : result.type === "rejected"
          ? "steerRejected"
          : "observationRecorded";
    return this.drainTransition(operation, this.drainSteer());
  };

  public prepareInterruptedTerminal = (
    observation: InterruptedTurnCompletedObservation,
  ): ComposerInputQueueTransition => {
    return this.applyStartOutcome(this.startState.observe(observation, this.activeTurnId));
  };

  public applyInterruptedDisposition = (
    turnId: TurnIdentity,
    disposition: ComposerInterruptedDisposition,
  ): ComposerInputQueueTransition => {
    if (this.preparedInterruptedTurnId !== turnId) {
      return transition({ type: "ownershipMismatch", subject: "interruptedTurn" });
    }
    this.preparedInterruptedTurnId = null;
    this.steerState.transition({ type: "terminal", threadId: this.threadId, turnId });
    if (disposition === "nonLocal") {
      return this.drainTransition("turnCompleted", this.drainNextStart());
    }

    const taken = this.steerState.transition({ type: "takeRejected" });
    const rejected = taken.type === "rejectedTaken" ? taken.transfer : null;
    const messages = this.ordinary.splice(0);
    for (const message of messages) this.knownMessageIds.delete(message.id);
    if (rejected == null && messages.length === 0) {
      return transition({ type: "applied", operation: "turnCompleted" });
    }
    const batch: UserStoppedRecoveryBatch = { reason: "userStopped", rejected, messages };
    this.userStoppedRecoveryOwners.add(batch);
    return recoveryTransition(batch, [
      ...(rejected?.entries.map(({ intent }) => intent.messageId) ?? []),
      ...messages.map(({ id }) => id),
    ]);
  };

  public restoreUserStoppedRecovery = (
    batch: UserStoppedRecoveryBatch,
  ): ComposerInputQueueTransition => {
    if (!this.userStoppedRecoveryOwners.delete(batch)) {
      return transition({ type: "ownershipMismatch", subject: "userStoppedRecovery" });
    }
    if (batch.messages.some(({ id }) => this.knownMessageIds.has(id))) {
      return transition({ type: "ownershipMismatch", subject: "userStoppedRecovery" });
    }
    if (batch.rejected != null) {
      const restored = this.steerState.transition({
        type: "restoreRejected",
        transfer: batch.rejected,
      });
      if (restored.type !== "rejectedRestored") {
        return transition({ type: "ownershipMismatch", subject: "userStoppedRecovery" });
      }
    }
    const messages = batch.messages.map(ownMessage);
    this.ordinary.unshift(...messages);
    for (const message of messages) this.knownMessageIds.add(message.id);
    return this.drainTransition("userStoppedRecoveryRestored", this.drainNextStart());
  };

  public observe = (
    observation: NonInterruptedRuntimeObservation,
  ): ComposerInputQueueTransition => {
    if (observation.type === "userMessageCommitted") {
      const steerResult = this.steerState.transition({
        type: "committed",
        threadId: this.threadId,
        turnId: observation.turnId,
        clientUserMessageId: observation.clientId,
      });
      if (steerResult.type === "committed") {
        this.knownMessageIds.delete(steerResult.messageId);
        return this.drainTransition("steerCommitted", this.drainSteer());
      }
    }
    return this.applyStartOutcome(this.startState.observe(observation, this.activeTurnId));
  };
}

export function createComposerInputQueue(
  input: CreateComposerInputQueueInput = { threadId: "composer-input-queue", activeTurnId: null },
): ComposerInputQueue {
  return new ComposerInputQueueImpl(input);
}
