import { vi } from "vitest";

import type {
  ComposerInputQueueCoordinator,
  ComposerInputQueueCoordinatorSnapshot,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type {
  ComposerPendingInputCursor,
  ComposerPendingInputDetailResult,
  ComposerPendingInputDisplayKey,
  ComposerPendingInputLane,
  ComposerPendingInputMoveDestination,
  ComposerPendingInputPageItem,
  ComposerPendingInputPageRequest,
  ComposerPendingInputPageResult,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";

const attachResponse = attachBaseline;

const threadId = attachResponse.snapshot.thread.id;

export const queueSnapshot = (
  overrides: Partial<ComposerInputQueueCoordinatorSnapshot> = {},
): ComposerInputQueueCoordinatorSnapshot => ({
  ordinaryQueuedCount: 0,
  guidingCount: 0,
  detailRevision: 0,
  recoveryCount: 0,
  recovery: null,
  isRecovering: false,
  rejectedSteers: [],
  hasUnknownSteer: false,
  canStop: false,
  interrupt: null,
  pendingInputManagementOutcome: null,
  ...overrides,
});

type PendingInputHarnessItem = ComposerPendingInputPageItem & Readonly<{ detailText?: string }>;

type PendingInputHarnessDetails = Readonly<{
  ordinary: readonly PendingInputHarnessItem[];
  steer: readonly PendingInputHarnessItem[];
}>;

type PendingInputPageReadOverride = (
  request: ComposerPendingInputPageRequest,
) => ComposerPendingInputPageResult | null;

export const pendingInputItem = (
  key: string,
  lane: ComposerPendingInputLane,
  preview: ComposerPendingInputPageItem["preview"],
  detailText?: string,
  management: ComposerPendingInputPageItem["management"] = { type: "manageable" },
): PendingInputHarnessItem => ({
  key: key as ComposerPendingInputDisplayKey,
  lane,
  management,
  movement: null,
  preview,
  ...(detailText == null ? {} : { detailText }),
});

export const createQueueControllerHarness = (
  initial: ComposerInputQueueCoordinatorSnapshot,
  initialDetails: PendingInputHarnessDetails = { ordinary: [], steer: [] },
) => {
  let snapshot = initial;
  let details: PendingInputHarnessDetails = {
    ordinary: [...initialDetails.ordinary],
    steer: [...initialDetails.steer],
  };
  let movementBlocked = false;
  const listeners = new Set<() => void>();
  const pageReadOverrides: PendingInputPageReadOverride[] = [];
  let pageReadFallbackOverride: PendingInputPageReadOverride | null = null;
  const cursorFacts = new WeakMap<
    ComposerPendingInputCursor,
    Readonly<{ lane: ComposerPendingInputLane; offset: number; revision: number }>
  >();
  const recover = vi.fn<ComposerInputQueueCoordinator["recover"]>().mockReturnValue(true);
  const interruptActiveTurn = vi
    .fn<ComposerInputQueueCoordinator["interruptActiveTurn"]>()
    .mockReturnValue(true);
  const submit = vi
    .fn<ComposerInputQueueCoordinator["submit"]>()
    .mockReturnValue({ type: "accepted" });
  const submitSteer = vi
    .fn<ComposerInputQueueCoordinator["submitSteer"]>()
    .mockReturnValue({ type: "accepted" });
  const promoteOrdinaryFrontToSteer = vi
    .fn<ComposerInputQueueCoordinator["promoteOrdinaryFrontToSteer"]>()
    .mockReturnValue(false);
  const readPendingInputPage = vi.fn<ComposerInputQueueCoordinator["readPendingInputPage"]>(
    (request): ComposerPendingInputPageResult => {
      const queuedOverride = pageReadOverrides.shift();
      const override = queuedOverride?.(request) ?? pageReadFallbackOverride?.(request);
      if (override != null) return override;
      if (request.revision !== snapshot.detailRevision) {
        return { type: "stale", revision: snapshot.detailRevision };
      }
      const cursor = request.cursor == null ? null : cursorFacts.get(request.cursor);
      if (
        request.cursor != null &&
        (cursor?.lane !== request.lane || cursor.revision !== request.revision)
      ) {
        return { type: "stale", revision: snapshot.detailRevision };
      }
      const offset = cursor?.offset ?? 0;
      const laneItems = details[request.lane];
      const globallyBlocked =
        movementBlocked ||
        snapshot.recovery != null ||
        snapshot.isRecovering ||
        [...details.ordinary, ...details.steer].some(
          ({ management }) => management.type === "editing",
        );
      const sortableItems = laneItems.filter(({ management }) => management.type === "manageable");
      const items = laneItems
        .slice(offset, offset + request.limit)
        .map(({ detailText, ...item }) => {
          void detailText;
          const position = sortableItems.findIndex(({ key }) => key === item.key);
          return {
            ...item,
            movement:
              globallyBlocked || item.management.type !== "manageable" || position < 0
                ? null
                : {
                    position: position + 1,
                    count: sortableItems.length,
                    canMoveEarlier: position > 0,
                    canMoveLater: position + 1 < sortableItems.length,
                  },
          };
        });
      const nextOffset = offset + items.length;
      let nextCursor: ComposerPendingInputCursor | null = null;
      if (nextOffset < laneItems.length) {
        nextCursor = {} as ComposerPendingInputCursor;
        cursorFacts.set(nextCursor, {
          lane: request.lane,
          offset: nextOffset,
          revision: request.revision,
        });
      }
      return { type: "page", revision: request.revision, items, nextCursor };
    },
  );
  const readPendingInputDetail = vi.fn<ComposerInputQueueCoordinator["readPendingInputDetail"]>(
    (request): ComposerPendingInputDetailResult => {
      if (request.revision !== snapshot.detailRevision) {
        return { type: "stale", revision: snapshot.detailRevision };
      }
      const item = [...details.steer, ...details.ordinary].find(({ key }) => key === request.key);
      return item?.detailText == null
        ? { type: "missing", revision: request.revision }
        : {
            type: "detail",
            key: request.key,
            revision: request.revision,
            text: item.detailText,
          };
    },
  );
  const beginPendingInputEdit = vi
    .fn<ComposerInputQueueCoordinator["beginPendingInputEdit"]>()
    .mockImplementation(() => ({
      type: "notManageable",
      scope: "liveOwner",
      revision: snapshot.detailRevision,
    }));
  const deletePendingInput = vi
    .fn<ComposerInputQueueCoordinator["deletePendingInput"]>()
    .mockImplementation(() => ({
      type: "notManageable",
      scope: "liveOwner",
      revision: snapshot.detailRevision,
    }));
  const movePendingInput = vi
    .fn<ComposerInputQueueCoordinator["movePendingInput"]>()
    .mockImplementation((request) => {
      if (request.revision !== snapshot.detailRevision) {
        return { type: "stale", scope: "liveOwner", revision: snapshot.detailRevision };
      }
      if (
        movementBlocked ||
        snapshot.recovery != null ||
        snapshot.isRecovering ||
        [...details.ordinary, ...details.steer].some(
          ({ management }) => management.type === "editing",
        )
      ) {
        return {
          type: "unavailable",
          scope: "liveOwner",
          reason:
            snapshot.recovery != null || snapshot.isRecovering
              ? "recoveryPending"
              : "editInProgress",
          revision: snapshot.detailRevision,
        };
      }

      const lane = (["steer", "ordinary"] as const).find((candidate) =>
        details[candidate].some(({ key }) => key === request.key),
      );
      if (lane == null) {
        return { type: "notManageable", scope: "liveOwner", revision: snapshot.detailRevision };
      }
      const laneItems = details[lane];
      const target = laneItems.find(({ key }) => key === request.key);
      if (target?.management.type !== "manageable") {
        return { type: "notManageable", scope: "liveOwner", revision: snapshot.detailRevision };
      }
      const sortable = laneItems.filter(({ management }) => management.type === "manageable");
      const from = sortable.findIndex(({ key }) => key === request.key);
      const destinationIndex = (destination: ComposerPendingInputMoveDestination): number => {
        switch (destination) {
          case "earlier":
            return Math.max(0, from - 1);
          case "later":
            return Math.min(sortable.length - 1, from + 1);
          case "first":
            return 0;
          case "last":
            return sortable.length - 1;
        }
      };
      const to = destinationIndex(request.destination);
      if (to === from) {
        return {
          type: "noOp",
          reason: "alreadyAtDestination",
          revision: snapshot.detailRevision,
        };
      }
      const reordered = [...sortable];
      const [moved] = reordered.splice(from, 1);
      if (moved == null) throw new Error("move target must exist in the sortable lane");
      reordered.splice(to, 0, moved);
      let sortableIndex = 0;
      const nextLane = laneItems.map((item) => {
        if (item.management.type !== "manageable") return item;
        const replacement = reordered[sortableIndex++];
        if (replacement == null) throw new Error("sortable lane projection must stay complete");
        return replacement;
      });
      details = { ...details, [lane]: nextLane };
      snapshot = { ...snapshot, detailRevision: snapshot.detailRevision + 1 };
      for (const listener of listeners) listener();
      const position = reordered.findIndex(({ key }) => key === request.key) + 1;
      return {
        type: "moved",
        revision: snapshot.detailRevision,
        lane,
        position,
        count: reordered.length,
      };
    });
  const controller = {
    ownerThreadId: threadId,
    submit,
    submitSteer,
    promoteOrdinaryFrontToSteer,
    interruptActiveTurn,
    recover,
    observeAcceptedEvent: vi.fn<ComposerInputQueueCoordinator["observeAcceptedEvent"]>(),
    getReleaseReadiness: vi
      .fn<ComposerInputQueueCoordinator["getReleaseReadiness"]>()
      .mockReturnValue({ type: "safe" }),
    reserveRelease: vi.fn<ComposerInputQueueCoordinator["reserveRelease"]>().mockReturnValue({
      type: "reserved",
      reservation: { release: () => undefined },
    }),
    readPendingInputPage,
    readPendingInputDetail,
    beginPendingInputEdit,
    deletePendingInput,
    movePendingInput,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose: vi.fn<ComposerInputQueueCoordinator["dispose"]>(),
  } satisfies ComposerInputQueueCoordinator;

  return {
    controller,
    interruptActiveTurn,
    recover,
    promoteOrdinaryFrontToSteer,
    beginPendingInputEdit,
    readPendingInputDetail,
    readPendingInputPage,
    movePendingInput,
    submit,
    submitSteer,
    publish(next: ComposerInputQueueCoordinatorSnapshot): void {
      snapshot = next;
      for (const listener of listeners) listener();
    },
    replaceDetails(next: PendingInputHarnessDetails): void {
      details = { ordinary: [...next.ordinary], steer: [...next.steer] };
    },
    setMovementBlocked(blocked: boolean): void {
      movementBlocked = blocked;
    },
    queuePageReadOverride(override: PendingInputPageReadOverride): void {
      pageReadOverrides.push(override);
    },
    setPageReadFallbackOverride(override: PendingInputPageReadOverride): void {
      pageReadFallbackOverride = override;
    },
    clearPageReadFallbackOverride(): void {
      pageReadFallbackOverride = null;
    },
  };
};
