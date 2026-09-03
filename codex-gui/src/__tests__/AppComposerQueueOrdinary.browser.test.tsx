import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import {
  attachResponse,
  createDeferred,
  createGuiHostCommands,
  emitProjectionEvent,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type {
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithTurns,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
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

const readPendingItems = (
  coordinator: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
  limit = 20,
): readonly ComposerPendingInputPageItem[] => {
  const snapshot = coordinator.getSnapshot();
  const result = coordinator.readPendingInputPage({
    lane,
    revision: snapshot.detailRevision,
    cursor: null,
    limit,
  });
  if (result.type !== "page") {
    throw new Error(`expected ${lane} pending-input page, received ${result.type}`);
  }
  return result.items;
};

const readPendingTextPreviews = (
  coordinator: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
): string[] =>
  readPendingItems(coordinator, lane).map(({ preview }) =>
    preview.type === "text" ? preview.text : "nonText",
  );

const startTurnParamsAt = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  index: number,
): Parameters<GuiHostCommands["startTurn"]>[0] => {
  const call = startTurn.mock.calls.at(index);
  if (call == null) {
    throw new Error(`startTurn call ${String(index + 1)} must be recorded`);
  }
  return call[0];
};

const steerTurnParamsAt = (
  steerTurn: Mock<GuiHostCommands["steerTurn"]>,
  index: number,
): Parameters<GuiHostCommands["steerTurn"]>[0] => {
  const call = steerTurn.mock.calls.at(index);
  if (call == null) {
    throw new Error(`steerTurn call ${String(index + 1)} must be recorded`);
  }
  return call[0];
};

const readGuiHostCommandCallCounts = (
  commands: GuiHostCommands,
): Record<keyof GuiHostCommands, number> => ({
  compactThread: vi.mocked(commands.compactThread).mock.calls.length,
  attachThreadProjection: vi.mocked(commands.attachThreadProjection).mock.calls.length,
  listSkills: vi.mocked(commands.listSkills).mock.calls.length,
  listThreads: vi.mocked(commands.listThreads).mock.calls.length,
  readThread: vi.mocked(commands.readThread).mock.calls.length,
  resumeThread: vi.mocked(commands.resumeThread).mock.calls.length,
  detachThreadProjection: vi.mocked(commands.detachThreadProjection).mock.calls.length,
  startTurn: vi.mocked(commands.startTurn).mock.calls.length,
  steerTurn: vi.mocked(commands.steerTurn).mock.calls.length,
  interruptTurn: vi.mocked(commands.interruptTurn).mock.calls.length,
});

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

type ActiveAppCommandOverrides = Partial<{
  interruptTurn: Mock<GuiHostCommands["interruptTurn"]>;
  startTurn: Mock<GuiHostCommands["startTurn"]>;
  steerTurn: Mock<GuiHostCommands["steerTurn"]>;
}>;

const renderActiveApp = async (commandOverrides: ActiveAppCommandOverrides = {}) => {
  const startTurn =
    commandOverrides.startTurn ??
    vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
      turn: inProgressTurn("turn-started-from-app"),
    });
  const steerTurn =
    commandOverrides.steerTurn ??
    vi.fn<GuiHostCommands["steerTurn"]>().mockResolvedValue({
      turnId: "turn-steered-from-app",
    });
  const interruptTurn =
    commandOverrides.interruptTurn ??
    vi.fn<GuiHostCommands["interruptTurn"]>().mockResolvedValue({});
  const commandHandle: GuiHostCommands = {
    ...createGuiHostCommands(),
    interruptTurn,
    startTurn,
    steerTurn,
  };
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const activeTurn = inProgressTurn("turn-active-queue");

  queueAttachProjectionResponse(commandHandle, attachWithTurns(attachResponse, [activeTurn]));
  initializeHost(options, commandHandle);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");
  await expect.poll(() => vi.mocked(createComposerInputQueueCoordinator).mock.calls.length).toBe(1);
  const coordinatorResult = vi.mocked(createComposerInputQueueCoordinator).mock.results.at(0);
  if (coordinatorResult?.type !== "return") {
    throw new Error("active App must create a queue coordinator");
  }

  return {
    activeTurn,
    commandHandle,
    interruptTurn,
    options,
    queueCoordinator: coordinatorResult.value,
    screen,
    startTurn,
    steerTurn,
  };
};

test("App drains ordinary inputs in the authoritative order selected through Pending details", async () => {
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const issuingSteer = createDeferred<SteerResponse>();
  const secondSteer = createDeferred<SteerResponse>();
  const steerTurn = vi
    .fn<GuiHostCommands["steerTurn"]>()
    .mockImplementationOnce(() => issuingSteer.promise)
    .mockImplementationOnce(() => secondSteer.promise);
  const firstStartedTurn = inProgressTurn("turn-reordered-ordinary-first");
  const secondStartedTurn = inProgressTurn("turn-reordered-ordinary-second");
  const thirdStartedTurn = inProgressTurn("turn-reordered-ordinary-third");
  const startTurn = vi
    .fn<GuiHostCommands["startTurn"]>()
    .mockResolvedValueOnce({ turn: firstStartedTurn })
    .mockResolvedValueOnce({ turn: secondStartedTurn })
    .mockResolvedValueOnce({ turn: thirdStartedTurn });
  const { activeTurn, commandHandle, options, queueCoordinator, screen } = await renderActiveApp({
    startTurn,
    steerTurn,
  });
  const composer = getAppComposer(screen);
  const transcript = screen.getByRole("region", { name: "Committed transcript" });

  for (const text of ["Ordinary order A", "Ordinary order B", "Ordinary order C"]) {
    await composer.fill(text);
    await screen.getByRole("button", { name: "Send", exact: true }).click();
  }
  for (const text of ["Steer lane A", "Steer lane B"]) {
    await composer.fill(text);
    dispatchGuideShortcut(composer.element());
  }
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);
  const steerOrderBeforeMove = readPendingTextPreviews(queueCoordinator, "steer");
  expect(steerOrderBeforeMove).toEqual(["Steer lane A", "Steer lane B"]);

  await screen.getByRole("button", { name: "Pending: Guide 2, Queued 3", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await dialog
    .getByRole("group", { name: "Ordinary order C", exact: true })
    .getByRole("button", {
      name: "More move options for pending message: Ordinary order C",
      exact: true,
    })
    .click();
  const releaseReadinessBeforeMove = queueCoordinator.getReleaseReadiness();
  const hostCallsBeforeMove = readGuiHostCommandCallCounts(commandHandle);
  expect(hostCallsBeforeMove).toEqual({
    attachThreadProjection: 1,
    listSkills: 1,
    listThreads: 0,
    readThread: 0,
    resumeThread: 0,
    detachThreadProjection: 0,
    startTurn: 0,
    steerTurn: 1,
    interruptTurn: 0,
  });
  await screen
    .getByRole("menu")
    .getByRole("menuitem", { name: "Move to first", exact: true })
    .click();

  await expect
    .poll(() => readPendingTextPreviews(queueCoordinator, "ordinary"))
    .toEqual(["Ordinary order C", "Ordinary order A", "Ordinary order B"]);
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual(steerOrderBeforeMove);
  expect(queueCoordinator.getReleaseReadiness()).toEqual(releaseReadinessBeforeMove);
  expect(readGuiHostCommandCallCounts(commandHandle)).toEqual(hostCallsBeforeMove);
  expect(startTurn).not.toHaveBeenCalled();
  expect(steerTurn).toHaveBeenCalledOnce();
  for (const text of ["Ordinary order A", "Ordinary order B", "Ordinary order C"]) {
    await expect.element(transcript.getByText(text, { exact: true })).not.toBeInTheDocument();
  }

  const firstSteerParams = steerTurnParamsAt(steerTurn, 0);
  const firstSteerCommitted = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-reordered-ordinary-steer-a",
      activeTurn.id,
      userMessage(
        "user-reordered-ordinary-steer-a",
        [textInput("Steer lane A")],
        firstSteerParams.clientUserMessageId,
      ),
    ),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, firstSteerCommitted);
  await expect.poll(() => steerTurn.mock.calls.length).toBe(2);
  const secondSteerParams = steerTurnParamsAt(steerTurn, 1);
  expect(secondSteerParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: secondSteerParams.clientUserMessageId,
    input: [textInput("Steer lane B")],
  });
  const secondSteerCommitted = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-reordered-ordinary-steer-b",
      activeTurn.id,
      userMessage(
        "user-reordered-ordinary-steer-b",
        [textInput("Steer lane B")],
        secondSteerParams.clientUserMessageId,
      ),
    ),
    { parentCommitId: firstSteerCommitted.commitId },
  );
  emitProjectionEvent(options, secondSteerCommitted);
  issuingSteer.resolve({ turnId: activeTurn.id });
  secondSteer.resolve({ turnId: activeTurn.id });

  const activeTerminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "commit-reordered-ordinary-active-terminal", {
      ...activeTurn,
      status: "completed",
    }),
    { parentCommitId: secondSteerCommitted.commitId },
  );
  emitProjectionEvent(options, activeTerminal);

  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  const firstParams = startTurnParamsAt(startTurn, 0);
  expect(firstParams).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: firstParams.clientUserMessageId,
    input: [textInput("Ordinary order C")],
  });
  expect(typeof firstParams.clientUserMessageId).toBe("string");

  const firstStarted = eventWithEnvelope(
    turnStarted(eventTurnStarted, "commit-reordered-ordinary-first-started", firstStartedTurn),
    { parentCommitId: activeTerminal.commitId },
  );
  emitProjectionEvent(options, firstStarted);
  const firstTerminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "commit-reordered-ordinary-first-terminal", {
      ...firstStartedTurn,
      status: "completed",
    }),
    { parentCommitId: firstStarted.commitId },
  );
  emitProjectionEvent(options, firstTerminal);

  await expect.poll(() => startTurn.mock.calls.length).toBe(2);
  const secondParams = startTurnParamsAt(startTurn, 1);
  expect(secondParams).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: secondParams.clientUserMessageId,
    input: [textInput("Ordinary order A")],
  });
  expect(typeof secondParams.clientUserMessageId).toBe("string");
  expect(secondParams.clientUserMessageId).not.toBe(firstParams.clientUserMessageId);

  const secondStarted = eventWithEnvelope(
    turnStarted(eventTurnStarted, "commit-reordered-ordinary-second-started", secondStartedTurn),
    { parentCommitId: firstTerminal.commitId },
  );
  emitProjectionEvent(options, secondStarted);
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "commit-reordered-ordinary-second-terminal", {
        ...secondStartedTurn,
        status: "completed",
      }),
      { parentCommitId: secondStarted.commitId },
    ),
  );

  await expect.poll(() => startTurn.mock.calls.length).toBe(3);
  const thirdParams = startTurnParamsAt(startTurn, 2);
  expect(thirdParams).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: thirdParams.clientUserMessageId,
    input: [textInput("Ordinary order B")],
  });
  expect(typeof thirdParams.clientUserMessageId).toBe("string");
  expect(new Set(startTurn.mock.calls.map(([params]) => params.clientUserMessageId)).size).toBe(3);
  expect(steerTurn).toHaveBeenCalledTimes(2);
});

test("App keeps a middle ordinary edit in place after deleting its predecessor", async () => {
  const firstStartedTurn = inProgressTurn("turn-managed-ordinary-first");
  const secondStartedTurn = inProgressTurn("turn-managed-ordinary-second");
  const startTurn = vi
    .fn<GuiHostCommands["startTurn"]>()
    .mockResolvedValueOnce({ turn: firstStartedTurn })
    .mockResolvedValueOnce({ turn: secondStartedTurn });
  const { activeTurn, options, queueCoordinator, screen } = await renderActiveApp({ startTurn });
  const composer = getAppComposer(screen);
  const transcript = screen.getByRole("region", { name: "Committed transcript" });

  await composer.fill("Ordinary predecessor to delete");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Ordinary middle to edit");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Ordinary successor stays last");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 3", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  const editableItem = dialog.getByRole("group", {
    name: "Ordinary middle to edit",
    exact: true,
  });

  const edit = editableItem.getByRole("button", { name: "Edit", exact: true });
  await expect.element(dialog).toBeVisible();
  await expect.element(edit).toBeEnabled();
  await edit.click();
  const pendingEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await pendingEditor.fill("Edited ordinary remains before successor");
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  const listDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(listDialog.getByText("Edited ordinary remains before successor", { exact: true }))
    .toBeVisible();

  const predecessor = listDialog.getByRole("group", {
    name: "Ordinary predecessor to delete",
    exact: true,
  });
  await predecessor.getByRole("button", { name: "Delete", exact: true }).click();
  await predecessor.getByRole("button", { name: "Delete", exact: true }).click();

  expect(startTurn).not.toHaveBeenCalled();
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(2);
  expect(readPendingTextPreviews(queueCoordinator, "ordinary")).toEqual([
    "Edited ordinary remains before successor",
    "Ordinary successor stays last",
  ]);
  await expect
    .element(transcript.getByText("Edited ordinary remains before successor", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(transcript.getByText("Ordinary predecessor to delete", { exact: true }))
    .not.toBeInTheDocument();

  const terminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "commit-managed-ordinary-terminal", {
      ...activeTurn,
      status: "completed",
    }),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, terminal);

  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  const params = startTurnParamsAt(startTurn, 0);
  expect(params).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: params.clientUserMessageId,
    input: [textInput("Edited ordinary remains before successor")],
  });
  await expect
    .element(dialog.getByText("Ordinary successor stays last", { exact: true }))
    .toBeVisible();
  await expect
    .element(transcript.getByText("Edited ordinary remains before successor", { exact: true }))
    .not.toBeInTheDocument();

  const started = eventWithEnvelope(
    turnStarted(eventTurnStarted, "commit-managed-ordinary-started", firstStartedTurn),
    { parentCommitId: terminal.commitId },
  );
  const committedMessage = userMessage(
    "user-managed-ordinary",
    [textInput("Edited ordinary remains before successor")],
    params.clientUserMessageId,
  );
  const startedItem = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-managed-ordinary-item-started",
      firstStartedTurn.id,
      committedMessage,
    ),
    { parentCommitId: started.commitId },
  );
  emitProjectionEvent(options, started);
  emitProjectionEvent(options, startedItem);
  await expect
    .element(transcript.getByText("Edited ordinary remains before successor", { exact: true }))
    .not.toBeInTheDocument();

  const completedItem = eventWithEnvelope(
    itemCompleted(
      eventItemCompleted,
      "commit-managed-ordinary-item-completed",
      firstStartedTurn.id,
      committedMessage,
    ),
    { parentCommitId: startedItem.commitId },
  );
  emitProjectionEvent(options, completedItem);
  await expect
    .element(transcript.getByText("Edited ordinary remains before successor", { exact: true }))
    .toBeVisible();

  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "commit-managed-ordinary-first-completed", {
        ...firstStartedTurn,
        status: "completed",
      }),
      { parentCommitId: completedItem.commitId },
    ),
  );
  await expect.poll(() => startTurn.mock.calls.length).toBe(2);
  const successorParams = startTurnParamsAt(startTurn, 1);
  expect(successorParams).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: successorParams.clientUserMessageId,
    input: [textInput("Ordinary successor stays last")],
  });
  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .element(transcript.getByText("Ordinary predecessor to delete", { exact: true }))
    .not.toBeInTheDocument();
});

test("App defers ordinary management during recovery and sends the successor before the failed input", async () => {
  type StartResponse = Awaited<ReturnType<GuiHostCommands["startTurn"]>>;
  const failedStart = createDeferred<StartResponse>();
  const successorTurn = inProgressTurn("turn-managed-ordinary-successor");
  const secondSuccessorTurn = inProgressTurn("turn-managed-ordinary-second-successor");
  const retriedTurn = inProgressTurn("turn-managed-ordinary-retry");
  const startTurn = vi
    .fn<GuiHostCommands["startTurn"]>()
    .mockImplementationOnce(() => failedStart.promise)
    .mockResolvedValueOnce({ turn: successorTurn })
    .mockResolvedValueOnce({ turn: secondSuccessorTurn })
    .mockResolvedValueOnce({ turn: retriedTurn });
  const { activeTurn, options, queueCoordinator, screen } = await renderActiveApp({ startTurn });
  const composer = getAppComposer(screen);

  await composer.fill("Ordinary that will fail");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Ordinary successor under edit");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Second ordinary successor keeps recovery order");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Pending: Queued 3", exact: true }).click();
  const listDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await listDialog
    .getByRole("group", { name: "Ordinary successor under edit", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const pendingEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await pendingEditor.fill("Edited ordinary successor stays first");

  const terminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "commit-managed-ordinary-recovery-terminal", {
      ...activeTurn,
      status: "completed",
    }),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, terminal);
  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  expectStartTurnCalledOnceWithText(startTurn, "Ordinary that will fail");
  failedStart.reject(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("managed ordinary start rejected"),
    }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().recoveryCount).toBe(1);

  await screen.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .element(listDialog.getByRole("alert"))
    .toHaveTextContent("Refresh complete. Try the action again.");
  await expect.element(pendingEditor).not.toBeInTheDocument();
  expect(startTurn).toHaveBeenCalledOnce();
  expect(queueCoordinator.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 2,
    recoveryCount: 1,
    isRecovering: false,
  });
  const recoveryOrderBeforeMove = readPendingTextPreviews(queueCoordinator, "ordinary");
  expect(recoveryOrderBeforeMove).toEqual([
    "Ordinary successor under edit",
    "Second ordinary successor keeps recovery order",
  ]);
  const recoveryMoveTarget = readPendingItems(queueCoordinator, "ordinary").at(1);
  if (recoveryMoveTarget == null) {
    throw new Error("recovery scenario must expose the second ordinary successor");
  }
  const recoveryRevision = queueCoordinator.getSnapshot().detailRevision;
  expect(
    queueCoordinator.movePendingInput({
      key: recoveryMoveTarget.key,
      revision: recoveryRevision,
      destination: "first",
    }),
  ).toEqual({
    type: "unavailable",
    scope: "liveOwner",
    reason: "recoveryPending",
    revision: recoveryRevision,
  });
  expect(readPendingTextPreviews(queueCoordinator, "ordinary")).toEqual(recoveryOrderBeforeMove);
  await screen.getByRole("button", { name: "Close", exact: true }).click();
  await screen.getByRole("button", { name: "Continue sending", exact: true }).click();

  await expect.poll(() => startTurn.mock.calls.length).toBe(2);
  expect(startTurnParamsAt(startTurn, 1)).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: startTurnParamsAt(startTurn, 1).clientUserMessageId,
    input: [textInput("Ordinary successor under edit")],
  });
  expect(queueCoordinator.getSnapshot().isRecovering).toBe(false);

  const successorStarted = eventWithEnvelope(
    turnStarted(eventTurnStarted, "commit-managed-ordinary-successor-started", successorTurn),
    { parentCommitId: terminal.commitId },
  );
  emitProjectionEvent(options, successorStarted);
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "commit-managed-ordinary-successor-completed", {
        ...successorTurn,
        status: "completed",
      }),
      { parentCommitId: successorStarted.commitId },
    ),
  );

  await expect.poll(() => startTurn.mock.calls.length).toBe(3);
  expect(startTurnParamsAt(startTurn, 2)).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: startTurnParamsAt(startTurn, 2).clientUserMessageId,
    input: [textInput("Second ordinary successor keeps recovery order")],
  });

  const secondSuccessorStarted = eventWithEnvelope(
    turnStarted(
      eventTurnStarted,
      "commit-managed-ordinary-second-successor-started",
      secondSuccessorTurn,
    ),
    { parentCommitId: "commit-managed-ordinary-successor-completed" },
  );
  emitProjectionEvent(options, secondSuccessorStarted);
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "commit-managed-ordinary-second-successor-completed", {
        ...secondSuccessorTurn,
        status: "completed",
      }),
      { parentCommitId: secondSuccessorStarted.commitId },
    ),
  );

  await expect.poll(() => startTurn.mock.calls.length).toBe(4);
  expect(startTurnParamsAt(startTurn, 3)).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: startTurnParamsAt(startTurn, 3).clientUserMessageId,
    input: [textInput("Ordinary that will fail")],
  });
});
