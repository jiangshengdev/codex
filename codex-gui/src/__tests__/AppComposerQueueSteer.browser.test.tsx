import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  attachResponse,
  createDeferred,
  emitProjectionEvent,
  launchThreadId,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import {
  dispatchGuideShortcut,
  readAllPendingItems,
  readGuiHostCommandCallCounts,
  readPendingTextPreviews,
  renderActiveComposerQueueApp,
  startTurnParamsAt,
  steerTurnParamsAt,
} from "./appComposerQueueBrowserTestSupport";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  eventItemStarted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  eventWithEnvelope,
  itemStarted,
  textInput,
  turnCompleted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

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

test("App edits only an unsent steer and preserves its place behind the issuing steer", async () => {
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const issuingSteer = createDeferred<SteerResponse>();
  const editedSteer = createDeferred<SteerResponse>();
  const steerTurn = vi
    .fn<GuiHostCommands["steerTurn"]>()
    .mockImplementationOnce(() => issuingSteer.promise)
    .mockImplementationOnce(() => editedSteer.promise);
  const { activeTurn, composer, options, queueCoordinator, screen } =
    await renderActiveComposerQueueApp(startGuiHostConnectionMock, { steerTurn });

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
  const { activeTurn, commandHandle, composer, queueCoordinator, screen, startTurn } =
    await renderActiveComposerQueueApp(startGuiHostConnectionMock, { steerTurn });
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
    compactThread: 0,
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
  const { activeTurn, composer, queueCoordinator, screen } = await renderActiveComposerQueueApp(
    startGuiHostConnectionMock,
    { steerTurn },
  );

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
  const { activeTurn, composer, options, queueCoordinator, screen, startTurn } =
    await renderActiveComposerQueueApp(startGuiHostConnectionMock, { steerTurn });

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
  expect(readAllPendingItems(queueCoordinator, "steer")).toEqual([]);
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
  const { activeTurn, composer, options, queueCoordinator, screen } =
    await renderActiveComposerQueueApp(startGuiHostConnectionMock, { startTurn, steerTurn });

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
  expect(readAllPendingItems(queueCoordinator, "steer")).toEqual([]);
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
    const { composer, queueCoordinator, screen } = await renderActiveComposerQueueApp(
      startGuiHostConnectionMock,
      { steerTurn },
    );

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
