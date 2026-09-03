import type { ComposerInputQueueCoordinatorReleaseReservation } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { ActiveThreadProjectionAcceptedQueueFact } from "./activeThreadProjection";

const compactionClaimCapability: unique symbol = Symbol("ActiveThreadCompactionClaim");

export type ActiveThreadCompactionState =
  | Readonly<{ phase: "idle"; startFailure: string | null }>
  | Readonly<{
      phase: "requestPending";
      claimId: string;
      candidateTurnId: string | null;
    }>
  | Readonly<{
      phase: "deliveryUnknown";
      claimId: string;
      candidateTurnId: string | null;
    }>
  | Readonly<{ phase: "running"; turnId: string; itemId: string }>;

export type ActiveThreadCompactionClaim = Readonly<{
  id: string;
  [compactionClaimCapability]: object;
}>;

export type ActiveThreadCompactionClaimResult =
  | Readonly<{
      type: "claimed";
      claim: ActiveThreadCompactionClaim;
      state: ActiveThreadCompactionState;
    }>
  | Readonly<{
      type: "blocked";
      reason: "disposed" | "operationInProgress";
      state: ActiveThreadCompactionState;
    }>;

export type ActiveThreadCompactionSettlement =
  | Readonly<{ type: "accepted" }>
  | Readonly<{ type: "rejected"; error: GuiHostCommandError }>;

export type ActiveThreadCompactionMutation =
  | Readonly<{ type: "changed"; state: ActiveThreadCompactionState }>
  | Readonly<{ type: "unchanged" }>;

export type ActiveThreadCompaction = Readonly<{
  getState(): ActiveThreadCompactionState;
  claimRequest(
    reservation: ComposerInputQueueCoordinatorReleaseReservation,
  ): ActiveThreadCompactionClaimResult;
  settleRequest(
    claim: ActiveThreadCompactionClaim,
    settlement: ActiveThreadCompactionSettlement,
  ): ActiveThreadCompactionMutation;
  observeAcceptedEvent(
    fact: ActiveThreadProjectionAcceptedQueueFact,
  ): ActiveThreadCompactionMutation;
  dispose(): ActiveThreadCompactionMutation;
}>;

type RequestClaimRecord = {
  claim: ActiveThreadCompactionClaim;
  reservation: ComposerInputQueueCoordinatorReleaseReservation | null;
  settlement: "pending" | "accepted" | "deliveryUnknown";
};

class ActiveThreadCompactionImpl implements ActiveThreadCompaction {
  private state: ActiveThreadCompactionState = { phase: "idle", startFailure: null };
  private requestClaim: RequestClaimRecord | null = null;
  private nextClaimSequence = 0;
  private disposed = false;

  getState = (): ActiveThreadCompactionState => this.state;

  claimRequest = (
    reservation: ComposerInputQueueCoordinatorReleaseReservation,
  ): ActiveThreadCompactionClaimResult => {
    if (this.disposed) {
      reservation.release();
      return { type: "blocked", reason: "disposed", state: this.state };
    }
    if (this.state.phase !== "idle") {
      reservation.release();
      return { type: "blocked", reason: "operationInProgress", state: this.state };
    }

    this.nextClaimSequence += 1;
    const claim: ActiveThreadCompactionClaim = {
      id: `compaction-request-${String(this.nextClaimSequence)}`,
      [compactionClaimCapability]: {},
    };
    this.requestClaim = { claim, reservation, settlement: "pending" };
    this.state = {
      phase: "requestPending",
      claimId: claim.id,
      candidateTurnId: null,
    };
    return { type: "claimed", claim, state: this.state };
  };

  settleRequest = (
    claim: ActiveThreadCompactionClaim,
    settlement: ActiveThreadCompactionSettlement,
  ): ActiveThreadCompactionMutation => {
    if (
      this.disposed ||
      this.requestClaim?.claim !== claim ||
      this.requestClaim.settlement !== "pending"
    ) {
      return { type: "unchanged" };
    }
    if (settlement.type === "accepted") {
      this.requestClaim.settlement = "accepted";
      return { type: "unchanged" };
    }

    if (settlement.error.delivery === "deliveryUnknown") {
      this.requestClaim.settlement = "deliveryUnknown";
      this.state = {
        phase: "deliveryUnknown",
        claimId: claim.id,
        candidateTurnId: this.candidateTurnId(),
      };
      return { type: "changed", state: this.state };
    }

    this.releaseRequestClaim();
    this.state = { phase: "idle", startFailure: settlement.error.message };
    return { type: "changed", state: this.state };
  };

  observeAcceptedEvent = (
    fact: ActiveThreadProjectionAcceptedQueueFact,
  ): ActiveThreadCompactionMutation => {
    if (this.disposed || fact.replay !== "live") return { type: "unchanged" };

    const event = fact.notification.event;
    switch (event.type) {
      case "turnStarted":
        return this.observeTurnStarted(event.notification.turn.id);
      case "turnCompleted":
        return event.notification.turn.status === "inProgress"
          ? { type: "unchanged" }
          : this.observeTurnCompleted(event.notification.turn.id);
      case "itemStarted":
        return event.notification.item.type === "contextCompaction"
          ? this.observeCompactionStarted(event.notification.turnId, event.notification.item.id)
          : { type: "unchanged" };
      case "itemCompleted":
        return event.notification.item.type === "contextCompaction"
          ? this.observeCompactionCompleted(event.notification.turnId, event.notification.item.id)
          : { type: "unchanged" };
      case "tokenUsageUpdated":
        return { type: "unchanged" };
    }
    event satisfies never;
  };

  dispose = (): ActiveThreadCompactionMutation => {
    if (this.disposed) return { type: "unchanged" };
    this.disposed = true;
    this.releaseRequestClaim();
    const changed = this.state.phase !== "idle" || this.state.startFailure !== null;
    this.state = { phase: "idle", startFailure: null };
    return changed ? { type: "changed", state: this.state } : { type: "unchanged" };
  };

  private observeTurnStarted(turnId: string): ActiveThreadCompactionMutation {
    if (
      (this.state.phase !== "requestPending" && this.state.phase !== "deliveryUnknown") ||
      this.state.candidateTurnId != null
    ) {
      return { type: "unchanged" };
    }

    this.releaseRequestReservation();
    this.state = { ...this.state, candidateTurnId: turnId };
    return { type: "changed", state: this.state };
  }

  private observeTurnCompleted(turnId: string): ActiveThreadCompactionMutation {
    if (
      (this.state.phase === "requestPending" || this.state.phase === "deliveryUnknown") &&
      this.state.candidateTurnId === turnId
    ) {
      this.releaseRequestClaim();
      this.state = { phase: "idle", startFailure: null };
      return { type: "changed", state: this.state };
    }
    if (this.state.phase === "running" && this.state.turnId === turnId) {
      this.state = { phase: "idle", startFailure: null };
      return { type: "changed", state: this.state };
    }
    return { type: "unchanged" };
  }

  private observeCompactionStarted(turnId: string, itemId: string): ActiveThreadCompactionMutation {
    if (this.state.phase === "running") return { type: "unchanged" };
    if (
      (this.state.phase === "requestPending" || this.state.phase === "deliveryUnknown") &&
      this.state.candidateTurnId != null &&
      this.state.candidateTurnId !== turnId
    ) {
      return { type: "unchanged" };
    }

    this.releaseRequestClaim();
    this.state = { phase: "running", turnId, itemId };
    return { type: "changed", state: this.state };
  }

  private observeCompactionCompleted(
    turnId: string,
    itemId: string,
  ): ActiveThreadCompactionMutation {
    if (
      this.state.phase !== "running" ||
      this.state.turnId !== turnId ||
      this.state.itemId !== itemId
    ) {
      return { type: "unchanged" };
    }
    this.state = { phase: "idle", startFailure: null };
    return { type: "changed", state: this.state };
  }

  private candidateTurnId(): string | null {
    return this.state.phase === "requestPending" || this.state.phase === "deliveryUnknown"
      ? this.state.candidateTurnId
      : null;
  }

  private releaseRequestReservation(): void {
    const reservation = this.requestClaim?.reservation;
    if (reservation == null) return;
    this.requestClaim.reservation = null;
    reservation.release();
  }

  private releaseRequestClaim(): void {
    this.releaseRequestReservation();
    this.requestClaim = null;
  }
}

export const createActiveThreadCompaction = (): ActiveThreadCompaction =>
  new ActiveThreadCompactionImpl();
