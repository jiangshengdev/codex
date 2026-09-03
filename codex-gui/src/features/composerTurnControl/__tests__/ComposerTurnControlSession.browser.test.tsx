import { Toast } from "@heroui/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { StrictMode, useSyncExternalStore } from "react";
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
  type ComposerPendingInputCoordinatorEditReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  attachReplacement,
  eventTokenUsageUpdated,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { tokenUsageUpdated } from "@/features/projection/__tests__/projectionTestBuilders";
import type { SkillCatalogState } from "@/features/skillCatalog/skillCatalogOwner";
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

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

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

test("presents thread status from the active session snapshot", async () => {
  const screen = await renderAttached();
  const activeSnapshot = screen.sessionHarness.session.getSnapshot();
  if (activeSnapshot.phase !== "active") throw new Error("expected an active session");
  const composer = getComposer(screen);
  composer.element().focus();
  await expect.element(composer).toHaveFocus();

  screen.sessionHarness.publish(
    screen.sessionHarness.activeSnapshot({
      ...activeSnapshot,
      revision: activeSnapshot.revision + 1,
      threadStatus: { type: "active", activeFlags: ["waitingOnApproval"] },
    }),
  );

  await expect
    .element(screen.getByRole("status", { name: "Current task is waiting for approval" }))
    .toHaveTextContent("Waiting for approval");
  await expect.element(composer).toHaveFocus();
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

test("keeps context controls when a replacement attach has no usage", async () => {
  const screen = await renderAttached();
  const contextUsageButton = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });
  await expect.element(contextUsageButton).toBeVisible();

  dispatchReadModelFacts(screen, [{ type: "baselineAttached", response: attachReplacement }]);

  const unavailableContextUsageButton = screen.getByRole("button", {
    name: "Context usage details, usage unavailable",
    exact: true,
  });
  await expect.element(unavailableContextUsageButton).toBeVisible();
  await unavailableContextUsageButton.click();

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  await expect
    .element(dialog.getByText("Context usage is unavailable.", { exact: true }))
    .toBeVisible();
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
