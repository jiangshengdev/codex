import type { Turn, TurnStartParams, TurnStartResponse } from "@codex-protocol/v2";
import { isGuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { ThreadRuntimeProjectionEventPayload } from "@/features/threadRuntime/threadRuntimeSlice";
import {
  createComposerInputQueue,
  type ComposerInputQueue,
  type ComposerInputQueueEffect,
  type ComposerInputQueueTransition,
  type StartClaim,
  type StartSettlement,
} from "./composerInputQueue";
import type {
  ComposerInputQueueReleaseBlocker,
  ComposerQueueMessage,
  RecoveryBatch,
} from "./composerInputQueueContracts";
import { runtimeObservationFromAcceptedProjectionEvent } from "./composerInputQueueRuntimeObservation";

export type ComposerInputQueueCoordinatorSnapshot = Readonly<{
  queuedCount: number;
  recoveryCount: number;
  isRecovering: boolean;
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
}>;

let nextMessageSequence = 0;
const noop = (): void => undefined;

class ComposerInputQueueCoordinatorImpl implements ComposerInputQueueCoordinator {
  private readonly queue: ComposerInputQueue;
  private readonly threadId: string;
  private readonly startTurn: CreateComposerInputQueueCoordinatorInput["startTurn"];
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
    this.queue = createComposerInputQueue({ activeTurnId: input.activeTurnId });
    this.snapshot = { queuedCount: 0, recoveryCount: 0, isRecovering: false };
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
    for (const message of batch.messages) {
      const transition = this.queue.submit(message);
      if (transition.effects.some((effect) => effect.type === "recover")) {
        throw new Error("Composer input queue produced a second recovery batch");
      }
      recoveryEffects.push(...transition.effects);
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
      blockers.push({ type: "recoveryPending", count: this.recovery.messages.length });
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
      if (effect.type === "recover") {
        if (this.recovery != null) {
          throw new Error("Composer input queue produced a second recovery batch");
        }
        this.recovery = effect.batch;
        this.deferredEffects = effects.slice(index + 1);
        return;
      }
      this.performStart(effect.claim);
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

  private publishSnapshot(): void {
    if (this.disposed) return;
    const next = {
      queuedCount: this.queue.view().queuedCount,
      recoveryCount: this.recovery?.messages.length ?? 0,
      isRecovering: this.isRecovering,
    };
    if (
      next.queuedCount === this.snapshot.queuedCount &&
      next.recoveryCount === this.snapshot.recoveryCount &&
      next.isRecovering === this.snapshot.isRecovering
    ) {
      return;
    }
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

export function createComposerInputQueueCoordinator(
  input: CreateComposerInputQueueCoordinatorInput,
): ComposerInputQueueCoordinator {
  return new ComposerInputQueueCoordinatorImpl(input);
}
