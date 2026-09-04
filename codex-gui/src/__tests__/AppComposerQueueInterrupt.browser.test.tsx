import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import {
  attachResponse,
  createGuiHostCommands,
  emitProjectionEvent,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import {
  renderActiveComposerQueueApp,
  startTurnParamsAt,
} from "./appComposerQueueBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  eventWithEnvelope,
  inProgressTurn,
  turnCompleted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

vi.mock("@/features/composerInputQueue/composerInputQueueCoordinator", { spy: true });

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

const expectStartTurnCalledOnceWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledOnce();
  const params = startTurnParamsAt(startTurn, 0);
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

const expectStartTurnSecondCallWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledTimes(2);
  const params = startTurnParamsAt(startTurn, 1);
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenNthCalledWith(2, {
    threadId: launchThreadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
});

afterEach(() => {
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
});

const getAppComposer = (screen: Awaited<ReturnType<typeof renderWithProviders>>) =>
  screen.getByRole("combobox", { name: "Message Codex", exact: true });

const renderReadyApp = async (commandHandle = createGuiHostCommands()) => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  queueAttachProjectionResponse(commandHandle);
  initializeHost(options, commandHandle);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");

  return { commandHandle, options, screen };
};

test("App keeps a local Stop paused until explicit rejected-first and ordinary FIFO recovery", async () => {
  let startedTurnSequence = 0;
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockImplementation(() => {
    startedTurnSequence += 1;
    return Promise.resolve({
      turn: inProgressTurn(`turn-local-recovery-${String(startedTurnSequence)}`),
    });
  });
  const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>().mockRejectedValue(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("local steer rejected"),
    }),
  );
  const { activeTurn, composer, interruptTurn, options, queueCoordinator, screen } =
    await renderActiveComposerQueueApp(startGuiHostConnectionMock, { startTurn, steerTurn });

  await composer.fill("First ordinary message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Second ordinary message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Stop" }).click();
  await expect
    .poll(() => interruptTurn.mock.calls)
    .toEqual([[{ threadId: launchThreadId, turnId: activeTurn.id }]]);
  await expect.poll(() => queueCoordinator.getSnapshot().interrupt).toEqual({ phase: "accepted" });
  expect(queueCoordinator.submitSteer(composerDraftCapture("Rejected steer"))).toEqual({
    type: "accepted",
  });
  await expect
    .poll(() => queueCoordinator.getSnapshot().recovery)
    .toEqual({
      reason: "steerDefinitelyNotAccepted",
      count: 1,
    });
  expect(queueCoordinator.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 2,
    guidingCount: 0,
    recoveryCount: 1,
  });
  const queuedTrigger = screen.getByRole("button", { name: "Pending: Queued 2", exact: true });
  await expect.element(queuedTrigger).toBeVisible();

  const interrupted = turnCompleted(eventTurnCompleted, "commit-active-interrupted", {
    ...activeTurn,
    status: "interrupted",
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(interrupted, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );

  await expect.element(screen.getByText("3 messages have not been sent")).toBeVisible();
  expect(queueCoordinator.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 0,
    guidingCount: 0,
    recoveryCount: 3,
  });
  await expect.element(queuedTrigger).not.toBeInTheDocument();
  expect(startTurn).not.toHaveBeenCalled();
  await composer.fill("Draft preserved during recovery");
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();

  await screen.getByRole("button", { name: "Continue sending" }).click();

  expectStartTurnCalledOnceWithText(startTurn, "Rejected steer");
  const recoveredSteerStarted = turnStarted(
    eventTurnStarted,
    "commit-recovered-steer-started",
    inProgressTurn("turn-local-recovery-1"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSteerStarted, { parentCommitId: interrupted.commitId }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
  await expect.element(composer).toHaveTextContent("Draft preserved during recovery");

  const recoveredSteerCompleted = turnCompleted(
    eventTurnCompleted,
    "commit-recovered-steer",
    baseTurn("turn-local-recovery-1"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSteerCompleted, {
      parentCommitId: recoveredSteerStarted.commitId,
    }),
  );

  expectStartTurnSecondCallWithText(startTurn, "First ordinary message");
  const recoveredFirstOrdinaryStarted = turnStarted(
    eventTurnStarted,
    "commit-recovered-first-ordinary-started",
    inProgressTurn("turn-local-recovery-2"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredFirstOrdinaryStarted, {
      parentCommitId: recoveredSteerCompleted.commitId,
    }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
  const recoveredFirstOrdinaryCompleted = turnCompleted(
    eventTurnCompleted,
    "commit-recovered-first-ordinary",
    baseTurn("turn-local-recovery-2"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredFirstOrdinaryCompleted, {
      parentCommitId: recoveredFirstOrdinaryStarted.commitId,
    }),
  );

  expect(startTurn).toHaveBeenCalledTimes(3);
  const thirdParams = startTurnParamsAt(startTurn, 2);
  expect(startTurn).toHaveBeenNthCalledWith(3, {
    threadId: launchThreadId,
    clientUserMessageId: thirdParams.clientUserMessageId,
    input: [{ type: "text", text: "Second ordinary message", text_elements: [] }],
  });
  const recoveredSecondOrdinaryStarted = turnStarted(
    eventTurnStarted,
    "commit-recovered-second-ordinary-started",
    inProgressTurn("turn-local-recovery-3"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSecondOrdinaryStarted, {
      parentCommitId: recoveredFirstOrdinaryCompleted.commitId,
    }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
  await expect.element(composer).toHaveTextContent("Draft preserved during recovery");
});

test("App auto-recovers a non-local interruption rejected-first before ordinary FIFO", async () => {
  let startedTurnSequence = 0;
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockImplementation(() => {
    startedTurnSequence += 1;
    return Promise.resolve({
      turn: inProgressTurn(`turn-non-local-${String(startedTurnSequence)}`),
    });
  });
  const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>().mockRejectedValue(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("non-local steer rejected"),
    }),
  );
  const { activeTurn, composer, interruptTurn, options, queueCoordinator, screen } =
    await renderActiveComposerQueueApp(startGuiHostConnectionMock, { startTurn, steerTurn });

  await composer.fill("Ordinary after non-local interruption");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  expect(queueCoordinator.submitSteer(composerDraftCapture("Non-local rejected steer"))).toEqual({
    type: "accepted",
  });
  await expect
    .poll(() => queueCoordinator.getSnapshot().recovery)
    .toEqual({
      reason: "steerDefinitelyNotAccepted",
      count: 1,
    });

  const interrupted = turnCompleted(eventTurnCompleted, "commit-non-local-interrupted", {
    ...activeTurn,
    status: "interrupted",
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(interrupted, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );

  expect(interruptTurn).not.toHaveBeenCalled();
  expectStartTurnCalledOnceWithText(startTurn, "Non-local rejected steer");
  const recoveredSteerStarted = turnStarted(
    eventTurnStarted,
    "commit-non-local-recovered-steer-started",
    inProgressTurn("turn-non-local-1"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSteerStarted, { parentCommitId: interrupted.commitId }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
  await expect
    .element(screen.getByRole("button", { name: "Continue sending" }))
    .not.toBeInTheDocument();

  const recoveredSteerCompleted = turnCompleted(
    eventTurnCompleted,
    "commit-non-local-recovered-steer",
    baseTurn("turn-non-local-1"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSteerCompleted, {
      parentCommitId: recoveredSteerStarted.commitId,
    }),
  );

  expectStartTurnSecondCallWithText(startTurn, "Ordinary after non-local interruption");
  const recoveredOrdinaryStarted = turnStarted(
    eventTurnStarted,
    "commit-non-local-recovered-ordinary-started",
    inProgressTurn("turn-non-local-2"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredOrdinaryStarted, {
      parentCommitId: recoveredSteerCompleted.commitId,
    }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
});

test("App enables Stop for the current active turn", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);
  const projectionEvent = eventTurnStarted;
  emitProjectionEvent(options, projectionEvent);

  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  await screen.getByRole("button", { name: "Stop" }).click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledWith({
    threadId: launchThreadId,
    turnId: projectionEvent.event.notification.turn.id,
  });
});
