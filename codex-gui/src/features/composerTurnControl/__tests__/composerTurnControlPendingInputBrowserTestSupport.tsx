import { Toast } from "@heroui/react";
import { StrictMode, useSyncExternalStore } from "react";
import { vi } from "vitest";

import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjection";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadComposerRole,
  ActiveThreadSession,
  ActiveThreadSkillsRole,
} from "@/features/activeThreadSession/activeThreadSession";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinatorSnapshot,
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
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
import type { AppLocale } from "@/i18n";
import { renderWithProviders } from "@/utils/test-utils";

import { ComposerTurnControl } from "../ComposerTurnControl";

const attachResponse = attachBaseline;

const threadId = attachResponse.snapshot.thread.id;

const readyEmptySkillCatalog: SkillCatalogState = {
  type: "ready",
  candidates: [],
  partialErrorCount: 0,
};
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

type SkillCatalogHarnessController = Readonly<{
  getSnapshot(): SkillCatalogState;
  subscribe(listener: () => void): () => void;
  invalidate(): boolean;
  retry(): boolean;
}>;

const createSkillCatalogHarness = (initial: SkillCatalogState = readyEmptySkillCatalog) => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    invalidate: vi.fn<SkillCatalogHarnessController["invalidate"]>().mockReturnValue(true),
    retry: vi.fn<SkillCatalogHarnessController["retry"]>().mockReturnValue(true),
  } satisfies SkillCatalogHarnessController;

  return {
    controller,
    publish(next: SkillCatalogState): void {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
};
const composerRoleFor = (
  controller: ComposerInputQueueCoordinator,
  getRevision: () => number,
): Partial<ActiveThreadComposerRole> => ({
  beginPendingInputEdit: (revision, request, restore) =>
    revision === getRevision()
      ? controller.beginPendingInputEdit(request, restore)
      : staleSessionOperation(getRevision()),
  deletePendingInput: (revision, request) =>
    revision === getRevision()
      ? controller.deletePendingInput(request)
      : staleSessionOperation(getRevision()),
  interruptActiveTurn: (revision) =>
    revision === getRevision()
      ? controller.interruptActiveTurn()
      : staleSessionOperation(getRevision()),
  movePendingInput: (revision, request) =>
    revision === getRevision()
      ? controller.movePendingInput(request)
      : staleSessionOperation(getRevision()),
  promoteOrdinaryFrontToSteer: (revision) =>
    revision === getRevision()
      ? controller.promoteOrdinaryFrontToSteer()
      : staleSessionOperation(getRevision()),
  readPendingInputDetail: (request) => controller.readPendingInputDetail(request),
  readPendingInputPage: (request) => controller.readPendingInputPage(request),
  recover: (revision) =>
    revision === getRevision() ? controller.recover() : staleSessionOperation(getRevision()),
  submit: (revision, capture) =>
    revision === getRevision() ? controller.submit(capture) : staleSessionOperation(getRevision()),
  submitSteer: (revision, capture) =>
    revision === getRevision()
      ? controller.submitSteer(capture)
      : staleSessionOperation(getRevision()),
});

const staleSessionOperation = (revision: number) =>
  ({
    type: "unavailable",
    scope: "activeThreadSession",
    reason: "staleRevision",
    revision,
  }) as const;

const skillsRoleFor = (
  controller: SkillCatalogHarnessController,
): Partial<ActiveThreadSkillsRole> => ({
  invalidateSkills: () => controller.invalidate(),
  refreshSkills: () => controller.invalidate(),
  retrySkills: () => controller.retry(),
});

function SessionComposerTurnControl({
  guardCompositionEndEnter,
  session,
}: Readonly<{
  guardCompositionEndEnter: boolean;
  session: ActiveThreadSession;
}>) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") return null;
  return (
    <ComposerTurnControl
      authorizationToken={null}
      guardCompositionEndEnter={guardCompositionEndEnter}
      routeTarget={{ type: "currentTask", threadId }}
      sessionSnapshot={snapshot}
    />
  );
}

export async function renderAttached(
  commandHandle: GuiHostCommands = createGuiHostCommands(),
  guardCompositionEndEnter = false,
  locale: AppLocale = "en",
  controller: ComposerInputQueueCoordinator = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: null,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
    interruptTurn: commandHandle.interruptTurn,
  }),
  skillCatalogController: SkillCatalogHarnessController = createSkillCatalogHarness().controller,
  activeTurnId?: string | null,
  strictMode = false,
) {
  const fixtureActiveTurnId =
    eventTurnStarted.event.type === "turnStarted"
      ? eventTurnStarted.event.notification.turn.id
      : null;
  const sessionActiveTurnId =
    activeTurnId === undefined && controller.getSnapshot().canStop
      ? fixtureActiveTurnId
      : (activeTurnId ?? null);
  let revision = 1;
  const sessionHarness = createActiveThreadSessionHarness({
    composerRole: composerRoleFor(controller, () => revision),
    skillsRole: skillsRoleFor(skillCatalogController),
  });
  sessionHarness.session.subscribe(() => {
    revision = sessionHarness.session.getSnapshot().revision;
  });
  const publishActiveSnapshot = (): void => {
    revision += 1;
    sessionHarness.publish(
      sessionHarness.activeSnapshot({
        revision,
        threadId,
        subscriptionId: attachResponse.subscriptionId,
        activeTurnId: sessionActiveTurnId,
        composer: controller.getSnapshot(),
        skills: skillCatalogController.getSnapshot(),
      }),
    );
  };
  sessionHarness.publish(
    sessionHarness.activeSnapshot({
      revision,
      threadId,
      subscriptionId: attachResponse.subscriptionId,
      activeTurnId: sessionActiveTurnId,
      composer: controller.getSnapshot(),
      skills: skillCatalogController.getSnapshot(),
    }),
  );
  controller.subscribe(publishActiveSnapshot);
  skillCatalogController.subscribe(publishActiveSnapshot);
  const app = (
    <>
      <Toast.Provider placement="top" />
      <SessionComposerTurnControl
        guardCompositionEndEnter={guardCompositionEndEnter}
        session={sessionHarness.session}
      />
    </>
  );
  const result = await renderWithProviders(strictMode ? <StrictMode>{app}</StrictMode> : app, {
    locale,
  });
  dispatchReadModelFacts(result, [{ type: "baselineAttached", response: attachResponse }]);
  return { ...result, sessionHarness };
}

const dispatchReadModelFacts = (
  screen: Pick<Awaited<ReturnType<typeof renderWithProviders>>, "store">,
  facts: readonly ActiveThreadProjectionReadModelFact[],
): void => {
  const sessionRevision = screen.store.getState().threadRuntime.sessionRevision + 1;
  screen.store.dispatch(activeThreadReadModelTransitionApplied({ sessionRevision, facts }));
};
