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
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
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
  baseTurn,
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

test("App edits only an unsent steer and preserves its place behind the issuing steer", async () => {
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const issuingSteer = createDeferred<SteerResponse>();
  const editedSteer = createDeferred<SteerResponse>();
  const steerTurn = vi
    .fn<GuiHostCommands["steerTurn"]>()
    .mockImplementationOnce(() => issuingSteer.promise)
    .mockImplementationOnce(() => editedSteer.promise);
  const { activeTurn, options, queueCoordinator, screen } = await renderActiveApp({ steerTurn });
  const composer = getAppComposer(screen);

  await composer.fill("Issuing steer is read only");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  await composer.fill("Unsent steer to edit");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);

  await screen.getByRole("button", { name: "Pending: Guide 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect
    .element(dialog.getByText("This message has entered the sending process.", { exact: true }))
    .toBeVisible();
  expect(dialog.getByRole("button", { name: "Edit", exact: true }).all().length).toBe(1);
  expect(dialog.getByRole("button", { name: "Delete", exact: true }).all().length).toBe(1);

  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  const pendingEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await expect.element(pendingEditor).toHaveTextContent("Unsent steer to edit");
  await pendingEditor.fill("Edited unsent steer in original slot");
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  expect(steerTurn).toHaveBeenCalledOnce();
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual([
    "Issuing steer is read only",
    "Edited unsent steer in original slot",
  ]);

  issuingSteer.resolve({ turnId: activeTurn.id });
  await expect.poll(() => steerTurn.mock.calls.length).toBe(2);
  const editedParams = steerTurnParamsAt(steerTurn, 1);
  expect(editedParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: editedParams.clientUserMessageId,
    input: [textInput("Edited unsent steer in original slot")],
  });
  const committedEditedSteer = userMessage(
    "user-edited-unsent-steer",
    [textInput("Edited unsent steer in original slot")],
    editedParams.clientUserMessageId,
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemStarted(
        eventItemStarted,
        "commit-edited-unsent-steer",
        activeTurn.id,
        committedEditedSteer,
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  await expect
    .poll(() => readPendingTextPreviews(queueCoordinator, "steer"))
    .toEqual(["Issuing steer is read only"]);
  editedSteer.resolve({ turnId: activeTurn.id });
});

test("App issues steer inputs in the authoritative suffix order selected through Pending details", async () => {
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const issuingSteer = createDeferred<SteerResponse>();
  const movedSteer = createDeferred<SteerResponse>();
  const remainingSteer = createDeferred<SteerResponse>();
  const steerTurn = vi
    .fn<GuiHostCommands["steerTurn"]>()
    .mockImplementationOnce(() => issuingSteer.promise)
    .mockImplementationOnce(() => movedSteer.promise)
    .mockImplementationOnce(() => remainingSteer.promise);
  const { activeTurn, commandHandle, queueCoordinator, screen, startTurn } = await renderActiveApp({
    steerTurn,
  });
  const composer = getAppComposer(screen);
  const transcript = screen.getByRole("region", { name: "Committed transcript" });

  for (const text of ["Ordinary lane A", "Ordinary lane B"]) {
    await composer.fill(text);
    await screen.getByRole("button", { name: "Send", exact: true }).click();
  }
  await composer.fill("Issuing steer remains fixed");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  const issuingParams = steerTurnParamsAt(steerTurn, 0);
  expect(issuingParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: issuingParams.clientUserMessageId,
    input: [textInput("Issuing steer remains fixed")],
  });
  expect(typeof issuingParams.clientUserMessageId).toBe("string");
  await composer.fill("Steer suffix A");
  dispatchGuideShortcut(composer.element());
  await composer.fill("Steer suffix B");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(3);

  await screen.getByRole("button", { name: "Pending: Guide 3, Queued 2", exact: true }).click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await dialog
    .getByRole("group", { name: "Steer suffix B", exact: true })
    .getByRole("button", {
      name: "More move options for pending message: Steer suffix B",
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
    .poll(() => readPendingTextPreviews(queueCoordinator, "steer"))
    .toEqual(["Issuing steer remains fixed", "Steer suffix B", "Steer suffix A"]);
  expect(readPendingTextPreviews(queueCoordinator, "ordinary")).toEqual([
    "Ordinary lane A",
    "Ordinary lane B",
  ]);
  expect(queueCoordinator.getReleaseReadiness()).toEqual(releaseReadinessBeforeMove);
  expect(readGuiHostCommandCallCounts(commandHandle)).toEqual(hostCallsBeforeMove);
  expect(steerTurn).toHaveBeenCalledOnce();
  expect(steerTurnParamsAt(steerTurn, 0)).toEqual(issuingParams);
  expect(startTurn).not.toHaveBeenCalled();
  for (const text of [
    "Ordinary lane A",
    "Ordinary lane B",
    "Issuing steer remains fixed",
    "Steer suffix A",
    "Steer suffix B",
  ]) {
    await expect.element(transcript.getByText(text, { exact: true })).not.toBeInTheDocument();
  }

  issuingSteer.resolve({ turnId: activeTurn.id });
  await expect.poll(() => steerTurn.mock.calls.length).toBe(2);
  const movedParams = steerTurnParamsAt(steerTurn, 1);
  expect(movedParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: movedParams.clientUserMessageId,
    input: [textInput("Steer suffix B")],
  });
  expect(typeof movedParams.clientUserMessageId).toBe("string");
  expect(movedParams.clientUserMessageId).not.toBe(issuingParams.clientUserMessageId);

  movedSteer.resolve({ turnId: activeTurn.id });
  await expect.poll(() => steerTurn.mock.calls.length).toBe(3);
  const remainingParams = steerTurnParamsAt(steerTurn, 2);
  expect(remainingParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: remainingParams.clientUserMessageId,
    input: [textInput("Steer suffix A")],
  });
  expect(typeof remainingParams.clientUserMessageId).toBe("string");
  expect(new Set(steerTurn.mock.calls.map(([params]) => params.clientUserMessageId)).size).toBe(3);
  expect(readPendingTextPreviews(queueCoordinator, "ordinary")).toEqual([
    "Ordinary lane A",
    "Ordinary lane B",
  ]);
  expect(startTurn).not.toHaveBeenCalled();
  remainingSteer.resolve({ turnId: activeTurn.id });
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

test("App defers steer management during recovery and retries the failed identity first", async () => {
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const failedSteer = createDeferred<SteerResponse>();
  const retriedSteer = createDeferred<SteerResponse>();
  const successorSteer = createDeferred<SteerResponse>();
  const steerTurn = vi
    .fn<GuiHostCommands["steerTurn"]>()
    .mockImplementationOnce(() => failedSteer.promise)
    .mockImplementationOnce(() => retriedSteer.promise)
    .mockImplementationOnce(() => successorSteer.promise);
  const { activeTurn, queueCoordinator, screen } = await renderActiveApp({ steerTurn });
  const composer = getAppComposer(screen);

  await composer.fill("Steer that will fail");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  const failedParams = steerTurnParamsAt(steerTurn, 0);
  await composer.fill("Steer successor under edit");
  dispatchGuideShortcut(composer.element());
  await screen.getByRole("button", { name: "Pending: Guide 2", exact: true }).click();
  const listDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await listDialog.getByRole("button", { name: "Edit", exact: true }).click();
  const pendingEditor = screen.getByRole("combobox", {
    name: "Edit pending message",
    exact: true,
  });
  await pendingEditor.fill("Edited steer successor stays behind retry");

  failedSteer.reject(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("managed steer rejected"),
    }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().recoveryCount).toBe(1);
  await screen.getByRole("button", { name: "Save", exact: true }).click();
  await expect
    .element(listDialog.getByRole("alert"))
    .toHaveTextContent("Refresh complete. Try the action again.");
  await expect.element(pendingEditor).not.toBeInTheDocument();
  expect(steerTurn).toHaveBeenCalledOnce();
  expect(queueCoordinator.getSnapshot()).toMatchObject({
    guidingCount: 1,
    recoveryCount: 1,
    isRecovering: false,
  });
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual([
    "Steer successor under edit",
  ]);
  await screen.getByRole("button", { name: "Close", exact: true }).click();
  await screen.getByRole("button", { name: "Continue sending", exact: true }).click();

  await expect.poll(() => steerTurn.mock.calls.length).toBe(2);
  expect(steerTurnParamsAt(steerTurn, 1)).toEqual(failedParams);
  retriedSteer.resolve({ turnId: activeTurn.id });
  await expect.poll(() => steerTurn.mock.calls.length).toBe(3);
  expect(steerTurnParamsAt(steerTurn, 2)).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: steerTurnParamsAt(steerTurn, 2).clientUserMessageId,
    input: [textInput("Steer successor under edit")],
  });
  successorSteer.resolve({ turnId: activeTurn.id });
});

test("App guides explicit input ahead of ordinary FIFO and commits accepted identities independently", async () => {
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const explicitSteer = createDeferred<SteerResponse>();
  const promotedSteer = createDeferred<SteerResponse>();
  const steerTurn = vi
    .fn<GuiHostCommands["steerTurn"]>()
    .mockImplementationOnce(() => explicitSteer.promise)
    .mockImplementationOnce(() => promotedSteer.promise);
  const { activeTurn, options, queueCoordinator, screen, startTurn } = await renderActiveApp({
    steerTurn,
  });
  const composer = getAppComposer(screen);

  await composer.fill("Ordinary A");
  await composer.click();
  await screen.user.keyboard("{Enter}");
  await composer.fill("Ordinary B");
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(2);

  await composer.fill("Explicit steer S");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  const explicitParams = steerTurnParamsAt(steerTurn, 0);
  expect(explicitParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: explicitParams.clientUserMessageId,
    input: [textInput("Explicit steer S")],
  });
  expect(typeof explicitParams.clientUserMessageId).toBe("string");
  expect(startTurn).not.toHaveBeenCalled();

  await expect.poll(() => composer.element().textContent.trim()).toBe("");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual([
    "Explicit steer S",
    "Ordinary A",
  ]);

  explicitSteer.resolve({ turnId: activeTurn.id });
  await expect.poll(() => steerTurn.mock.calls.length).toBe(2);
  const promotedParams = steerTurnParamsAt(steerTurn, 1);
  expect(promotedParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: promotedParams.clientUserMessageId,
    input: [textInput("Ordinary A")],
  });
  expect(typeof promotedParams.clientUserMessageId).toBe("string");
  expect(promotedParams.clientUserMessageId).not.toBe(explicitParams.clientUserMessageId);
  promotedSteer.resolve({ turnId: activeTurn.id });
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);

  const committedPromoted = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-promoted-steer",
      activeTurn.id,
      userMessage(
        "user-promoted-steer",
        [textInput("Ordinary A")],
        promotedParams.clientUserMessageId,
      ),
    ),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, committedPromoted);
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(1);
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual(["Explicit steer S"]);
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);

  const committedExplicit = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-explicit-steer",
      activeTurn.id,
      userMessage(
        "user-explicit-steer",
        [textInput("Explicit steer S")],
        explicitParams.clientUserMessageId,
      ),
    ),
    { parentCommitId: committedPromoted.commitId },
  );
  emitProjectionEvent(options, committedExplicit);
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(0);
  expect(readPendingItems(queueCoordinator, "steer")).toEqual([]);
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
  expect(startTurn).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("button", { name: "Pending: Queued 1", exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Ordinary B", { exact: true })).not.toBeInTheDocument();
});

test("App batch rejects a non-steerable target and restores a failed merged start in order", async () => {
  type StartResponse = Awaited<ReturnType<GuiHostCommands["startTurn"]>>;
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const startRequest = createDeferred<StartResponse>();
  const steerRequest = createDeferred<SteerResponse>();
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>(() => startRequest.promise);
  const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>(() => steerRequest.promise);
  const { activeTurn, options, queueCoordinator, screen } = await renderActiveApp({
    startTurn,
    steerTurn,
  });
  const composer = getAppComposer(screen);

  await composer.fill("Ordinary after rejected steers");
  await composer.click();
  await screen.user.keyboard("{Enter}");
  await composer.fill("Rejected steer A");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  await composer.fill("Rejected steer B");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual([
    "Rejected steer A",
    "Rejected steer B",
  ]);

  steerRequest.reject(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("active turn is not steerable"),
      rpcError: {
        code: -32000,
        message: "active turn is not steerable",
        data: {
          message: "active turn is not steerable",
          codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
          additionalDetails: null,
        },
      },
    }),
  );
  await expect
    .poll(() => queueCoordinator.getSnapshot().rejectedSteers.map(({ preview }) => preview))
    .toEqual([
      { type: "text", text: "Rejected steer A", truncated: false },
      { type: "text", text: "Rejected steer B", truncated: false },
    ]);
  expect(steerTurn).toHaveBeenCalledOnce();
  expect(queueCoordinator.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 1,
    guidingCount: 0,
    recoveryCount: 0,
  });
  expect(readPendingItems(queueCoordinator, "steer")).toEqual([]);
  await expect
    .element(screen.getByRole("button", { name: "Pending: Queued 1", exact: true }))
    .toBeVisible();

  const terminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "commit-non-steerable-terminal", {
      ...activeTurn,
      status: "completed",
    }),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, terminal);
  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  const mergedParams = startTurnParamsAt(startTurn, 0);
  expect(mergedParams).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: mergedParams.clientUserMessageId,
    input: [textInput("Rejected steer A"), textInput("Rejected steer B")],
  });
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);

  startRequest.reject(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("synthetic merged start rejected"),
    }),
  );
  await expect
    .poll(() => ({
      ordinaryQueuedCount: queueCoordinator.getSnapshot().ordinaryQueuedCount,
      guidingCount: queueCoordinator.getSnapshot().guidingCount,
      rejectedPreviews: queueCoordinator.getSnapshot().rejectedSteers.map(({ preview }) => preview),
    }))
    .toEqual({
      ordinaryQueuedCount: 1,
      guidingCount: 0,
      rejectedPreviews: [
        { type: "text", text: "Rejected steer A", truncated: false },
        { type: "text", text: "Rejected steer B", truncated: false },
      ],
    });
  expect(startTurn).toHaveBeenCalledOnce();
  expect(steerTurn).toHaveBeenCalledOnce();
});

test.each(["response mismatch", "delivery unknown"] as const)(
  "App keeps a steer %s unknown without sending or retrying its successor",
  async (settlement) => {
    type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
    const steerRequest = createDeferred<SteerResponse>();
    const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>(() => steerRequest.promise);
    const { queueCoordinator, screen } = await renderActiveApp({ steerTurn });
    const composer = getAppComposer(screen);

    await composer.fill("Unknown steer first");
    dispatchGuideShortcut(composer.element());
    await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
    await composer.fill("Unknown steer successor");
    dispatchGuideShortcut(composer.element());
    await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);

    if (settlement === "response mismatch") {
      steerRequest.resolve({ turnId: "turn-response-mismatch" });
    } else {
      steerRequest.reject(
        new GuiHostCommandError({
          source: "missingResult",
          delivery: "deliveryUnknown",
          error: new Error("steer delivery is unknown"),
        }),
      );
    }
    await expect
      .poll(() => queueCoordinator.getSnapshot())
      .toMatchObject({
        guidingCount: 2,
        hasUnknownSteer: true,
      });
    expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual([
      "Unknown steer first",
      "Unknown steer successor",
    ]);
    expect(queueCoordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [
        { type: "steerQueued", count: 1 },
        { type: "pendingSteers", count: 1, hasUnknown: true },
      ],
    });
    await expect.element(screen.getByText("Guide status unknown", { exact: true })).toBeVisible();
    await steerRequest.promise.catch(() => undefined);
    await Promise.resolve();
    expect(steerTurn).toHaveBeenCalledOnce();
    expect(queueCoordinator.getSnapshot()).toMatchObject({
      guidingCount: 2,
      hasUnknownSteer: true,
    });
  },
);

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
  const { activeTurn, interruptTurn, options, queueCoordinator, screen } = await renderActiveApp({
    startTurn,
    steerTurn,
  });
  const composer = getAppComposer(screen);

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
  const { activeTurn, interruptTurn, options, queueCoordinator, screen } = await renderActiveApp({
    startTurn,
    steerTurn,
  });
  const composer = getAppComposer(screen);

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
