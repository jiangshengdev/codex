import { Toast } from "@heroui/react";
import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
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
  type ComposerPendingInputCoordinatorEditReservation,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  attachBaseline,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { turnCompleted } from "@/features/projection/__tests__/projectionTestBuilders";
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

beforeEach(async () => {
  await userEvent.unhover(document.body);
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

const getComposer = (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
  name = "Message Codex",
) => screen.getByRole("combobox", { name, exact: true });

const composerTextWithoutTrailingBrowserPlaceholders = (
  element: Readonly<Pick<Node, "textContent">>,
): string => (element.textContent ?? "").replace(/[ \n\r\u00a0\u200b]+$/u, "");

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

  await expect
    .element(screen.getByRole("status").filter({ hasText: "Stop failed" }))
    .toHaveTextContent("Stop failed");
  await expect.element(stopButton).toBeEnabled();
  await expect.element(stopButton).not.toHaveAttribute("data-pending");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
  await expect.element(screen.getByText("interrupt rejected")).not.toBeInTheDocument();
  expect(interruptTurn).toHaveBeenCalledTimes(1);
});
