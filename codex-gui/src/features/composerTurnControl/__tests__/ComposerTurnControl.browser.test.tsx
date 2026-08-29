import { Toast } from "@heroui/react";
import { afterEach, expect, test, vi, type Mock } from "vitest";
import { userEvent } from "vitest/browser";
import { StrictMode, useSyncExternalStore } from "react";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
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
  type ComposerPendingInputCoordinatorEditReservation,
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
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  attachBaseline,
  attachReplacement,
  eventTokenUsageUpdated,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  tokenUsageUpdated,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";
import type { AppLocale } from "@/i18n";
import { renderWithProviders } from "@/utils/test-utils";
import { ComposerTurnControl } from "../ComposerTurnControl";
import { createComposerPendingInputSession } from "../composerPendingInputSession";
import { createComposerTurnApplication } from "../composerTurnApplication";

vi.mock(import("../composerPendingInputSession"), { spy: true });
vi.mock(import("../composerTurnApplication"), { spy: true });

const attachResponse = attachBaseline;
const threadId = attachResponse.snapshot.thread.id;
const readyEmptySkillCatalog: SkillCatalogState = {
  type: "ready",
  candidates: [],
  partialErrorCount: 0,
};

const queueSnapshot = (
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

const pendingInputItem = (
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

const expectStartTurnCalledOnceWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledOnce();
  const call = startTurn.mock.calls.at(0);
  if (call == null) {
    throw new Error("startTurn must have one recorded call");
  }
  const [params] = call;
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

const createQueueControllerHarness = (
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

const capturePendingInputEditReservations = (
  controller: ComposerInputQueueCoordinator,
): ComposerPendingInputCoordinatorEditReservation[] => {
  const reservations: ComposerPendingInputCoordinatorEditReservation[] = [];
  const beginPendingInputEdit = controller.beginPendingInputEdit;
  vi.spyOn(controller, "beginPendingInputEdit").mockImplementation((request, restore) => {
    const result = beginPendingInputEdit(request, restore);
    if (result.type === "begun") reservations.push(result.reservation);
    return result;
  });
  return reservations;
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

async function renderAttached(
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

const expectComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  await expect.element(getComposer(screen)).toHaveAttribute("contenteditable", "false");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
};

const getComposer = (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
  name = "Message Codex",
) => screen.getByRole("combobox", { name, exact: true });

const getComposerPanel = (screen: Awaited<ReturnType<typeof renderWithProviders>>): HTMLElement => {
  const composerPanel = screen.container.querySelector(".composer-panel");
  if (!(composerPanel instanceof HTMLElement)) {
    throw new Error("composer panel must render");
  }
  return composerPanel;
};

const composerPanelVisualSignature = (composerPanel: HTMLElement) => {
  const style = window.getComputedStyle(composerPanel);
  return {
    backgroundColor: style.backgroundColor,
    borderColor: style.borderColor,
    borderWidth: style.borderWidth,
    boxShadow: style.boxShadow,
    cursor: style.cursor,
    opacity: style.opacity,
  };
};

const elementGeometry = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
};

const composerTextWithoutTrailingBrowserPlaceholders = (
  element: Readonly<Pick<Node, "textContent">>,
): string => (element.textContent ?? "").replace(/[ \n\r\u00a0\u200b]+$/u, "");

const dispatchGuideShortcut = (element: Element): void => {
  const isMac = navigator.platform.startsWith("Mac");
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      key: "Enter",
      metaKey: isMac,
    }),
  );
};

const dispatchComposition = (element: Element, data: string): void => {
  element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  element.dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      data,
    }),
  );
};

type RenderActiveTurnOptions = Readonly<{
  captureEditReservations?: boolean;
  commandHandle?: GuiHostCommands;
  skillCatalogController?: SkillCatalogHarnessController;
  strictMode?: boolean;
}>;

const renderActiveTurn = async ({
  captureEditReservations = false,
  commandHandle = createGuiHostCommands(),
  skillCatalogController,
  strictMode = false,
}: RenderActiveTurnOptions = {}) => {
  const event = eventTurnStarted;
  if (event.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  const turn = event.event.notification.turn;
  const controller = createComposerInputQueueCoordinator({
    threadId,
    activeTurnId: turn.id,
    startTurn: commandHandle.startTurn,
    steerTurn: commandHandle.steerTurn,
    interruptTurn: commandHandle.interruptTurn,
  });
  const reservations = captureEditReservations
    ? capturePendingInputEditReservations(controller)
    : [];
  const screen = await renderAttached(
    commandHandle,
    false,
    "en",
    controller,
    skillCatalogController ?? createSkillCatalogHarness().controller,
    turn.id,
    strictMode,
  );
  return {
    commandHandle,
    composer: getComposer(screen),
    controller,
    event,
    reservations,
    screen,
    turn,
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

async function beginPendingStop(draft: string) {
  const pending = deferred<Awaited<ReturnType<GuiHostCommands["interruptTurn"]>>>();
  const interruptTurn = vi
    .fn<GuiHostCommands["interruptTurn"]>()
    .mockReturnValueOnce(pending.promise);
  const commandHandle: GuiHostCommands = { ...createGuiHostCommands(), interruptTurn };
  const { composer, controller, screen } = await renderActiveTurn({ commandHandle });
  const stopButton = screen.getByRole("button", { name: "Stop" });

  await composer.fill(draft);
  await userEvent.click(stopButton);

  return { composer, controller, interruptTurn, pending, screen, stopButton };
}

test("disables controls while the projection is unavailable", async () => {
  expect.hasAssertions();
  const screen = await renderAttached();
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );

  const composerPanel = getComposerPanel(screen);

  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "true");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "true");
  await expectComposerDisabled(screen);
  await expect
    .element(
      screen.getByRole("button", { name: "Context usage details, 0% used, 120 of 258k tokens" }),
    )
    .toBeVisible();

  screen.sessionHarness.publish(
    screen.sessionHarness.activeSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 2,
    }),
  );

  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "false");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "false");
  await expect.element(getComposer(screen)).toHaveAttribute("contenteditable", "true");
});

test("shows attached context usage and opens its details", async () => {
  const screen = await renderAttached();
  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });

  await expect.element(contextUsageButton).toBeVisible();
  expect(contextUsageButton.element().textContent).toBe("");
  expect(contextUsageButton.element().textContent).not.toMatch(/120|0%/);
  await contextUsageButton.click();

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByText("0% used", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("120 tokens used of 258k", { exact: true })).toBeVisible();
});

test("updates context usage from live runtime events", async () => {
  if (eventTokenUsageUpdated.event.type !== "tokenUsageUpdated") {
    throw new Error("fixture must contain a tokenUsageUpdated projection event");
  }
  const screen = await renderAttached();
  const nextTokenUsage = {
    ...eventTokenUsageUpdated.event.notification.tokenUsage,
    last: {
      ...eventTokenUsageUpdated.event.notification.tokenUsage.last,
      totalTokens: 149_000,
    },
    modelContextWindow: 258_000,
  };

  dispatchReadModelFacts(screen, [
    {
      type: "eventAccepted",
      payload: {
        notification: tokenUsageUpdated(eventTokenUsageUpdated, nextTokenUsage),
        replay: "live",
      },
    },
  ]);

  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 58% used, 149k of 258k tokens",
    exact: true,
  });
  await expect.element(contextUsageButton).toBeVisible();
  expect(contextUsageButton.element().textContent).toBe("");
  expect(contextUsageButton.element().textContent).not.toMatch(/149k|58%/);
  await contextUsageButton.click();

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  await expect.element(dialog.getByText("58% used", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("149k tokens used of 258k", { exact: true })).toBeVisible();
});

test("clears context usage when a replacement attach has no usage", async () => {
  const screen = await renderAttached();
  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });
  await expect.element(contextUsageButton).toBeVisible();

  dispatchReadModelFacts(screen, [{ type: "baselineAttached", response: attachReplacement }]);

  await expect
    .poll(() => screen.container.querySelector('[aria-label^="Context usage details"]'))
    .toBeNull();
});

test("renders the Lexical composer panel and actions", async () => {
  const screen = await renderAttached();
  const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
  if (!(composerShell instanceof HTMLElement)) {
    throw new Error("composer shell must render");
  }
  const composerPanel = getComposerPanel(screen);
  const editorRoot = getComposer(screen).element();
  const actions = Array.from(composerPanel.querySelectorAll("button"))
    .map((button) => button.textContent.trim())
    .filter((label) => label.length > 0);

  expect(composerPanel.classList.contains("p-2")).toBe(true);
  expect(composerPanel.classList.contains("pb-5")).toBe(false);
  expect(composerPanel.classList.contains("p-3")).toBe(false);
  expect(composerPanel.classList.contains("composer-panel")).toBe(true);
  expect(composerShell.classList.contains("composer-shell")).toBe(true);
  expect(composerShell.classList.contains("sticky")).toBe(true);
  expect(composerShell.classList.contains("bottom-0")).toBe(true);
  expect(composerShell.classList.contains("fixed")).toBe(false);
  expect(composerShell.classList.contains("inset-x-0")).toBe(false);
  expect(composerShell.classList.contains("px-3")).toBe(true);
  expect(composerShell.classList.contains("px-4")).toBe(false);
  expect(composerShell.classList.contains("pb-0")).toBe(false);
  expect(composerShell.classList.contains("pb-3")).toBe(true);
  expect(composerShell.classList.contains("py-3")).toBe(false);
  await expect.element(composerPanel).toHaveAttribute("aria-disabled", "false");
  await expect.element(composerPanel).toHaveAttribute("data-disabled", "false");
  await expect.element(editorRoot).toHaveAttribute("contenteditable", "true");
  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  await expect.element(qrButton).toBeDisabled();
  await expect.element(qrButton).toHaveClass("button--icon-only");
  expect(actions).toEqual(["Stop", "Send"]);
});

test("keeps submit and pending-input open available after StrictMode effect replay", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1 }),
    {
      ordinary: [
        pendingInputItem("strict-pending", "ordinary", {
          type: "text",
          text: "Strict pending message",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderAttached(
    createGuiHostCommands(),
    false,
    "en",
    harness.controller,
    createSkillCatalogHarness().controller,
    undefined,
    true,
  );
  const composer = getComposer(screen);

  await composer.fill("Submit after replay");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  expect(harness.submit).toHaveBeenCalledOnce();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(dialog.getByText("Strict pending message", { exact: true })).toBeVisible();
});

test("disposes active Composer applications once after a real StrictMode unmount", async () => {
  const pendingFactory = vi.mocked(createComposerPendingInputSession);
  const turnFactory = vi.mocked(createComposerTurnApplication);
  const pendingFactoryStart = pendingFactory.mock.results.length;
  const turnFactoryStart = turnFactory.mock.results.length;
  const { composer, reservations, screen } = await renderActiveTurn({
    captureEditReservations: true,
    strictMode: true,
  });
  const pendingInstances = pendingFactory.mock.results.slice(pendingFactoryStart).map((result) => {
    if (result.type !== "return")
      throw new Error("pending session factory must return an instance");
    return result.value;
  });
  const turnInstances = turnFactory.mock.results.slice(turnFactoryStart).map((result) => {
    if (result.type !== "return")
      throw new Error("turn application factory must return an instance");
    return result.value;
  });
  const pendingDisposeSpies = pendingInstances.map((instance) => vi.spyOn(instance, "dispose"));
  const turnDisposeSpies = turnInstances.map((instance) => vi.spyOn(instance, "dispose"));

  await composer.fill("Unmount active pending edit");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toBeVisible();

  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("real unmount test must begin a pending edit");
  const save = vi.spyOn(reservation, "save");
  const cancel = vi.spyOn(reservation, "cancel");
  const pendingSnapshotsBeforeUnmount = pendingInstances.map((instance) => instance.getSnapshot());
  const activePendingIndex = pendingSnapshotsBeforeUnmount.findIndex(
    (snapshot) => snapshot.view?.edit?.phase === "active",
  );
  if (activePendingIndex < 0) throw new Error("one pending session must own the active edit");
  const activePendingSnapshot = pendingSnapshotsBeforeUnmount[activePendingIndex];
  if (activePendingSnapshot == null) throw new Error("active pending snapshot must exist");
  const activeEdit = activePendingSnapshot.view?.edit;
  if (activeEdit?.phase !== "active") throw new Error("pending edit must be active");
  const turnVersionsBeforeUnmount = turnInstances.map((instance) => instance.getVersion());
  const activeSessionSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSessionSnapshot.phase !== "active") throw new Error("expected an active session");
  const pendingFacts = {
    composerRole: activeSessionSnapshot.composerRole,
    sessionRevision: activeSessionSnapshot.revision,
    mutationsEnabled: true,
    snapshot: activeSessionSnapshot.composer,
  } as const;
  const turnFacts = {
    activeTurnId: activeSessionSnapshot.activeTurnId,
    composer: activeSessionSnapshot.composer,
    composerRole: activeSessionSnapshot.composerRole,
    phase: activeSessionSnapshot.phase,
    revision: activeSessionSnapshot.revision,
    skills: activeSessionSnapshot.skills,
  } as const;

  await screen.unmount();

  await expect
    .poll(() => pendingDisposeSpies.reduce((count, spy) => count + spy.mock.calls.length, 0))
    .toBe(1);
  await expect
    .poll(() => turnDisposeSpies.reduce((count, spy) => count + spy.mock.calls.length, 0))
    .toBe(1);
  expect(pendingDisposeSpies[activePendingIndex]).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();

  const disposedPending = pendingInstances[activePendingIndex];
  if (disposedPending == null) throw new Error("disposed pending session must exist");
  const disposedPendingSnapshot = disposedPending.getSnapshot();
  expect(disposedPendingSnapshot).toMatchObject({
    phase: "closed",
    ownerGeneration: activePendingSnapshot.ownerGeneration + 1,
    view: null,
    actionsEnabled: false,
    alert: null,
    announcement: null,
    effects: [],
  });
  disposedPending.detachEditor(pendingFacts, activeEdit.preparationToken);
  disposedPending.consumeEffect(Number.MAX_SAFE_INTEGER);
  expect(disposedPending.getSnapshot()).toEqual(disposedPendingSnapshot);

  const disposedTurnIndex = turnDisposeSpies.findIndex((spy) => spy.mock.calls.length === 1);
  if (disposedTurnIndex < 0) throw new Error("one turn application must be disposed");
  const disposedTurn = turnInstances[disposedTurnIndex];
  if (disposedTurn == null) throw new Error("disposed turn application must exist");
  const disposedTurnVersionBeforeUnmount = turnVersionsBeforeUnmount[disposedTurnIndex];
  if (disposedTurnVersionBeforeUnmount == null) {
    throw new Error("turn application version before unmount must exist");
  }
  expect(disposedTurn.getVersion()).toBe(disposedTurnVersionBeforeUnmount + 1);
  expect(disposedTurn.project({ session: turnFacts, editor: null }).operationsEnabled).toBe(false);
  const disposedTurnVersion = disposedTurn.getVersion();
  expect(disposedTurn.recover({ session: turnFacts })).toEqual({ type: "ignored" });
  expect(disposedTurn.getVersion()).toBe(disposedTurnVersion);
});

test("distinguishes hover, pointer focus, and keyboard focus-visible field states", async () => {
  const screen = await renderAttached();
  const composerPanel = getComposerPanel(screen);
  const composer = getComposer(screen);

  await userEvent.unhover(document.body);
  const restingVisualSignature = composerPanelVisualSignature(composerPanel);

  await userEvent.hover(composerPanel);
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(restingVisualSignature);
  const hoverVisualSignature = composerPanelVisualSignature(composerPanel);
  const panelGeometryBeforeFocus = elementGeometry(composerPanel);
  const composerGeometryBeforeFocus = elementGeometry(composer.element());

  await userEvent.click(composer);
  await expect.element(composer).toHaveFocus();
  await expect.element(composerPanel).toHaveAttribute("data-focus-visible", "false");
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(hoverVisualSignature);
  const pointerFocusVisualSignature = composerPanelVisualSignature(composerPanel);
  expect(pointerFocusVisualSignature.borderWidth).toBe(hoverVisualSignature.borderWidth);
  expect(elementGeometry(composerPanel)).toEqual(panelGeometryBeforeFocus);
  expect(elementGeometry(composer.element())).toEqual(composerGeometryBeforeFocus);

  await userEvent.keyboard("x");
  await expect.element(composerPanel).toHaveAttribute("data-focus-visible", "false");

  await userEvent.tab();
  await expect.element(composer).not.toHaveFocus();
  await userEvent.tab({ shift: true });
  await expect.element(composer).toHaveFocus();
  await expect.element(composerPanel).toHaveAttribute("data-focus-visible", "true");
  await expect
    .poll(() => composerPanelVisualSignature(composerPanel))
    .not.toEqual(pointerFocusVisualSignature);
});

test("submits a non-empty draft through the queue controller and clears it when accepted", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderAttached(commandHandle);

  const composer = getComposer(screen);
  await composer.fill("Hello Codex");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  expectStartTurnCalledOnceWithText(startTurn, "Hello Codex");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
});

test("gates operations by the active session phase", async () => {
  const harness = createQueueControllerHarness(queueSnapshot({ canStop: true }));
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const composer = getComposer(screen);
  const send = screen.getByRole("button", { name: "Send", exact: true });
  const stop = screen.getByRole("button", { name: "Stop" });

  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  await composer.fill("Identity-gated draft");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );
  await expect.element(send).toBeDisabled();
  await expect.element(stop).toBeDisabled();
  await screen.user.keyboard("{Enter}");
  const stopElement = stop.element();
  if (!(stopElement instanceof HTMLButtonElement)) throw new Error("Stop must be a button");
  stopElement.click();
  expect(harness.submit).not.toHaveBeenCalled();
  expect(harness.interruptActiveTurn).not.toHaveBeenCalled();

  screen.sessionHarness.publish(
    screen.sessionHarness.activeSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 2,
    }),
  );
  await expect.element(send).toBeEnabled();
  await expect.element(stop).toBeEnabled();
  await stop.click();
  await send.click();

  expect(harness.interruptActiveTurn).toHaveBeenCalledExactlyOnceWith();
  expect(harness.submit).toHaveBeenCalledOnce();
  const submittedCapture = harness.submit.mock.calls.at(0)?.at(0);
  if (submittedCapture == null) throw new Error("ordinary submit must receive a composer capture");
  expect(harness.submit).toHaveBeenCalledExactlyOnceWith(submittedCapture);
  expect(submittedCapture.draft).toBeDefined();
  expect(submittedCapture).toMatchObject({
    input: [{ type: "text", text: "Identity-gated draft", text_elements: [] }],
    textContent: "Identity-gated draft",
    selectedSkillPaths: [],
  });
});

test("marks a skill invalid only when a complete ready catalog confirms its path is unavailable", async () => {
  const selectedSkill: SkillCatalogCandidate = {
    name: "canonical-skill",
    path: "/private/skills/canonical-skill/SKILL.md",
    description: "Canonical skill description",
    scope: "repo",
    interface: {
      displayName: "Friendly Skill",
      iconSmallUrl: null,
      iconLargeUrl: null,
    },
  };
  const readyCatalog: SkillCatalogState = {
    type: "ready",
    candidates: [selectedSkill],
    partialErrorCount: 0,
  };
  const invalidCatalog: SkillCatalogState = {
    type: "ready",
    candidates: [],
    partialErrorCount: 0,
  };
  const catalogHarness = createSkillCatalogHarness(readyCatalog);
  const screen = await renderAttached(
    createGuiHostCommands(),
    false,
    "en",
    undefined,
    catalogHarness.controller,
  );
  const composer = getComposer(screen);
  const send = screen.getByRole("button", { name: "Send", exact: true });

  await composer.fill("$canonical");
  await screen.user.keyboard("{Enter}");
  const token = screen.getByText("$Friendly Skill", { exact: true });
  await expect.element(send).toBeEnabled();

  catalogHarness.publish(invalidCatalog);
  await expect.element(token).toHaveAttribute("aria-invalid", "true");
  await expect.element(token).toHaveAttribute("data-invalid-status", "(Invalid skill)");
  await expect.element(token).toHaveAttribute("aria-label", "$Friendly Skill, Invalid skill");
  await expect.element(token).toHaveClass("bg-danger-soft");
  await expect.element(token).toHaveClass("after:content-[attr(data-invalid-status)]");
  await expect.element(send).toBeDisabled();
  await expect.element(token).toHaveTextContent("$Friendly Skill");
  expect(token.element().outerHTML).not.toContain(selectedSkill.path);

  catalogHarness.publish(readyCatalog);
  await expect.element(token).not.toHaveAttribute("aria-invalid");
  await expect.element(token).not.toHaveAttribute("aria-label");
  await expect.element(token).not.toHaveAttribute("data-invalid-status");
  await expect.element(token).not.toHaveClass("bg-danger-soft");
  await expect.element(send).toBeEnabled();

  const unconfirmedCatalogs: SkillCatalogState[] = [
    { type: "refreshing", candidates: [], partialErrorCount: 0 },
    { type: "stale", candidates: [], partialErrorCount: 0 },
    { type: "failed", candidates: [], partialErrorCount: 0 },
    { type: "ready", candidates: [], partialErrorCount: 1 },
  ];
  for (const catalog of unconfirmedCatalogs) {
    catalogHarness.publish(invalidCatalog);
    await expect.element(token).toHaveAttribute("aria-invalid", "true");
    catalogHarness.publish(catalog);
    await expect.element(token).not.toHaveAttribute("aria-invalid");
    await expect.element(token).not.toHaveAttribute("aria-label");
    await expect.element(token).not.toHaveAttribute("data-invalid-status");
    await expect.element(token).not.toHaveClass("bg-danger-soft");
    await expect.element(send).toBeEnabled();
    await expect.element(token).toHaveTextContent("$Friendly Skill");
    expect(token.element().outerHTML).not.toContain(selectedSkill.path);
  }
});

test("keeps whitespace-only draft from submitting", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);

  await composer.fill("   ");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await composer.click();
  await screen.user.keyboard("{Enter}");

  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("uses Enter to send and Shift Enter to insert newline", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);

  await composer.fill("Line 1");
  await composer.click();
  await screen.user.keyboard("{Shift>}{Enter}{/Shift}");
  await screen.user.keyboard("{Enter}");

  expectStartTurnCalledOnceWithText(vi.mocked(commandHandle.startTurn), "Line 1\n");
});

test("keeps composing Enter from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);

  await composer.fill("正在输入");
  await composer.click();
  composer.element().dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    }),
  );

  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("正在输入");
});

test("sends completed composition Enter immediately when guard is disabled", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  dispatchComposition(editorRoot, "你好呀");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  await screen.user.keyboard("{Enter}");
  expectStartTurnCalledOnceWithText(startTurn, "你好呀");
});

test("keeps guarded completed composition Enter from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderAttached(commandHandle, true);
  const composer = getComposer(screen);
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  dispatchComposition(editorRoot, "你好呀");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  await screen.user.keyboard("{Enter}");
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  await screen.user.keyboard("{Enter}");
  expectStartTurnCalledOnceWithText(startTurn, "你好呀");
});

test("clears completed composition suppression on the next non Enter keydown", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderAttached(commandHandle, true);
  const composer = getComposer(screen);
  const editorRoot = composer.element();

  await composer.fill("你好呀");
  await composer.click();
  dispatchComposition(editorRoot, "你好呀");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("你好呀");

  editorRoot.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: " ",
    }),
  );

  await screen.user.keyboard("{Enter}");

  expectStartTurnCalledOnceWithText(startTurn, "你好呀");
});

test.each([" ", "Enter"])(
  "keeps completed composition suppression through keyup %s",
  async (key) => {
    const commandHandle = createGuiHostCommands();
    const startTurn = vi.mocked(commandHandle.startTurn);
    const screen = await renderAttached(commandHandle, true);
    const composer = getComposer(screen);
    const editorRoot = composer.element();

    await composer.fill("你好呀");
    await composer.click();
    dispatchComposition(editorRoot, "你好呀");
    await expect
      .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
      .toBe("你好呀");

    editorRoot.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key,
      }),
    );

    await screen.user.keyboard("{Enter}");

    expect(commandHandle.startTurn).not.toHaveBeenCalled();
    await expect
      .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
      .toBe("你好呀");

    await screen.user.keyboard("{Enter}");

    expectStartTurnCalledOnceWithText(startTurn, "你好呀");
  },
);

test("active turn allows queuing and enables Stop", async () => {
  const { commandHandle, composer, controller, screen, turn } = await renderActiveTurn();

  await composer.fill("Next draft");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Pending: Queued 1", exact: true }))
    .toBeVisible();
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  const stopButton = screen.getByRole("button", { name: "Stop" });
  await expect.element(stopButton).toBeEnabled();
  await expect.element(stopButton).toHaveClass("button--danger-soft");
  await stopButton.click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    turnId: turn.id,
  });
  await expect.poll(() => controller.getSnapshot().interrupt?.phase).toBe("accepted");

  controller.observeAcceptedEvent({
    notification: turnCompleted(eventTurnCompleted, "commit-local-stop", {
      ...turn,
      status: "interrupted",
    }),
    replay: "live",
  });

  await expect.element(screen.getByText("1 message has not been sent")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Continue sending" })).toBeVisible();
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("shows Guide only for an active turn and submits an accepted draft as steer", async () => {
  const idleScreen = await renderAttached();
  await expect
    .element(idleScreen.getByRole("button", { name: "Guide", exact: true }))
    .not.toBeInTheDocument();
  await idleScreen.unmount();

  const harness = createQueueControllerHarness(queueSnapshot({ canStop: true }));
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const composer = getComposer(screen);
  const guide = screen.getByRole("button", { name: "Guide", exact: true });

  await expect.element(guide).toBeDisabled();
  await composer.fill("Guide this turn");
  await expect.element(guide).toBeEnabled();
  await userEvent.unhover(document.body);
  await userEvent.hover(guide);
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent(navigator.platform.startsWith("Mac") ? "⌘ Enter" : "Ctrl+Enter");
  await userEvent.unhover(guide);
  await guide.click();

  expect(harness.submitSteer).toHaveBeenCalledOnce();
  const submittedCapture = harness.submitSteer.mock.calls.at(0)?.at(0);
  if (submittedCapture == null) throw new Error("guide submit must receive a composer capture");
  expect(harness.submitSteer).toHaveBeenCalledExactlyOnceWith(submittedCapture);
  expect(submittedCapture.draft).toBeDefined();
  expect(submittedCapture).toMatchObject({
    input: [{ type: "text", text: "Guide this turn", text_elements: [] }],
    textContent: "Guide this turn",
    selectedSkillPaths: [],
  });
  expect(harness.submit).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");

  harness.submitSteer.mockReturnValueOnce({ type: "rejected", reason: "recoveryPending" });
  await composer.fill("Keep the newer draft");
  await guide.click();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Keep the newer draft");
});

test("routes guide shortcuts by draft presence while ordinary Enter stays ordinary", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-shortcut", "ordinary", {
          type: "text",
          text: "Ordinary queued",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  harness.promoteOrdinaryFrontToSteer.mockReturnValue(true);
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const composer = getComposer(screen);

  await composer.fill("Explicit guide");
  dispatchGuideShortcut(composer.element());
  expect(harness.submitSteer).toHaveBeenCalledOnce();
  const guideCapture = harness.submitSteer.mock.calls.at(0)?.at(0);
  if (guideCapture == null) throw new Error("guide shortcut must submit a composer capture");
  expect(harness.submitSteer).toHaveBeenCalledExactlyOnceWith(guideCapture);
  expect(guideCapture.draft).toBeDefined();
  expect(guideCapture).toMatchObject({
    input: [{ type: "text", text: "Explicit guide", text_elements: [] }],
    textContent: "Explicit guide",
    selectedSkillPaths: [],
  });
  expect(harness.promoteOrdinaryFrontToSteer).not.toHaveBeenCalled();
  expect(harness.submit).not.toHaveBeenCalled();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");

  dispatchGuideShortcut(composer.element());
  expect(harness.promoteOrdinaryFrontToSteer).toHaveBeenCalledExactlyOnceWith();
  expect(harness.submitSteer).toHaveBeenCalledTimes(1);

  await composer.fill("Ordinary next turn");
  await composer.click();
  await screen.user.keyboard("{Enter}");
  expect(harness.submit).toHaveBeenCalledOnce();
  const ordinaryCapture = harness.submit.mock.calls.at(0)?.at(0);
  if (ordinaryCapture == null) throw new Error("ordinary Enter must submit a composer capture");
  expect(harness.submit).toHaveBeenCalledExactlyOnceWith(ordinaryCapture);
  expect(ordinaryCapture.draft).toBeDefined();
  expect(ordinaryCapture).toMatchObject({
    input: [{ type: "text", text: "Ordinary next turn", text_elements: [] }],
    textContent: "Ordinary next turn",
    selectedSkillPaths: [],
  });
  expect(harness.submitSteer).toHaveBeenCalledTimes(1);
});

test("renders one bounded pending-input Drawer while keeping exceptional states inline", async () => {
  const longPreview = `${"Guide detail ".repeat(13)}...`;
  const longDetail = "Guide detail ".repeat(20).trim();
  const steerItems = Array.from({ length: 21 }, (_, index) =>
    index === 0
      ? pendingInputItem(
          "steer-long",
          "steer",
          { type: "text", text: longPreview, truncated: true },
          longDetail,
          { type: "readOnly", reason: "deliveryInProgress" },
        )
      : index === 1
        ? pendingInputItem("steer-structured", "steer", {
            type: "nonText",
            imageCount: 2,
            audioCount: 1,
            skillCount: 1,
            mentionCount: 1,
          })
        : pendingInputItem(`steer-${String(index)}`, "steer", {
            type: "text",
            text: `Steer ${String(index)}`,
            truncated: false,
          }),
  );
  const ordinaryItems = [
    pendingInputItem("ordinary-a", "ordinary", {
      type: "text",
      text: "Ordinary A",
      truncated: false,
    }),
    pendingInputItem("ordinary-b", "ordinary", {
      type: "text",
      text: "Ordinary B",
      truncated: false,
    }),
    ...Array.from({ length: 19 }, (_, index) =>
      pendingInputItem(`ordinary-${String(index + 2)}`, "ordinary", {
        type: "text",
        text: `Ordinary ${String(index + 2)}`,
        truncated: false,
      }),
    ),
  ];
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: 21,
      guidingCount: 21,
      detailRevision: 4,
      rejectedSteers: [
        {
          key: "rejected-private-id",
          preview: { type: "text", text: "Rejected first", truncated: false },
          reason: "activeTurnNotSteerable",
        },
      ],
      hasUnknownSteer: true,
      canStop: true,
    }),
    { ordinary: ordinaryItems, steer: steerItems },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const region = screen.getByRole("region", { name: "Pending messages", exact: true });
  const trigger = region.getByRole("button", {
    name: "Pending: Guide 21, Queued 21",
    exact: true,
  });

  await expect.element(trigger).toBeVisible();
  await expect.element(region.getByText("Will send first", { exact: true })).toBeVisible();
  await expect
    .element(region.getByText("Currently unable to guide; added to queue", { exact: true }))
    .toBeVisible();
  await expect.element(region.getByText("Guide status unknown", { exact: true })).toBeVisible();
  await expect.element(region.getByText("Ordinary A", { exact: true })).not.toBeInTheDocument();
  expect(region.getByRole("button", { name: /retry/i }).query()).toBeNull();

  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(dialog).toBeVisible();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(2);
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(1, {
    lane: "steer",
    revision: 4,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(2, {
    lane: "ordinary",
    revision: 4,
    cursor: null,
    limit: 20,
  });
  expect(screen.baseElement.contains(dialog.element())).toBe(true);
  await expect.element(dialog.getByRole("heading", { name: "Guiding" })).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "Queued" })).toBeVisible();
  await expect.element(dialog).not.toHaveTextContent("steer-long");
  await expect.element(dialog).not.toHaveTextContent("ordinary-a");
  await expect.element(dialog).toHaveTextContent(/2 images.*1 audio item.*1 skill.*1 mention/);
  await expect
    .element(dialog.getByText("This message has entered the sending process.", { exact: true }))
    .toBeVisible();
  const dialogText = dialog.element().textContent;
  expect(dialogText.indexOf(longPreview)).toBeLessThan(dialogText.indexOf("Steer 2"));
  expect(dialogText.indexOf("Ordinary A")).toBeLessThan(dialogText.indexOf("Ordinary B"));
  await expect.element(dialog.getByText("Steer 20", { exact: true })).not.toBeInTheDocument();

  const expand = dialog.getByRole("button", { name: /Expand pending message:/ });
  await expand.click();
  await expect.element(dialog.getByText(longDetail, { exact: true })).toBeVisible();
  const collapse = dialog.getByRole("button", { name: /Collapse pending message:/ });
  await collapse.click();
  await expect.element(dialog.getByText(longDetail, { exact: true })).not.toBeInTheDocument();

  const showMoreGuiding = dialog.getByRole("button", {
    name: "Show more guiding messages",
    exact: true,
  });
  const showMoreQueued = dialog.getByRole("button", {
    name: "Show more queued messages",
    exact: true,
  });
  await expect.element(showMoreGuiding).toHaveTextContent("Show more");
  await expect.element(showMoreQueued).toHaveTextContent("Show more");
  await showMoreGuiding.click();
  await showMoreQueued.click();
  await expect.element(dialog.getByText("Steer 20", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Ordinary 20", { exact: true })).toBeVisible();

  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-revision", "ordinary", {
        type: "text",
        text: "Ordinary after revision",
        truncated: false,
      }),
    ],
    steer: [
      pendingInputItem("steer-revision", "steer", {
        type: "text",
        text: "Steer after revision",
        truncated: false,
      }),
    ],
  });
  harness.publish(
    queueSnapshot({
      ordinaryQueuedCount: 1,
      guidingCount: 1,
      detailRevision: 5,
      hasUnknownSteer: true,
      rejectedSteers: harness.controller.getSnapshot().rejectedSteers,
      canStop: true,
    }),
  );
  await expect.element(dialog.getByText("Steer after revision", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Steer 20", { exact: true })).not.toBeInTheDocument();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(6);
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(5, {
    lane: "steer",
    revision: 5,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(6, {
    lane: "ordinary",
    revision: 5,
    cursor: null,
    limit: 20,
  });
  const currentTrigger = region.getByRole("button", {
    name: "Pending: Guide 1, Queued 1",
    exact: true,
  });
  const closeTrigger = dialog.getByRole("button", { name: "Close", exact: true });

  closeTrigger.element().focus();
  await expect.element(closeTrigger).toHaveFocus();
  await screen.user.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(currentTrigger).toHaveFocus();
});

test("moves pending messages through the authoritative owner and preserves menu and item focus", async () => {
  const ordinary = ["A", "B", "C", "D"].map((label) =>
    pendingInputItem(`ordinary-${label.toLowerCase()}`, "ordinary", {
      type: "text",
      text: `Queued ${label}`,
      truncated: false,
    }),
  );
  const steer = ["A", "B"].map((label) =>
    pendingInputItem(`steer-${label.toLowerCase()}`, "steer", {
      type: "text",
      text: `Guiding ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: ordinary.length,
      guidingCount: steer.length,
      detailRevision: 10,
      canStop: true,
    }),
    { ordinary, steer },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  await screen.getByRole("button", { name: "Pending: Guide 2, Queued 4", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const queuedA = dialog.getByRole("group", { name: "Queued A", exact: true });
  const queuedD = dialog.getByRole("group", { name: "Queued D", exact: true });
  await expect
    .element(
      queuedA.getByRole("button", {
        name: "Move up pending message: Queued A",
        exact: true,
      }),
    )
    .toBeDisabled();
  await expect
    .element(
      queuedD.getByRole("button", {
        name: "Move down pending message: Queued D",
        exact: true,
      }),
    )
    .toBeDisabled();

  const aMenuTrigger = queuedA.getByRole("button", {
    name: "More move options for pending message: Queued A",
    exact: true,
  });
  await aMenuTrigger.click();
  const menu = screen.getByRole("menu");
  await expect.element(menu).toBeVisible();
  expect(screen.getByRole("menu").all().length).toBe(1);
  await expect
    .element(menu.getByRole("menuitem", { name: "Move to first", exact: true }))
    .toBeDisabled();
  await expect
    .element(menu.getByRole("menuitem", { name: "Move to last", exact: true }))
    .toBeEnabled();
  await screen.user.keyboard("{Escape}");
  await expect.element(menu).not.toBeInTheDocument();
  await expect.element(aMenuTrigger).toHaveFocus();

  const queuedB = dialog.getByRole("group", { name: "Queued B", exact: true });
  await queuedB
    .getByRole("button", {
      name: "Move up pending message: Queued B",
      exact: true,
    })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[1]?.key,
    revision: 10,
    destination: "earlier",
  });
  await expect
    .poll(() => {
      const text = dialog.element().textContent;
      return text.indexOf("Queued B") < text.indexOf("Queued A");
    })
    .toBe(true);
  await expect.element(dialog.getByRole("group", { name: "Queued B", exact: true })).toHaveFocus();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Queued message moved to position 1 of 4.");
  expect(screen.getByRole("status").all().length).toBe(1);

  await dialog
    .getByRole("group", { name: "Queued B", exact: true })
    .getByRole("button", {
      name: "Move down pending message: Queued B",
      exact: true,
    })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[1]?.key,
    revision: 11,
    destination: "later",
  });

  const cMenuTrigger = dialog
    .getByRole("group", { name: "Queued C", exact: true })
    .getByRole("button", {
      name: "More move options for pending message: Queued C",
      exact: true,
    });
  cMenuTrigger.element().focus();
  await screen.user.keyboard("{Enter}");
  await expect.element(screen.getByRole("menu")).toBeVisible();
  await screen.user.keyboard("{Escape}");
  await expect.element(cMenuTrigger).toHaveFocus();
  await cMenuTrigger.click();
  await screen
    .getByRole("menu")
    .getByRole("menuitem", { name: "Move to first", exact: true })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[2]?.key,
    revision: 12,
    destination: "first",
  });
  await expect
    .poll(() => {
      const text = dialog.element().textContent;
      return text.indexOf("Queued C") < text.indexOf("Queued A");
    })
    .toBe(true);

  const movedAMenuTrigger = dialog
    .getByRole("group", { name: "Queued A", exact: true })
    .getByRole("button", {
      name: "More move options for pending message: Queued A",
      exact: true,
    });
  await movedAMenuTrigger.click();
  await screen
    .getByRole("menu")
    .getByRole("menuitem", { name: "Move to last", exact: true })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[0]?.key,
    revision: 13,
    destination: "last",
  });
  await expect
    .poll(() => {
      const text = dialog.element().textContent;
      return text.indexOf("Queued D") < text.indexOf("Queued A");
    })
    .toBe(true);

  await dialog
    .getByRole("group", { name: "Guiding B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: Guiding B",
      exact: true,
    })
    .click();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: steer[1]?.key,
    revision: 14,
    destination: "earlier",
  });
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Guiding message moved to position 1 of 2.");
});

test("re-reads independent lane budgets after a move and does not locate an item beyond the prefix", async () => {
  const ordinary = Array.from({ length: 41 }, (_, index) =>
    pendingInputItem(`ordinary-budget-${String(index)}`, "ordinary", {
      type: "text",
      text: `Ordinary budget ${String(index)}`,
      truncated: false,
    }),
  );
  const steer = Array.from({ length: 21 }, (_, index) =>
    pendingInputItem(`steer-budget-${String(index)}`, "steer", {
      type: "text",
      text: `Steer budget ${String(index)}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: ordinary.length,
      guidingCount: steer.length,
      detailRevision: 20,
      canStop: true,
    }),
    { ordinary, steer },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  await screen.getByRole("button", { name: "Pending: Guide 21, Queued 41", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await dialog.getByRole("button", { name: "Show more queued messages", exact: true }).click();
  await expect.element(dialog.getByText("Ordinary budget 39", { exact: true })).toBeVisible();
  await expect
    .element(dialog.getByText("Ordinary budget 40", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(dialog.getByText("Steer budget 20", { exact: true }))
    .not.toBeInTheDocument();

  await dialog
    .getByRole("group", { name: "Ordinary budget 0", exact: true })
    .getByRole("button", {
      name: "More move options for pending message: Ordinary budget 0",
      exact: true,
    })
    .click();
  await screen
    .getByRole("menu")
    .getByRole("menuitem", { name: "Move to last", exact: true })
    .click();

  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(4, {
    lane: "steer",
    revision: 21,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(5, {
    lane: "ordinary",
    revision: 21,
    cursor: null,
    limit: 20,
  });
  const sixthPageRead = harness.readPendingInputPage.mock.calls.at(5);
  if (sixthPageRead == null) throw new Error("expected a second ordinary page read");
  const [{ cursor, ...sixthPageRequest }] = sixthPageRead;
  expect(cursor).not.toBeNull();
  expect(sixthPageRequest).toEqual({
    lane: "ordinary",
    revision: 21,
    limit: 20,
  });
  await expect
    .element(dialog.getByText("Ordinary budget 0", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(dialog.getByRole("heading", { name: "Queued", exact: true })).toHaveFocus();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Queued message moved to position 41 of 41.");
  await expect.element(dialog.getByText("Ordinary budget 40", { exact: true })).toBeVisible();
  await expect
    .element(dialog.getByText("Steer budget 20", { exact: true }))
    .not.toBeInTheDocument();
});

test("does not announce or refresh when an accepted move action is a no-op", async () => {
  const ordinary = ["A", "B"].map((label) =>
    pendingInputItem(`ordinary-no-op-${label.toLowerCase()}`, "ordinary", {
      type: "text",
      text: `No-op queued ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 25, canStop: true }),
    { ordinary, steer: [] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const pageReadCount = harness.readPendingInputPage.mock.calls.length;
  harness.movePendingInput.mockReturnValueOnce({
    type: "noOp",
    reason: "alreadyAtDestination",
    revision: 25,
  });

  await dialog
    .getByRole("group", { name: "No-op queued B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: No-op queued B",
      exact: true,
    })
    .click();

  expect(harness.movePendingInput).toHaveBeenCalledExactlyOnceWith({
    key: ordinary[1]?.key,
    revision: 25,
    destination: "earlier",
  });
  const dialogText = dialog.element().textContent;
  expect(dialogText.indexOf("No-op queued A")).toBeLessThan(dialogText.indexOf("No-op queued B"));
  expect(dialog.getByRole("status").query()).toBeNull();
  expect(dialog.getByRole("alert").query()).toBeNull();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(pageReadCount);
  expect(harness.controller.getSnapshot().detailRevision).toBe(25);
});

test("restarts an atomic two-lane refresh once and falls back with an alert after a second stale read", async () => {
  const ordinary = [
    pendingInputItem("ordinary-stale-a", "ordinary", {
      type: "text",
      text: "Ordinary stale A",
      truncated: false,
    }),
    pendingInputItem("ordinary-stale-b", "ordinary", {
      type: "text",
      text: "Ordinary stale B",
      truncated: false,
    }),
  ];
  const steer = [
    pendingInputItem("steer-stale-a", "steer", {
      type: "text",
      text: "Steer stale A",
      truncated: false,
    }),
    pendingInputItem("steer-stale-b", "steer", {
      type: "text",
      text: "Steer stale B",
      truncated: false,
    }),
  ];
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, guidingCount: 2, detailRevision: 30, canStop: true }),
    { ordinary, steer },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Guide 2, Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });

  harness.queuePageReadOverride(() => {
    harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 32 });
    return { type: "stale", revision: 32 };
  });
  await dialog
    .getByRole("group", { name: "Ordinary stale B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: Ordinary stale B",
      exact: true,
    })
    .click();
  await expect.poll(() => harness.readPendingInputPage.mock.calls.length).toBe(5);
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(4, {
    lane: "steer",
    revision: 32,
    cursor: null,
    limit: 20,
  });
  expect(harness.readPendingInputPage).toHaveBeenNthCalledWith(5, {
    lane: "ordinary",
    revision: 32,
    cursor: null,
    limit: 20,
  });
  expect(dialog.getByRole("alert").query()).toBeNull();

  harness.queuePageReadOverride(() => {
    harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 34 });
    return { type: "stale", revision: 34 };
  });
  harness.queuePageReadOverride(() => {
    harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 35 });
    return { type: "stale", revision: 35 };
  });
  await dialog
    .getByRole("group", { name: "Ordinary stale B", exact: true })
    .getByRole("button", {
      name: "Move down pending message: Ordinary stale B",
      exact: true,
    })
    .click();

  await expect.element(dialog.getByRole("alert")).toBeVisible();
  await expect
    .element(dialog.getByText("Updated pending order could not be loaded", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "The message was moved, but repeated queue changes prevented the updated order from loading.",
        { exact: true },
      ),
    )
    .toBeVisible();
  expect(dialog.getByRole("status").query()).toBeNull();
  expect(harness.movePendingInput).toHaveBeenLastCalledWith({
    key: ordinary[1]?.key,
    revision: 32,
    destination: "later",
  });
  await expect.element(dialog.getByRole("heading", { name: "Pending details" })).toHaveFocus();
  const refreshCalls = harness.readPendingInputPage.mock.calls.slice(-4).map(([request]) => ({
    lane: request.lane,
    revision: request.revision,
  }));
  expect(refreshCalls).toEqual([
    { lane: "steer", revision: 33 },
    { lane: "steer", revision: 34 },
    { lane: "steer", revision: 35 },
    { lane: "ordinary", revision: 35 },
  ]);
});

test("stops chasing continuous stale pages and resumes after a newer revision", async () => {
  const ordinary = ["A", "B"].map((label) =>
    pendingInputItem(`ordinary-fallback-null-${label.toLowerCase()}`, "ordinary", {
      type: "text",
      text: `Fallback-null queued ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 60, canStop: true }),
    { ordinary, steer: [] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  harness.setPageReadFallbackOverride((request) => {
    const revision = request.revision + 1;
    harness.publish({ ...harness.controller.getSnapshot(), detailRevision: revision });
    return { type: "stale", revision };
  });

  await dialog
    .getByRole("group", { name: "Fallback-null queued B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: Fallback-null queued B",
      exact: true,
    })
    .click();

  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("Updated pending order could not be loaded", { exact: true }))
    .toBeVisible();
  expect(dialog.getByText("Fallback-null queued A", { exact: true }).query()).toBeNull();
  expect(dialog.getByText("Fallback-null queued B", { exact: true }).query()).toBeNull();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(5);
  expect(harness.controller.getSnapshot().detailRevision).toBe(64);

  harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 64 });
  await expect.element(dialog).toBeVisible();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(5);
  expect(dialog.getByText("Fallback-null queued A", { exact: true }).query()).toBeNull();

  harness.clearPageReadFallbackOverride();
  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-recovered-b", "ordinary", {
        type: "text",
        text: "Recovered queued B",
        truncated: false,
      }),
      pendingInputItem("ordinary-recovered-a", "ordinary", {
        type: "text",
        text: "Recovered queued A",
        truncated: false,
      }),
    ],
    steer: [],
  });
  harness.publish({ ...harness.controller.getSnapshot(), detailRevision: 65 });

  await expect.element(dialog.getByText("Recovered queued B", { exact: true })).toBeVisible();
  await expect.element(dialog.getByText("Recovered queued A", { exact: true })).toBeVisible();
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(7);
});

test("hides move actions for owner-projected blockers and while delete confirmation owns the item", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 3, guidingCount: 3, detailRevision: 40, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-manageable-a", "ordinary", {
          type: "text",
          text: "Manageable item A",
          truncated: false,
        }),
        pendingInputItem("ordinary-manageable-b", "ordinary", {
          type: "text",
          text: "Manageable item B",
          truncated: false,
        }),
        pendingInputItem(
          "ordinary-read-only",
          "ordinary",
          { type: "text", text: "Read only item", truncated: false },
          undefined,
          { type: "readOnly", reason: "deliveryInProgress" },
        ),
      ],
      steer: [
        pendingInputItem("steer-manageable-a", "steer", {
          type: "text",
          text: "Manageable steer A",
          truncated: false,
        }),
        pendingInputItem("steer-manageable-b", "steer", {
          type: "text",
          text: "Manageable steer B",
          truncated: false,
        }),
        pendingInputItem(
          "steer-pending",
          "steer",
          { type: "text", text: "Pending steer", truncated: false },
          undefined,
          { type: "readOnly", reason: "deliveryInProgress" },
        ),
      ],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Guide 3, Queued 3", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(
      dialog
        .getByRole("group", { name: "Manageable item A", exact: true })
        .getByRole("button", { name: "Move down pending message: Manageable item A", exact: true }),
    )
    .toBeVisible();
  const readOnlyGroup = dialog.getByRole("group", { name: "Read only item", exact: true });
  expect(
    readOnlyGroup.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length,
  ).toBe(0);
  expect(readOnlyGroup.getByRole("button", { name: /More move options/ }).query()).toBeNull();
  const pendingSteerGroup = dialog.getByRole("group", { name: "Pending steer", exact: true });
  expect(
    pendingSteerGroup.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length,
  ).toBe(0);
  expect(pendingSteerGroup.getByRole("button", { name: /More move options/ }).query()).toBeNull();
  const readOnlyStatusText = dialog
    .getByText("This message has entered the sending process.", { exact: true })
    .first();
  await expect.element(readOnlyStatusText).toBeVisible();

  await dialog
    .getByRole("group", { name: "Manageable steer B", exact: true })
    .getByRole("button", {
      name: "Move up pending message: Manageable steer B",
      exact: true,
    })
    .click();
  await expect
    .element(screen.getByRole("status"))
    .toHaveTextContent("Guiding message moved to position 1 of 2.");
  expect(screen.getByRole("status").all().length).toBe(1);
  await expect.element(readOnlyStatusText).toBeVisible();
  expect(readOnlyStatusText.element().closest('[role="status"]')).toBeNull();

  harness.replaceDetails({
    ordinary: [
      pendingInputItem(
        "ordinary-editing",
        "ordinary",
        { type: "text", text: "Editing item", truncated: false },
        undefined,
        { type: "editing" },
      ),
      pendingInputItem("ordinary-editing-neighbor", "ordinary", {
        type: "text",
        text: "Editing neighbor",
        truncated: false,
      }),
    ],
    steer: [],
  });
  harness.publish(queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 42, canStop: true }));
  await expect
    .poll(
      () => dialog.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length,
    )
    .toBe(0);
  await expect
    .element(dialog.getByText("This message is being edited.", { exact: true }))
    .toBeVisible();

  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-confirm", "ordinary", {
        type: "text",
        text: "Confirm deletion item",
        truncated: false,
      }),
      pendingInputItem("ordinary-neighbor", "ordinary", {
        type: "text",
        text: "Neighbor item",
        truncated: false,
      }),
    ],
    steer: [],
  });
  harness.setMovementBlocked(true);
  harness.publish(queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 43, canStop: true }));
  expect(dialog.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length).toBe(
    0,
  );
  harness.setMovementBlocked(false);
  harness.publish(queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 44, canStop: true }));
  const confirmGroup = dialog.getByRole("group", { name: "Confirm deletion item", exact: true });
  await expect
    .element(confirmGroup.getByRole("button", { name: /Move down pending message:/ }))
    .toBeVisible();
  await confirmGroup.getByRole("button", { name: "Delete", exact: true }).click();
  expect(
    confirmGroup.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length,
  ).toBe(0);
  expect(confirmGroup.getByRole("button", { name: /More move options/ }).query()).toBeNull();
  await confirmGroup.getByRole("button", { name: "Keep", exact: true }).click();

  let preparationExcludedMoveActions = false;
  harness.beginPendingInputEdit.mockImplementationOnce(() => {
    preparationExcludedMoveActions =
      confirmGroup.getByRole("button", { name: /Move (up|down) pending message:/ }).all().length ===
      0;
    return {
      type: "notManageable",
      scope: "liveOwner",
      revision: harness.controller.getSnapshot().detailRevision,
    };
  });
  await confirmGroup.getByRole("button", { name: "Edit", exact: true }).click();
  expect(preparationExcludedMoveActions).toBe(true);
});

test("keeps move failures in the Drawer and rejects a stale session callback", async () => {
  const items = ["A", "B"].map((label) =>
    pendingInputItem(`move-failure-${label}`, "ordinary", {
      type: "text",
      text: `Move failure ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 50, canStop: true }),
    { ordinary: items, steer: [] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  harness.movePendingInput.mockReturnValueOnce({
    type: "notManageable",
    scope: "liveOwner",
    revision: 51,
  });
  await dialog
    .getByRole("group", { name: "Move failure B", exact: true })
    .getByRole("button", { name: "Move up pending message: Move failure B", exact: true })
    .click();
  await expect
    .element(dialog.getByText("Pending message was not reordered", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText("The pending-message order did not change. Refresh complete; try again.", {
        exact: true,
      }),
    )
    .toBeVisible();

  vi.spyOn(screen.sessionHarness.composerRole, "movePendingInput").mockReturnValueOnce(
    staleSessionOperation(52),
  );
  await dialog
    .getByRole("group", { name: "Move failure A", exact: true })
    .getByRole("button", { name: "Move down pending message: Move failure A", exact: true })
    .click();
  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("Pending message was not reordered", { exact: true }))
    .toBeVisible();
});

test("keeps a terminal stale non-move failure in the Drawer when counts reach zero", async () => {
  const items = ["A", "B"].map((label) =>
    pendingInputItem(`terminal-stale-${label}`, "ordinary", {
      type: "text",
      text: `Terminal stale ${label}`,
      truncated: false,
    }),
  );
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 2, detailRevision: 70, canStop: true }),
    { ordinary: items, steer: [] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  harness.movePendingInput.mockImplementationOnce(() => {
    harness.publish(queueSnapshot({ detailRevision: 71, canStop: true }));
    return {
      type: "notManageable",
      scope: "liveOwner",
      revision: 71,
    };
  });
  harness.setPageReadFallbackOverride(() => ({ type: "stale", revision: 71 }));

  await dialog
    .getByRole("group", { name: "Terminal stale B", exact: true })
    .getByRole("button", { name: "Move up pending message: Terminal stale B", exact: true })
    .click();

  await expect.element(dialog).toBeVisible();
  await expect.element(dialog.getByRole("alert")).toBeVisible();
  await expect
    .element(dialog.getByText("Pending message was not reordered", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "The pending-message order did not change, and the refreshed order could not be loaded because the queue kept changing.",
        { exact: true },
      ),
    )
    .toBeVisible();
  expect(dialog.getByRole("status").query()).toBeNull();
  expect(harness.controller.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 0,
    guidingCount: 0,
    detailRevision: 71,
  });
  expect(harness.readPendingInputPage).toHaveBeenCalledTimes(5);
});

test("edits and deletes an ordinary pending message in one Drawer without changing the main draft", async () => {
  const { composer, reservations, screen } = await renderActiveTurn({
    captureEditReservations: true,
  });

  await composer.fill("Original queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Keep this main draft");
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  expect(screen.getByRole("dialog").all().length).toBe(1);

  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  const pendingEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await expect.element(pendingEditor).toHaveTextContent("Original queued message");
  const firstReservation = reservations.at(0);
  if (firstReservation == null) throw new Error("first edit must begin");
  const firstCancel = vi.spyOn(firstReservation, "cancel");
  await pendingEditor.fill("Discard this edit");
  await screen.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(firstCancel).toHaveBeenCalledOnce();
  const cancelledListDialog = screen.getByRole("dialog", {
    name: "Pending details",
    exact: true,
  });
  await expect
    .element(cancelledListDialog.getByText("Original queued message", { exact: true }))
    .toBeVisible();

  await cancelledListDialog.getByRole("button", { name: "Edit", exact: true }).click();
  const escapeEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  const secondReservation = reservations.at(1);
  if (secondReservation == null) throw new Error("second edit must begin");
  const secondCancel = vi.spyOn(secondReservation, "cancel");
  await escapeEditor.fill("Discard this edit with Escape");
  await screen.user.keyboard("{Escape}");
  expect(secondCancel).toHaveBeenCalledOnce();
  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await expect.element(trigger).toHaveFocus();
  await trigger.click();
  const reopenedListDialog = screen.getByRole("dialog", {
    name: "Pending details",
    exact: true,
  });
  await expect
    .element(reopenedListDialog.getByText("Original queued message", { exact: true }))
    .toBeVisible();

  await reopenedListDialog.getByRole("button", { name: "Edit", exact: true }).click();
  const restoredEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await expect.element(restoredEditor).toHaveTextContent("Original queued message");
  await restoredEditor.fill("Edited queued message");
  await restoredEditor.click();
  await screen.user.keyboard("{Enter}");

  const listDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(listDialog.getByText("Edited queued message", { exact: true }))
    .toBeVisible();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Keep this main draft");
  expect(listDialog.getByRole("alert").query()).toBeNull();

  await listDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .element(listDialog.getByText("Delete this pending message?", { exact: true }))
    .toBeVisible();
  expect(screen.getByRole("dialog").all().length).toBe(1);
  await listDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.element(listDialog.getByText("No pending messages", { exact: true })).toBeVisible();
  await expect.element(listDialog.getByRole("heading", { name: "Pending details" })).toHaveFocus();
  expect(listDialog.getByRole("alert").query()).toBeNull();
});

test("returns focus to the Composer when cancelling an edit synchronously drains the last pending message", async () => {
  const { composer, controller, reservations, screen } = await renderActiveTurn({
    captureEditReservations: true,
  });

  await composer.fill("Drain after cancelling edit");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toBeVisible();
  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("draining edit must begin");
  const cancel = vi.spyOn(reservation, "cancel");

  controller.observeAcceptedEvent({ notification: eventTurnCompleted, replay: "live" });
  await expect.poll(() => controller.getSnapshot().ordinaryQueuedCount).toBe(1);

  await screen.getByRole("button", { name: "Close", exact: true }).click();

  expect(cancel).toHaveBeenCalledOnce();
  await expect.poll(() => controller.getSnapshot().ordinaryQueuedCount).toBe(0);
  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  await expect.element(composer).toHaveFocus();
});

test("keeps live-owner management failures in the Drawer as an alert", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 7, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-race", "ordinary", {
          type: "text",
          text: "Racing queued message",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.element(dialog.getByText("Pending message changed", { exact: true })).toBeVisible();
  await expect
    .element(
      dialog.getByText(
        "This message has entered the sending process and can no longer be managed.",
        { exact: true },
      ),
    )
    .toBeVisible();
  await expect.element(dialog).toBeVisible();
  expect(harness.controller.getSnapshot().ordinaryQueuedCount).toBe(1);
});

test("keeps a last unsent steer target invalidation in the Drawer without settling its reservation", async () => {
  const commandHandle = createGuiHostCommands();
  const steerRequest = deferred<Awaited<ReturnType<GuiHostCommands["steerTurn"]>>>();
  vi.mocked(commandHandle.steerTurn).mockReturnValue(steerRequest.promise);
  const { composer, controller, reservations, screen } = await renderActiveTurn({
    captureEditReservations: true,
    commandHandle,
  });

  await composer.fill("Already issued steer");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await composer.fill("Still unsent steer");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Guide 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });

  await expect
    .element(dialog.getByText("This message has entered the sending process.", { exact: true }))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: "Edit", exact: true }).all().length).toBe(1);
  expect(dialog.getByRole("button", { name: "Delete", exact: true }).all().length).toBe(1);

  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toHaveTextContent("Still unsent steer");
  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("unsent steer edit must begin");
  const save = vi.spyOn(reservation, "save");
  const cancel = vi.spyOn(reservation, "cancel");

  controller.observeAcceptedEvent({ notification: eventTurnCompleted, replay: "live" });

  await expect.poll(() => controller.getSnapshot().guidingCount).toBe(0);
  const heldDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(heldDialog.getByText("Pending message changed", { exact: true }))
    .toBeVisible();
  await expect
    .element(
      heldDialog.getByText("The target turn closed before the edit was saved.", { exact: true }),
    )
    .toBeVisible();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  await expect.element(heldDialog.getByRole("heading", { name: "Pending details" })).toHaveFocus();
  await heldDialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect.element(heldDialog).not.toBeInTheDocument();
  await expect.element(composer).toHaveFocus();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});

test("tears down an active edit without settling its reservation when projection is unavailable", async () => {
  const commandHandle = createGuiHostCommands();
  const skillCatalog = createSkillCatalogHarness();
  const { composer, reservations, screen } = await renderActiveTurn({
    captureEditReservations: true,
    commandHandle,
    skillCatalogController: skillCatalog.controller,
  });

  await composer.fill("Owner-bound queued message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await screen.getByRole("button", { name: "Edit", exact: true }).click();
  await expect
    .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
    .toBeVisible();
  const reservation = reservations.at(0);
  if (reservation == null) throw new Error("owner-bound edit must begin");
  const save = vi.spyOn(reservation, "save");
  const cancel = vi.spyOn(reservation, "cancel");

  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );

  await expect
    .element(screen.getByRole("dialog", { name: "Edit pending message", exact: true }))
    .not.toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
  await expect.element(getComposer(screen)).toHaveFocus();
});

test("restores delete focus only to a neighbor in the same lane", async () => {
  const { composer, screen } = await renderActiveTurn();

  await composer.fill("First ordinary neighbor");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Second ordinary neighbor");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const firstItem = dialog.getByRole("group", { name: "First ordinary neighbor", exact: true });
  await firstItem.getByRole("button", { name: "Delete", exact: true }).click();
  await firstItem.getByRole("button", { name: "Delete", exact: true }).click();

  const secondItem = dialog.getByRole("group", { name: "Second ordinary neighbor", exact: true });
  await expect.element(secondItem).toHaveFocus();
  await expect
    .element(dialog.getByText("First ordinary neighbor", { exact: true }))
    .not.toBeInTheDocument();
});

test("keeps the Drawer open when a pending-input detail is missing", async () => {
  const previewText = "Missing detail preview...";
  const item = pendingInputItem("missing-detail", "steer", {
    type: "text",
    text: previewText,
    truncated: true,
  });
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    { ordinary: [], steer: [item] },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  await screen.getByRole("button", { name: "Pending: Guide 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const expand = dialog.getByRole("button", {
    name: `Expand pending message: ${previewText}`,
    exact: true,
  });
  await expand.click();

  await expect.element(dialog).toBeVisible();
  await expect.element(expand).toBeVisible();
  expect(harness.readPendingInputDetail).toHaveBeenCalledExactlyOnceWith({
    key: item.key,
    revision: 1,
  });
});

test("uses one pending trigger for either lane and hides it when both lanes are empty", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-only", "ordinary", {
          type: "text",
          text: "Ordinary only",
          truncated: false,
        }),
      ],
      steer: [
        pendingInputItem("steer-only", "steer", {
          type: "text",
          text: "Guide only",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const region = screen.getByRole("region", { name: "Pending messages", exact: true });

  const guideTrigger = region.getByRole("button", {
    name: "Pending: Guide 1",
    exact: true,
  });
  await expect.element(guideTrigger).toBeVisible();
  await expect.element(guideTrigger).toHaveTextContent("Guide 1");
  await expect.element(guideTrigger).not.toHaveTextContent("Queued");

  harness.publish(queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 2, canStop: true }));
  const queuedTrigger = region.getByRole("button", {
    name: "Pending: Queued 1",
    exact: true,
  });
  await expect.element(queuedTrigger).toBeVisible();
  await expect.element(queuedTrigger).toHaveTextContent("Queued 1");
  await expect.element(queuedTrigger).not.toHaveTextContent("Guide");

  harness.publish(queueSnapshot({ detailRevision: 3, canStop: true }));
  await expect.element(region).not.toBeInTheDocument();
});

test("closes and clears pending details when counts become empty", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-to-clear", "ordinary", {
          type: "text",
          text: "Clear this pending detail",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(dialog.getByText("Clear this pending detail", { exact: true }))
    .toBeVisible();

  harness.publish(queueSnapshot({ detailRevision: 2, canStop: true }));

  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Clear this pending detail", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(getComposer(screen)).toHaveFocus();
  await expect
    .element(screen.getByRole("region", { name: "Pending messages", exact: true }))
    .not.toBeInTheDocument();
});

test("does not reopen a closing Drawer when new pending input arrives before presence ends", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [
        pendingInputItem("ordinary-closing", "ordinary", {
          type: "text",
          text: "Closing pending detail",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  const trigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await trigger.click();
  const closingDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(closingDialog.getByText("Closing pending detail", { exact: true }))
    .toBeVisible();

  harness.publish(queueSnapshot({ detailRevision: 2, canStop: true }));
  await expect.element(closingDialog).not.toBeInTheDocument();
  harness.replaceDetails({
    ordinary: [
      pendingInputItem("ordinary-new", "ordinary", {
        type: "text",
        text: "New pending detail",
        truncated: false,
      }),
    ],
    steer: [],
  });
  harness.publish(queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 3, canStop: true }));

  const nextTrigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await expect.element(nextTrigger).toBeVisible();
  expect(screen.getByText("New pending detail", { exact: true }).query()).toBeNull();

  await nextTrigger.click();
  const nextDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(nextDialog.getByText("New pending detail", { exact: true })).toBeVisible();
});

test("replaces an open pending-input owner without leaking its cached view into the new owner", async () => {
  const queueHarness = createQueueControllerHarness(
    queueSnapshot({ ordinaryQueuedCount: 1, detailRevision: 1 }),
    {
      ordinary: [
        pendingInputItem("owner-old", "ordinary", {
          type: "text",
          text: "Old owner pending message",
          truncated: false,
        }),
      ],
      steer: [],
    },
  );
  const skillHarness = createSkillCatalogHarness();
  const firstRevision = 1;
  const firstOwner = createActiveThreadSessionHarness({
    composerRole: composerRoleFor(queueHarness.controller, () => firstRevision),
    skillsRole: skillsRoleFor(skillHarness.controller),
  });
  const replacementRevision = 2;
  const replacementOwner = createActiveThreadSessionHarness({
    composerRole: composerRoleFor(queueHarness.controller, () => replacementRevision),
    skillsRole: skillsRoleFor(skillHarness.controller),
  });
  const firstSnapshot = firstOwner.activeSnapshot({
    revision: firstRevision,
    threadId,
    subscriptionId: attachResponse.subscriptionId,
    composer: queueHarness.controller.getSnapshot(),
    skills: skillHarness.controller.getSnapshot(),
  });
  const replacementSnapshot = replacementOwner.activeSnapshot({
    revision: replacementRevision,
    threadId,
    subscriptionId: attachResponse.subscriptionId,
    composer: queueHarness.controller.getSnapshot(),
    skills: skillHarness.controller.getSnapshot(),
  });
  const renderSnapshot = (snapshot: typeof firstSnapshot) => (
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        authorizationToken={null}
        guardCompositionEndEnter={false}
        routeTarget={{ type: "currentTask", threadId }}
        sessionSnapshot={snapshot}
      />
    </>
  );
  const screen = await renderWithProviders(renderSnapshot(firstSnapshot));

  await screen.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  const oldDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(oldDialog.getByText("Old owner pending message", { exact: true }))
    .toBeVisible();

  queueHarness.replaceDetails({
    ordinary: [
      pendingInputItem("owner-new", "ordinary", {
        type: "text",
        text: "Replacement owner pending message",
        truncated: false,
      }),
    ],
    steer: [],
  });
  await screen.rerender(renderSnapshot(replacementSnapshot));

  await expect.element(oldDialog).not.toBeInTheDocument();
  const replacementTrigger = screen.getByRole("button", {
    name: "Pending: Queued 1",
    exact: true,
  });
  await expect.element(replacementTrigger).toBeVisible();
  await replacementTrigger.click();
  const replacementDialog = screen.getByRole("dialog", {
    name: "Pending details",
    exact: true,
  });
  await expect
    .element(replacementDialog.getByText("Replacement owner pending message", { exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Old owner pending message", { exact: true }))
    .not.toBeInTheDocument();
});

test("keeps pending details readable while projection mutations are unavailable", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({ guidingCount: 1, detailRevision: 1, canStop: true }),
    {
      ordinary: [],
      steer: [
        pendingInputItem("steer-owner", "steer", {
          type: "text",
          text: "Unavailable projection detail",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);

  await screen.getByRole("button", { name: "Pending: Guide 1", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(dialog.getByText("Unavailable projection detail", { exact: true }))
    .toBeVisible();
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );

  await expect.element(dialog).toBeVisible();
  await expect
    .element(dialog.getByText("Unavailable projection detail", { exact: true }))
    .toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
});

test("rejects a mutation callback captured from an older session revision", async () => {
  const queueHarness = createQueueControllerHarness(queueSnapshot());
  const screen = await renderAttached(
    createGuiHostCommands(),
    false,
    "en",
    queueHarness.controller,
  );
  const capturedSnapshot = screen.sessionHarness.session.getSnapshot();
  if (capturedSnapshot.phase !== "active") throw new Error("expected an active session");

  queueHarness.publish({ ...queueHarness.controller.getSnapshot() });
  const currentSnapshot = screen.sessionHarness.session.getSnapshot();
  if (currentSnapshot.phase !== "active") throw new Error("expected an active session");

  expect(
    capturedSnapshot.composerRole.submit(
      capturedSnapshot.revision,
      composerDraftCapture("stale callback"),
    ),
  ).toEqual({
    type: "unavailable",
    scope: "activeThreadSession",
    reason: "staleRevision",
    revision: currentSnapshot.revision,
  });
  expect(queueHarness.submit).not.toHaveBeenCalled();
});

test("renders Simplified Chinese guide and pending-input copy", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      ordinaryQueuedCount: 2,
      guidingCount: 1,
      detailRevision: 1,
      rejectedSteers: [
        {
          key: "rejected-zh",
          preview: { type: "text", text: "然后优先发送这条", truncated: false },
          reason: "activeTurnNotSteerable",
        },
      ],
      hasUnknownSteer: true,
      canStop: true,
    }),
    {
      ordinary: [
        pendingInputItem("ordinary-zh-a", "ordinary", {
          type: "text",
          text: "普通消息一",
          truncated: false,
        }),
        pendingInputItem("ordinary-zh-b", "ordinary", {
          type: "text",
          text: "普通消息二",
          truncated: false,
        }),
      ],
      steer: [
        pendingInputItem("pending-zh", "steer", {
          type: "text",
          text: "先引导这条",
          truncated: false,
        }),
      ],
    },
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "zh-CN", harness.controller);

  await expect.element(screen.getByRole("button", { name: "引导", exact: true })).toBeDisabled();
  const region = screen.getByRole("region", { name: "待处理消息", exact: true });
  const trigger = region.getByRole("button", {
    name: "待处理：引导 1，排队 2",
    exact: true,
  });
  await expect.element(trigger).toBeVisible();
  await expect.element(region.getByText("将优先发送", { exact: true })).toBeVisible();
  await expect.element(region.getByText("当前无法引导，已加入队列", { exact: true })).toBeVisible();
  await expect.element(region.getByText("引导状态未知", { exact: true })).toBeVisible();
  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "待处理详情", exact: true });
  await expect.element(dialog.getByRole("heading", { name: "引导中" })).toBeVisible();
  await expect.element(dialog.getByRole("heading", { name: "已排队" })).toBeVisible();
  const secondQueuedGroup = dialog.getByRole("group", { name: "普通消息二", exact: true });
  await expect
    .element(
      secondQueuedGroup.getByRole("button", {
        name: "上移待处理消息：普通消息二",
        exact: true,
      }),
    )
    .toBeVisible();
  await secondQueuedGroup
    .getByRole("button", {
      name: "待处理消息的更多移动选项：普通消息二",
      exact: true,
    })
    .click();
  const moveMenu = screen.getByRole("menu");
  await expect
    .element(moveMenu.getByRole("menuitem", { name: "移至队首", exact: true }))
    .toBeVisible();
  await moveMenu.getByRole("menuitem", { name: "移至队首", exact: true }).click();
  await expect
    .element(dialog.getByRole("status"))
    .toHaveTextContent("已将已排队消息移到第 1 项，共 2 项。");
});

test("manual reconnect disables composer operations", async () => {
  expect.hasAssertions();

  const screen = await renderAttached(createGuiHostCommands());
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );

  await expectComposerDisabled(screen);
});

test("definite send failure exposes recovery without restoring the submitted draft", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  startTurn.mockRejectedValueOnce(
    new GuiHostCommandError({
      error: new Error("network failed"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );
  const screen = await renderAttached(commandHandle);
  const composer = getComposer(screen);

  await composer.fill("Keep this draft");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
  await expect.element(screen.getByText("1 message has not been sent")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Continue sending" })).toBeVisible();
});

test("renders Simplified Chinese composer and recovery copy", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  startTurn.mockRejectedValueOnce(
    new GuiHostCommandError({
      error: new Error("network failed"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );
  const screen = await renderAttached(commandHandle, false, "zh-CN");
  const composer = getComposer(screen, "向 Codex 发送消息");

  await expect.element(screen.getByRole("region", { name: "消息输入区" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "停止" })).toBeDisabled();
  await composer.fill("保留这份草稿");
  await screen.getByRole("button", { name: "发送" }).click();

  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
  await expect.element(screen.getByText("1 条消息尚未发送")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "继续发送" })).toBeVisible();
});

test("recovery disables send, keeps the editor editable, and prevents duplicate recovery", async () => {
  const initialSnapshot = queueSnapshot({
    recoveryCount: 2,
    recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
  });
  const harness = createQueueControllerHarness(initialSnapshot);
  harness.recover.mockImplementation(() => {
    harness.publish({ ...initialSnapshot, isRecovering: true });
    return true;
  });
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const composer = getComposer(screen);
  const recoverButton = screen.getByRole("button", { name: "Continue sending" });

  await composer.fill("Draft while recovering");
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(recoverButton).toHaveAccessibleDescription("2 messages have not been sent");
  await userEvent.click(recoverButton);
  await expect.element(recoverButton).toBeDisabled();

  expect(harness.recover).toHaveBeenCalledExactlyOnceWith();
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while recovering");
});

test("guards recovery while manual reconnect is required", async () => {
  const harness = createQueueControllerHarness(
    queueSnapshot({
      recoveryCount: 2,
      recovery: { reason: "startDefinitelyNotAccepted", count: 2 },
    }),
  );
  const screen = await renderAttached(createGuiHostCommands(), false, "en", harness.controller);
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  screen.sessionHarness.publish(
    screen.sessionHarness.projectionUnavailableSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      reason: "backpressure",
    }),
  );
  const composer = getComposer(screen);
  const recoverButton = screen.getByRole("button", { name: "Continue sending" });

  await expect.element(composer).toHaveAttribute("contenteditable", "false");
  await expect.element(recoverButton).toBeDisabled();
});

test("accepted stop remains pending until its matching terminal", async () => {
  const { composer, controller, interruptTurn, pending, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  expect(interruptTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    turnId: eventTurnStarted.event.notification.turn.id,
  });

  pending.resolve({});
  await expect.poll(() => controller.getSnapshot().interrupt?.phase).toBe("accepted");
  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");

  controller.observeAcceptedEvent({
    notification: turnCompleted(eventTurnCompleted, "commit-pending-stop", {
      ...eventTurnStarted.event.notification.turn,
      status: "interrupted",
    }),
    replay: "live",
  });

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).not.toHaveAttribute("data-pending");
});

test("unknown stop delivery keeps its pending owner and prevents retry", async () => {
  const { composer, interruptTurn, pending, screen, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  pending.reject(new Error("interrupt failed"));

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
  await expect.element(screen.getByText("Stop failed")).not.toBeInTheDocument();
  await expect.element(screen.getByText("interrupt failed")).not.toBeInTheDocument();
  expect(interruptTurn).toHaveBeenCalledTimes(1);
});

test("definite stop failure keeps the draft, reports failure, and allows retry", async () => {
  const { composer, interruptTurn, pending, screen, stopButton } =
    await beginPendingStop("Draft while stopping");

  pending.reject(
    new GuiHostCommandError({
      error: new Error("interrupt rejected"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );

  await expect.element(screen.getByRole("status")).toHaveTextContent("Stop failed");
  await expect.element(stopButton).toBeEnabled();
  await expect.element(stopButton).not.toHaveAttribute("data-pending");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
  await expect.element(screen.getByText("interrupt rejected")).not.toBeInTheDocument();
  expect(interruptTurn).toHaveBeenCalledTimes(1);
});
