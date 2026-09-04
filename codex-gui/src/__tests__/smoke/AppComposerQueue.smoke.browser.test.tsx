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
} from "../appBrowserTestSupport";
import { readPendingTextPreviews, startTurnParamsAt } from "../appComposerQueueBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "../appBrowserRenderHarness";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
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
import {
  selectTranscriptEntry,
  transcriptEntryIdFor,
} from "@/features/transcriptState/transcriptStateSlice";
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

const renderActiveApp = async () => {
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: inProgressTurn("turn-started-from-app"),
  });
  const commandHandle: GuiHostCommands = {
    ...createGuiHostCommands(),
    startTurn,
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
    options,
    queueCoordinator: coordinatorResult.value,
    screen,
    startTurn,
  };
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

test("App sends ordinary Enter through start identity and renders only its live commit", async () => {
  const text = "Ordinary Enter through App";
  const startedTurn = inProgressTurn("turn-enter-from-app");
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: startedTurn,
  });
  const commandHandle: GuiHostCommands = { ...createGuiHostCommands(), startTurn };
  const { options, screen } = await renderReadyApp(commandHandle);
  const composer = getAppComposer(screen);

  await composer.fill(text);
  await composer.click();
  await screen.user.keyboard("{Enter}");

  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  const params = startTurnParamsAt(startTurn, 0);
  expect(typeof params.clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
    clientUserMessageId: params.clientUserMessageId,
    input: [textInput(text)],
  });
  await expect.poll(() => composer.element().textContent.trim()).toBe("");
  await expect.element(screen.getByText(text, { exact: true })).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();

  const started = eventWithEnvelope(
    turnStarted(eventTurnStarted, "commit-enter-turn-started", startedTurn),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  const committedUserMessage = userMessage(
    "user-enter-from-app",
    [textInput(text)],
    params.clientUserMessageId,
  );
  const startedItem = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-enter-user-message-started",
      startedTurn.id,
      committedUserMessage,
    ),
    { parentCommitId: started.commitId },
  );
  emitProjectionEvent(options, started);
  emitProjectionEvent(options, startedItem);
  expect(
    selectTranscriptEntry(
      screen.store.getState(),
      transcriptEntryIdFor(startedTurn.id, committedUserMessage.id),
    ),
  ).toBeNull();
  await expect.element(screen.getByText(text, { exact: true })).not.toBeInTheDocument();

  const completedItem = eventWithEnvelope(
    itemCompleted(
      eventItemCompleted,
      "commit-enter-user-message-completed",
      startedTurn.id,
      committedUserMessage,
    ),
    { parentCommitId: startedItem.commitId },
  );
  emitProjectionEvent(options, completedItem);

  await expect.element(screen.getByText(text, { exact: true })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
});

test("App queues during an active turn and starts exactly once after its live terminal event", async () => {
  const { activeTurn, options, queueCoordinator, screen, startTurn } = await renderActiveApp();
  const transcript = screen.getByRole("region", { name: "Committed transcript" });

  await getAppComposer(screen).fill("Queued from active turn");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  const trigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await expect.element(trigger).toBeVisible();
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
  expect(readPendingTextPreviews(queueCoordinator, "ordinary")).toEqual([
    "Queued from active turn",
  ]);
  await expect
    .element(transcript.getByText("Queued from active turn", { exact: true }))
    .not.toBeInTheDocument();
  expect(startTurn).not.toHaveBeenCalled();

  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(dialog.getByText("Queued from active turn", { exact: true })).toBeVisible();

  const completed = turnCompleted(eventTurnCompleted, "commit-active-terminal", {
    ...activeTurn,
    status: "completed",
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(completed, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );

  expectStartTurnCalledOnceWithText(startTurn, "Queued from active turn");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).not.toBeInTheDocument();
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(0);
  await expect
    .element(transcript.getByText("Queued from active turn", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
