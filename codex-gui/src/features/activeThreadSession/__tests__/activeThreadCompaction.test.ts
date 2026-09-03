import { describe, expect, it, vi } from "vitest";
import type { ComposerInputQueueCoordinatorReleaseReservation } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  contextCompaction,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { ActiveThreadProjectionAcceptedQueueFact } from "../activeThreadProjection";
import {
  createActiveThreadCompaction,
  type ActiveThreadCompactionClaim,
} from "../activeThreadCompaction";

const reservation = () => {
  const release = vi.fn<() => void>();
  return {
    release,
    reservation: { release } satisfies ComposerInputQueueCoordinatorReleaseReservation,
  };
};

const live = (
  notification: ActiveThreadProjectionAcceptedQueueFact["notification"],
): ActiveThreadProjectionAcceptedQueueFact => ({ notification, replay: "live" });

const startedTurn = (turnId: string) =>
  live(turnStarted(eventTurnStarted, `commit-start-${turnId}`, inProgressTurn(turnId)));

const completedTurn = (turnId: string) =>
  live(turnCompleted(eventTurnCompleted, `commit-end-${turnId}`, baseTurn(turnId)));

const startedCompaction = (turnId: string, itemId: string) =>
  live(
    itemStarted(eventItemStarted, `commit-item-start-${itemId}`, turnId, contextCompaction(itemId)),
  );

const completedCompaction = (turnId: string, itemId: string) =>
  live(
    itemCompleted(
      eventItemCompleted,
      `commit-item-end-${itemId}`,
      turnId,
      contextCompaction(itemId),
    ),
  );

const commandError = (delivery: "definitelyNotAccepted" | "deliveryUnknown", message: string) =>
  new GuiHostCommandError({
    source: delivery === "definitelyNotAccepted" ? "rpc" : "unavailable",
    delivery,
    error: new Error(message),
  });

const claimRequest = (
  operation: ReturnType<typeof createActiveThreadCompaction>,
  releaseReservation: ComposerInputQueueCoordinatorReleaseReservation,
): ActiveThreadCompactionClaim => {
  const result = operation.claimRequest(releaseReservation);
  if (result.type !== "claimed") throw new Error("expected a compaction request claim");
  return result.claim;
};

describe("ActiveThreadCompaction", () => {
  it("claims one request, holds its reservation, and rejects a duplicate", () => {
    const operation = createActiveThreadCompaction();
    const first = reservation();
    const second = reservation();

    const claimed = operation.claimRequest(first.reservation);
    if (claimed.type !== "claimed") throw new Error("expected a compaction request claim");
    expect(claimed).toEqual({
      type: "claimed",
      claim: claimed.claim,
      state: {
        phase: "requestPending",
        claimId: claimed.claim.id,
        candidateTurnId: null,
      },
    });
    expect(first.release).not.toHaveBeenCalled();

    expect(operation.claimRequest(second.reservation)).toEqual({
      type: "blocked",
      reason: "operationInProgress",
      state: claimed.state,
    });
    expect(second.release).toHaveBeenCalledTimes(1);
    expect(first.release).not.toHaveBeenCalled();
  });

  it("keeps an accepted response pending until the matching canonical lifecycle completes", () => {
    const operation = createActiveThreadCompaction();
    const held = reservation();
    const claim = claimRequest(operation, held.reservation);

    expect(operation.settleRequest(claim, { type: "accepted" })).toEqual({
      type: "unchanged",
    });
    expect(
      operation.settleRequest(claim, {
        type: "rejected",
        error: commandError("definitelyNotAccepted", "duplicate settlement"),
      }),
    ).toEqual({ type: "unchanged" });
    expect(operation.getState()).toEqual({
      phase: "requestPending",
      claimId: claim.id,
      candidateTurnId: null,
    });
    expect(operation.observeAcceptedEvent(startedTurn("turn-1"))).toEqual({
      type: "changed",
      state: {
        phase: "requestPending",
        claimId: claim.id,
        candidateTurnId: "turn-1",
      },
    });
    expect(held.release).toHaveBeenCalledTimes(1);
    expect(operation.observeAcceptedEvent(startedCompaction("turn-1", "compact-1"))).toEqual({
      type: "changed",
      state: { phase: "running", turnId: "turn-1", itemId: "compact-1" },
    });
    expect(operation.observeAcceptedEvent(completedCompaction("turn-1", "compact-1"))).toEqual({
      type: "changed",
      state: { phase: "idle", startFailure: null },
    });
  });

  it("lets canonical events win when they arrive before the command response", () => {
    const operation = createActiveThreadCompaction();
    const held = reservation();
    const claim = claimRequest(operation, held.reservation);

    operation.observeAcceptedEvent(startedTurn("turn-1"));
    operation.observeAcceptedEvent(startedCompaction("turn-1", "compact-1"));
    expect(operation.settleRequest(claim, { type: "accepted" })).toEqual({
      type: "unchanged",
    });
    expect(
      operation.settleRequest(claim, {
        type: "rejected",
        error: commandError("definitelyNotAccepted", "late reject"),
      }),
    ).toEqual({ type: "unchanged" });
    expect(operation.getState()).toEqual({
      phase: "running",
      turnId: "turn-1",
      itemId: "compact-1",
    });
  });

  it("clears a candidate that terminates before a compaction item starts", () => {
    const operation = createActiveThreadCompaction();
    const held = reservation();
    const claim = claimRequest(operation, held.reservation);

    operation.observeAcceptedEvent(startedTurn("turn-1"));
    expect(operation.observeAcceptedEvent(startedTurn("other-turn"))).toEqual({
      type: "unchanged",
    });
    expect(operation.observeAcceptedEvent(completedTurn("other-turn"))).toEqual({
      type: "unchanged",
    });
    expect(operation.observeAcceptedEvent(completedTurn("turn-1"))).toEqual({
      type: "changed",
      state: { phase: "idle", startFailure: null },
    });
    expect(operation.settleRequest(claim, { type: "accepted" })).toEqual({
      type: "unchanged",
    });
  });

  it("tracks automatic compaction and only accepts matching completion or terminal facts", () => {
    const operation = createActiveThreadCompaction();

    expect(operation.observeAcceptedEvent(startedCompaction("turn-auto", "compact-auto"))).toEqual({
      type: "changed",
      state: { phase: "running", turnId: "turn-auto", itemId: "compact-auto" },
    });
    expect(operation.observeAcceptedEvent(completedCompaction("turn-auto", "other-item"))).toEqual({
      type: "unchanged",
    });
    expect(operation.observeAcceptedEvent(completedTurn("other-turn"))).toEqual({
      type: "unchanged",
    });
    expect(operation.observeAcceptedEvent(completedTurn("turn-auto"))).toEqual({
      type: "changed",
      state: { phase: "idle", startFailure: null },
    });
  });

  it("returns a definite rejection to idle with a start failure and ignores stale settlement", () => {
    const operation = createActiveThreadCompaction();
    const first = reservation();
    const firstClaim = claimRequest(operation, first.reservation);

    expect(
      operation.settleRequest(firstClaim, {
        type: "rejected",
        error: commandError("definitelyNotAccepted", "compaction was rejected"),
      }),
    ).toEqual({
      type: "changed",
      state: { phase: "idle", startFailure: "compaction was rejected" },
    });
    expect(first.release).toHaveBeenCalledTimes(1);

    const second = reservation();
    const secondClaim = claimRequest(operation, second.reservation);
    expect(operation.getState()).toEqual({
      phase: "requestPending",
      claimId: secondClaim.id,
      candidateTurnId: null,
    });
    expect(
      operation.settleRequest(firstClaim, {
        type: "rejected",
        error: commandError("definitelyNotAccepted", "stale failure"),
      }),
    ).toEqual({ type: "unchanged" });
    expect(second.release).not.toHaveBeenCalled();
  });

  it("keeps delivery-unknown requests claimed and does not make them retryable", () => {
    const operation = createActiveThreadCompaction();
    const held = reservation();
    const claim = claimRequest(operation, held.reservation);

    expect(
      operation.settleRequest(claim, {
        type: "rejected",
        error: commandError("deliveryUnknown", "connection lost"),
      }),
    ).toEqual({
      type: "changed",
      state: {
        phase: "deliveryUnknown",
        claimId: claim.id,
        candidateTurnId: null,
      },
    });
    expect(held.release).not.toHaveBeenCalled();

    const retry = reservation();
    expect(operation.claimRequest(retry.reservation)).toEqual({
      type: "blocked",
      reason: "operationInProgress",
      state: operation.getState(),
    });
    expect(retry.release).toHaveBeenCalledTimes(1);

    expect(operation.observeAcceptedEvent(startedTurn("turn-unknown"))).toEqual({
      type: "changed",
      state: {
        phase: "deliveryUnknown",
        claimId: claim.id,
        candidateTurnId: "turn-unknown",
      },
    });
    expect(held.release).toHaveBeenCalledTimes(1);
    expect(
      operation.observeAcceptedEvent(startedCompaction("turn-unknown", "compact-unknown")),
    ).toEqual({
      type: "changed",
      state: { phase: "running", turnId: "turn-unknown", itemId: "compact-unknown" },
    });
  });

  it("ignores non-compaction and snapshot-duplicate events", () => {
    const operation = createActiveThreadCompaction();
    const ordinaryItem = itemStarted(
      eventItemStarted,
      "commit-user",
      "turn-1",
      userMessage("user-1", []),
    );

    expect(operation.observeAcceptedEvent(live(ordinaryItem))).toEqual({ type: "unchanged" });
    expect(
      operation.observeAcceptedEvent({
        notification: startedCompaction("turn-1", "compact-1").notification,
        replay: "snapshotDuplicate",
      }),
    ).toEqual({ type: "unchanged" });
    expect(operation.getState()).toEqual({ phase: "idle", startFailure: null });
  });

  it("releases on dispose and makes old callbacks and later requests inert", () => {
    const operation = createActiveThreadCompaction();
    const held = reservation();
    const claim = claimRequest(operation, held.reservation);

    expect(operation.dispose()).toEqual({
      type: "changed",
      state: { phase: "idle", startFailure: null },
    });
    expect(held.release).toHaveBeenCalledTimes(1);
    expect(operation.settleRequest(claim, { type: "accepted" })).toEqual({
      type: "unchanged",
    });
    expect(operation.observeAcceptedEvent(startedTurn("turn-1"))).toEqual({
      type: "unchanged",
    });

    const afterDispose = reservation();
    expect(operation.claimRequest(afterDispose.reservation)).toEqual({
      type: "blocked",
      reason: "disposed",
      state: { phase: "idle", startFailure: null },
    });
    expect(afterDispose.release).toHaveBeenCalledTimes(1);
    expect(operation.dispose()).toEqual({ type: "unchanged" });
  });
});
