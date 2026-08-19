import type { Turn } from "@codex-protocol/v2";
import type {
  ComposerInputQueueReleaseBlocker,
  ComposerInputQueueResult,
  ComposerInputQueueView,
  ComposerQueueMessage,
  CreateComposerInputQueueInput,
  RecoveryBatch,
  RuntimeObservation,
} from "./composerInputQueueContracts";
import {
  ComposerStartQueueState,
  type StartClaim,
  type StartSettlement,
} from "./composerStartQueueState";

export type {
  ComposerInputQueuePendingStartPhase,
  ComposerInputQueueReleaseBlocker,
  ComposerInputQueueReleaseState,
  ComposerInputQueueResult,
  ComposerInputQueueView,
  ComposerQueueMessage,
  CreateComposerInputQueueInput,
  RecoveryBatch,
  RuntimeObservation,
} from "./composerInputQueueContracts";
export type { StartClaim, StartSettlement } from "./composerStartQueueState";

type TurnIdentity = Turn["id"];

export type ComposerInputQueueEffect =
  | Readonly<{ type: "performStart"; claim: StartClaim }>
  | Readonly<{ type: "recover"; batch: RecoveryBatch }>;

export type ComposerInputQueueTransition = Readonly<{
  result: ComposerInputQueueResult;
  effects: readonly ComposerInputQueueEffect[];
}>;

export type ComposerInputQueue = Readonly<{
  view(): ComposerInputQueueView;
  submit(message: ComposerQueueMessage): ComposerInputQueueTransition;
  settleStart(settlement: StartSettlement): ComposerInputQueueTransition;
  observe(observation: RuntimeObservation): ComposerInputQueueTransition;
}>;

type StartQueueOutcome = ReturnType<ComposerStartQueueState["observe"]>;
type TurnCompleted = Extract<RuntimeObservation, { type: "turnCompleted" }>;

const noEffects: readonly ComposerInputQueueEffect[] = [];

function transition(
  result: ComposerInputQueueResult,
  effects: readonly ComposerInputQueueEffect[] = noEffects,
): ComposerInputQueueTransition {
  return { result, effects: [...effects] };
}

function ownMessage(message: ComposerQueueMessage): ComposerQueueMessage {
  return { id: message.id, input: [...message.input] };
}

function hasMeaningfulInput(input: ComposerQueueMessage["input"]): boolean {
  return input.some((item) => item.type !== "text" || item.text.trim() !== "");
}

class ComposerInputQueueImpl implements ComposerInputQueue {
  private readonly ordinary: ComposerQueueMessage[] = [];
  private readonly knownMessageIds = new Set<string>();
  private readonly startState = new ComposerStartQueueState();
  private activeTurnId: TurnIdentity | null;

  constructor(activeTurnId: TurnIdentity | null) {
    this.activeTurnId = activeTurnId;
  }

  public view = (): ComposerInputQueueView => {
    const queuedCount = this.ordinary.length;
    const blockers: ComposerInputQueueReleaseBlocker[] = [];
    if (queuedCount > 0) {
      blockers.push({ type: "ordinaryQueued", count: queuedCount });
    }
    const pendingPhase = this.startState.pendingPhase();
    if (pendingPhase != null) {
      blockers.push({
        type: "pendingStart",
        phase: pendingPhase,
      });
    }
    return {
      queuedCount,
      releaseState: blockers.length === 0 ? { type: "safe" } : { type: "blocked", blockers },
    };
  };

  private issueStart(message: ComposerQueueMessage): ComposerInputQueueEffect {
    return { type: "performStart", claim: this.startState.issue(message) };
  }

  private drainOrdinary(): ComposerInputQueueEffect | null {
    if (this.activeTurnId != null || this.startState.hasPending()) {
      return null;
    }
    const message = this.ordinary.shift();
    return message == null ? null : this.issueStart(message);
  }

  private applyTerminal(observation: TurnCompleted): ComposerInputQueueTransition {
    if (this.activeTurnId === observation.turnId) {
      this.activeTurnId = null;
    }
    if (observation.status !== "interrupted") {
      const nextStart = this.drainOrdinary();
      return transition(
        { type: "applied", operation: "turnCompleted" },
        nextStart == null ? noEffects : [nextStart],
      );
    }

    const messages = this.ordinary.splice(0);
    for (const message of messages) {
      this.knownMessageIds.delete(message.id);
    }
    if (messages.length === 0) {
      return transition({ type: "applied", operation: "turnCompleted" });
    }
    const batch: RecoveryBatch = { reason: "interrupted", messages };
    return transition(
      {
        type: "recoveryProduced",
        reason: "interrupted",
        messageIds: messages.map(({ id }) => id),
      },
      [{ type: "recover", batch }],
    );
  }

  private applyStartOutcome(outcome: StartQueueOutcome): ComposerInputQueueTransition {
    switch (outcome.type) {
      case "result":
        return transition(outcome.result);
      case "ownerAccepted":
        if (outcome.releasedClaim != null) {
          this.knownMessageIds.delete(outcome.releasedClaim.message.id);
        }
        this.activeTurnId = outcome.observation.turnId;
        return transition({
          type: "applied",
          operation:
            outcome.observation.type === "turnStarted" ? "turnStarted" : "userMessageCommitted",
        });
      case "terminal":
        if (outcome.releasedClaim != null) {
          this.knownMessageIds.delete(outcome.releasedClaim.message.id);
        }
        return this.applyTerminal(outcome.observation);
      case "definitelyNotAccepted": {
        const recoveredMessage = outcome.claim.message;
        this.knownMessageIds.delete(recoveredMessage.id);
        const batch: RecoveryBatch = {
          reason: "startDefinitelyNotAccepted",
          messages: [recoveredMessage],
        };
        const effects: ComposerInputQueueEffect[] = [{ type: "recover", batch }];
        const nextStart = this.drainOrdinary();
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
      return transition({ type: "claimIssued" }, [this.issueStart(ownedMessage)]);
    }
    this.ordinary.push(ownedMessage);
    return transition({ type: "queued", messageId: ownedMessage.id });
  };

  public settleStart = (settlement: StartSettlement): ComposerInputQueueTransition => {
    return this.applyStartOutcome(this.startState.settle(settlement));
  };

  public observe = (observation: RuntimeObservation): ComposerInputQueueTransition => {
    return this.applyStartOutcome(this.startState.observe(observation, this.activeTurnId));
  };
}

export function createComposerInputQueue(
  input: CreateComposerInputQueueInput = { activeTurnId: null },
): ComposerInputQueue {
  return new ComposerInputQueueImpl(input.activeTurnId);
}
