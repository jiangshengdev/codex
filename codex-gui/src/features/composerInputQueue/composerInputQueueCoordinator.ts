import type {
  Turn,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
} from "@codex-protocol/v2";
import { isGuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { ThreadRuntimeProjectionEventPayload } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueEffect,
  type ComposerInputQueueTransition,
  type StartClaim,
  type StartSettlement,
  type SteerSettlement,
} from "./composerInputQueue";
import type {
  ComposerInputQueueReleaseBlocker,
  ComposerPendingSteerView,
  ComposerQueueMessage,
  ComposerQueuedSteerView,
  ComposerRejectedSteerView,
  RecoveryBatch,
} from "./composerInputQueueContracts";
import type { SteerClaim } from "./composerSteerQueueState";
import { copyComposerInputPayload } from "./composerInputPayload";
import { runtimeObservationFromAcceptedProjectionEvent } from "./composerInputQueueRuntimeObservation";

export type ComposerInputQueueCoordinatorSnapshot = Readonly<{
  queuedCount: number;
  recoveryCount: number;
  recovery: Readonly<{ reason: RecoveryBatch["reason"]; count: number }> | null;
  isRecovering: boolean;
  pendingSteers: readonly ComposerPendingSteerView[];
  queuedSteers: readonly ComposerQueuedSteerView[];
  rejectedSteers: readonly ComposerRejectedSteerView[];
  hasUnknownSteer: boolean;
}>;

export type ComposerInputQueueSubmitResult =
  | Readonly<{ type: "accepted" }>
  | Readonly<{
      type: "rejected";
      reason: "disposed" | "recoveryPending" | "releaseReserved" | "invalidInput";
    }>;

export type ComposerInputQueueCoordinatorReleaseBlocker =
  | ComposerInputQueueReleaseBlocker
  | Readonly<{ type: "recoveryPending"; count: number }>
  | Readonly<{ type: "recovering" }>
  | Readonly<{ type: "releaseReserved" }>
  | Readonly<{ type: "disposed" }>;

export type ComposerInputQueueCoordinatorReleaseReadiness =
  | Readonly<{ type: "safe" }>
  | Readonly<{
      type: "blocked";
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
    }>;

export type ComposerInputQueueCoordinatorReleaseReservation = Readonly<{
  release(): void;
}>;

export type ComposerInputQueueCoordinatorReserveReleaseResult =
  | Readonly<{
      type: "reserved";
      reservation: ComposerInputQueueCoordinatorReleaseReservation;
    }>
  | Readonly<{
      type: "blocked";
      blockers: readonly ComposerInputQueueCoordinatorReleaseBlocker[];
    }>;

export type ComposerInputQueueCoordinator = Readonly<{
  ownerThreadId: string;
  submit(input: ComposerQueueMessage["input"]): ComposerInputQueueSubmitResult;
  submitSteer(input: ComposerQueueMessage["input"]): ComposerInputQueueSubmitResult;
  promoteOrdinaryFrontToSteer(): boolean;
  recover(): boolean;
  observeAcceptedEvent(payload: Readonly<ThreadRuntimeProjectionEventPayload>): void;
  getReleaseReadiness(): ComposerInputQueueCoordinatorReleaseReadiness;
  reserveRelease(): ComposerInputQueueCoordinatorReserveReleaseResult;
  getSnapshot(): ComposerInputQueueCoordinatorSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}>;

export type CreateComposerInputQueueCoordinatorInput = Readonly<{
  threadId: string;
  activeTurnId: Turn["id"] | null;
  startTurn(params: TurnStartParams): Promise<TurnStartResponse>;
  steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse>;
}>;

let nextMessageSequence = 0;
const noop = (): void => undefined;

function recoveryCount(batch: RecoveryBatch | null): number {
  if (batch == null) return 0;
  switch (batch.reason) {
    case "interrupted":
    case "startDefinitelyNotAccepted":
      return batch.messages.length;
    case "steerDefinitelyNotAccepted":
      return batch.transfer.intents.length;
  }
}

class ComposerInputQueueCoordinatorImpl implements ComposerInputQueueCoordinator {
  private readonly queue: ComposerInputQueue;
  private readonly threadId: string;
  private readonly startTurn: CreateComposerInputQueueCoordinatorInput["startTurn"];
  private readonly steerTurn: CreateComposerInputQueueCoordinatorInput["steerTurn"];
  private readonly listeners = new Set<() => void>();
  private recovery: RecoveryBatch | null = null;
  private deferredEffects: readonly ComposerInputQueueEffect[] = [];
  private snapshot: ComposerInputQueueCoordinatorSnapshot;
  private generation = 0;
  private releaseReservation: object | null = null;
  private disposed = false;
  private isRecovering = false;

  constructor(input: CreateComposerInputQueueCoordinatorInput) {
    this.threadId = input.threadId;
    this.startTurn = input.startTurn;
    this.steerTurn = input.steerTurn;
    this.queue = createComposerInputQueue({
      threadId: input.threadId,
      activeTurnId: input.activeTurnId,
    });
    this.snapshot = {
      queuedCount: 0,
      recoveryCount: 0,
      recovery: null,
      isRecovering: false,
      pendingSteers: [],
      queuedSteers: [],
      rejectedSteers: [],
      hasUnknownSteer: false,
    };
  }

  get ownerThreadId(): string {
    return this.threadId;
  }

  submit(input: ComposerQueueMessage["input"]): ComposerInputQueueSubmitResult {
    if (this.disposed) return { type: "rejected", reason: "disposed" };
    if (this.releaseReservation != null) {
      return { type: "rejected", reason: "releaseReserved" };
    }
    if (this.recovery != null) return { type: "rejected", reason: "recoveryPending" };
    nextMessageSequence += 1;
    const transition = this.queue.submit({
      id: `composer-message-${String(nextMessageSequence)}`,
      input,
    });
    if (transition.result.type === "invalidInput") {
      return { type: "rejected", reason: "invalidInput" };
    }
    this.consumeTransition(transition);
    return { type: "accepted" };
  }

  submitSteer(input: ComposerQueueMessage["input"]): ComposerInputQueueSubmitResult {
    if (this.disposed) return { type: "rejected", reason: "disposed" };
    if (this.releaseReservation != null) {
      return { type: "rejected", reason: "releaseReserved" };
    }
    if (this.recovery != null) return { type: "rejected", reason: "recoveryPending" };
    nextMessageSequence += 1;
    const transition = this.queue.submitSteer({
      id: `composer-message-${String(nextMessageSequence)}`,
      input,
    });
    if (transition.result.type === "invalidInput") {
      return { type: "rejected", reason: "invalidInput" };
    }
    this.consumeTransition(transition);
    return { type: "accepted" };
  }

  promoteOrdinaryFrontToSteer(): boolean {
    if (this.disposed || this.releaseReservation != null || this.recovery != null) {
      return false;
    }
    const transition = this.queue.promoteOrdinaryFrontToSteer();
    if (transition.result.type === "noOp") {
      return false;
    }
    this.consumeTransition(transition);
    return true;
  }

  recover(): boolean {
    if (
      this.disposed ||
      this.releaseReservation != null ||
      this.recovery == null ||
      this.isRecovering
    ) {
      return false;
    }
    this.isRecovering = true;
    this.publishSnapshot();
    const batch = this.recovery;
    const recoveryEffects: ComposerInputQueueEffect[] = [];
    switch (batch.reason) {
      case "interrupted":
      case "startDefinitelyNotAccepted":
        for (const message of batch.messages) {
          const transition = this.queue.submit(message);
          if (transition.effects.some((effect) => effect.type === "recover")) {
            throw new Error("Composer input queue produced a second recovery batch");
          }
          recoveryEffects.push(...transition.effects);
        }
        break;
      case "steerDefinitelyNotAccepted": {
        const transition = this.queue.restoreSteerRecovery(batch.transfer);
        if (transition.effects.some((effect) => effect.type === "recover")) {
          throw new Error("Composer input queue produced a second recovery batch");
        }
        recoveryEffects.push(...transition.effects);
        break;
      }
    }
    this.recovery = null;
    this.isRecovering = false;
    const effects = [...recoveryEffects, ...this.deferredEffects];
    this.deferredEffects = [];
    this.runEffects(effects);
    this.publishSnapshot();
    return true;
  }

  observeAcceptedEvent(payload: Readonly<ThreadRuntimeProjectionEventPayload>): void {
    if (this.disposed || payload.notification.threadId !== this.threadId) return;
    const observation = runtimeObservationFromAcceptedProjectionEvent(payload);
    if (observation != null) this.consumeTransition(this.queue.observe(observation));
  }

  getSnapshot = (): ComposerInputQueueCoordinatorSnapshot => this.snapshot;

  getReleaseReadiness = (): ComposerInputQueueCoordinatorReleaseReadiness => {
    if (this.disposed) {
      return { type: "blocked", blockers: [{ type: "disposed" }] };
    }
    const queueState = this.queue.view().releaseState;
    const blockers: ComposerInputQueueCoordinatorReleaseBlocker[] =
      queueState.type === "blocked" ? [...queueState.blockers] : [];
    if (this.recovery != null) {
      blockers.push({ type: "recoveryPending", count: recoveryCount(this.recovery) });
    }
    if (this.isRecovering) {
      blockers.push({ type: "recovering" });
    }
    if (this.releaseReservation != null) {
      blockers.push({ type: "releaseReserved" });
    }
    return blockers.length === 0 ? { type: "safe" } : { type: "blocked", blockers };
  };

  reserveRelease = (): ComposerInputQueueCoordinatorReserveReleaseResult => {
    const readiness = this.getReleaseReadiness();
    if (readiness.type === "blocked") {
      return readiness;
    }

    const reservation = {};
    this.releaseReservation = reservation;
    return {
      type: "reserved",
      reservation: {
        release: () => {
          if (this.releaseReservation === reservation) {
            this.releaseReservation = null;
          }
        },
      },
    };
  };

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return noop;
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.listeners.clear();
    this.releaseReservation = null;
    this.recovery = null;
    this.deferredEffects = [];
  }

  private consumeTransition(transition: ComposerInputQueueTransition): void {
    this.runEffects(transition.effects);
    this.publishSnapshot();
  }

  private runEffects(effects: readonly ComposerInputQueueEffect[]): void {
    for (const [index, effect] of effects.entries()) {
      switch (effect.type) {
        case "recover":
          if (this.recovery != null) {
            throw new Error("Composer input queue produced a second recovery batch");
          }
          this.recovery = effect.batch;
          this.deferredEffects = effects.slice(index + 1);
          return;
        case "performStart":
          this.performStart(effect.claim);
          break;
        case "performSteer":
          this.performSteer(effect.claim);
          break;
      }
    }
  }

  private performStart(claim: StartClaim): void {
    const generation = this.generation;
    this.startTurn({
      threadId: this.threadId,
      clientUserMessageId: claim.clientUserMessageId,
      input: [...claim.message.input],
    }).then(
      ({ turn }) => {
        this.settle(generation, { type: "accepted", claim, turnId: turn.id });
      },
      (error: unknown) => {
        this.settle(generation, {
          type:
            isGuiHostCommandError(error) && error.delivery === "definitelyNotAccepted"
              ? "definitelyNotAccepted"
              : "deliveryUnknown",
          claim,
        });
      },
    );
  }

  private settle(generation: number, settlement: StartSettlement): void {
    if (this.disposed || generation !== this.generation) return;
    this.consumeTransition(this.queue.settleStart(settlement));
  }

  private performSteer(claim: SteerClaim): void {
    const generation = this.generation;
    this.steerTurn({
      threadId: claim.intent.threadId,
      expectedTurnId: claim.intent.expectedTurnId,
      clientUserMessageId: claim.intent.clientUserMessageId,
      input: copyComposerInputPayload(claim.intent.input),
    }).then(
      ({ turnId }) => {
        this.settleSteer(generation, { type: "accepted", claim, turnId });
      },
      (error: unknown) => {
        const type =
          isGuiHostCommandError(error) && error.activeTurnNotSteerable
            ? "activeTurnNotSteerable"
            : isGuiHostCommandError(error) && error.delivery === "definitelyNotAccepted"
              ? "definitelyNotAccepted"
              : "deliveryUnknown";
        this.settleSteer(generation, { type, claim });
      },
    );
  }

  private settleSteer(generation: number, settlement: SteerSettlement): void {
    if (this.disposed || generation !== this.generation) return;
    this.consumeTransition(this.queue.settleSteer(settlement));
  }

  private publishSnapshot(): void {
    if (this.disposed) return;
    const queueView = this.queue.view();
    const count = recoveryCount(this.recovery);
    const next: ComposerInputQueueCoordinatorSnapshot = {
      queuedCount: queueView.queuedCount,
      recoveryCount: count,
      recovery: this.recovery == null ? null : { reason: this.recovery.reason, count },
      isRecovering: this.isRecovering,
      pendingSteers: queueView.pendingSteers,
      queuedSteers: queueView.queuedSteers,
      rejectedSteers: queueView.rejectedSteers,
      hasUnknownSteer: queueView.hasUnknownSteer,
    };
    if (JSON.stringify(next) === JSON.stringify(this.snapshot)) return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

export function createComposerInputQueueCoordinator(
  input: CreateComposerInputQueueCoordinatorInput,
): ComposerInputQueueCoordinator {
  return new ComposerInputQueueCoordinatorImpl(input);
}
