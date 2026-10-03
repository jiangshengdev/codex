import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import type { ThreadGoal, Turn } from "@codex-protocol/v2";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { TaskNotificationTarget } from "@/features/taskNotifications/taskNotificationProtocol";
import {
  attachResponse,
  createDeferred,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  launchThreadId,
  resetAppBrowserTestSupport,
  queueAttachProjectionResponse,
  emitProjectionEvent,
  markCommandsUnavailable,
} from "./appBrowserTestSupport";
import {
  eventItemCompleted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  asyncQuestionMessage,
  attachWithTurns,
  attachWithGoal,
  attachWithThreadName,
  attachWithThreadId,
  baseTurn,
  failedTurn,
  interruptedTurn,
  goalUpdated,
  goalCleared,
  threadGoal,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  agentMessage,
  turnCompleted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";

const hostMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: hostMock.startGuiHostConnection,
}));

const BrowserNotification = {
  permission: "default" as NotificationPermission,
  requestPermission: vi.fn<() => Promise<NotificationPermission>>(() => {
    BrowserNotification.permission = "granted";
    return Promise.resolve("granted");
  }),
  sent: [] as { title: string; options: NotificationOptions }[],
};

let workerMessages: EventTarget;
const showNotification = vi.fn<(title: string, options: NotificationOptions) => Promise<void>>();
const register = vi.fn<() => Promise<object>>();
const getNotifications = vi.fn<() => Promise<Notification[]>>(() => Promise.resolve([]));

async function clickNotification() {
  const channel = new MessageChannel();
  const message = new MessageEvent("message", {
    data: {
      type: "codex-task-notification-click",
      target: BrowserNotification.sent[0]?.options.data as TaskNotificationTarget,
    },
    ports: [channel.port2],
  });
  Object.defineProperty(message, "source", {
    value: { scriptURL: new URL("/task-notifications.js", location.origin).href },
  });
  const accepted = new Promise((resolve) => {
    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };
  });
  workerMessages.dispatchEvent(message);
  expect(await accepted).toBe(true);
  channel.port1.close();
  channel.port2.close();
}

let documentFocused = true;
beforeEach(() => {
  resetAppBrowserTestSupport(hostMock.startGuiHostConnection);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  BrowserNotification.permission = "default";
  BrowserNotification.sent = [];
  BrowserNotification.requestPermission.mockClear();
  vi.stubGlobal("Notification", BrowserNotification);
  showNotification.mockReset().mockImplementation((title, options) => {
    BrowserNotification.sent.push({ title, options });
    return Promise.resolve();
  });
  getNotifications.mockClear();
  const registration = { active: {}, showNotification, getNotifications };
  register.mockReset().mockResolvedValue(registration);
  workerMessages = Object.assign(new EventTarget(), {
    register,
    ready: Promise.resolve(registration),
  });
  vi.spyOn(navigator, "serviceWorker", "get").mockReturnValue(
    workerMessages as ServiceWorkerContainer,
  );
  documentFocused = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => documentFocused);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("requests browser notification permission only after clicking its visible entrance", async () => {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  initializeHost(getHostOptions(hostMock.startGuiHostConnection), createGuiHostCommands());
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toBeVisible();
  expect(BrowserNotification.requestPermission).not.toHaveBeenCalled();
  const enable = screen.getByRole("button", { name: "Enable browser notifications", exact: true });
  await expect.element(enable).toBeVisible();
  await enable.click();
  expect(BrowserNotification.requestPermission).toHaveBeenCalledTimes(1);
  await expect.element(enable).not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(0);
});

test("notifies a question on another page and clears its marker only when viewing the task", async () => {
  BrowserNotification.permission = "granted";
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  const options = getHostOptions(hostMock.startGuiHostConnection);
  const turn = inProgressTurn("question-turn");
  queueAttachProjectionResponse(
    commands,
    attachWithThreadName(attachWithTurns(attachResponse, [turn]), "Deployment"),
  );
  initializeHost(options, commands);
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toBeVisible();
  await router.navigate({ to: "/history" });
  const event = eventWithEnvelope(
    itemCompleted(
      eventItemCompleted,
      "question-commit",
      turn.id,
      asyncQuestionMessage("question-message", [{ title: "Which environment?", options: null }]),
    ),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, event);
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  expect(BrowserNotification.sent[0]?.title).toBe("Deployment");
  expect(BrowserNotification.sent[0]?.options.body).toBe("Question: Which environment?");
  expect(router.state.location.pathname).toBe("/history");
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.element(screen.getByText("Waiting for response", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Close", exact: true }).click();
  emitProjectionEvent(options, event);
  emitProjectionEvent(
    options,
    eventWithEnvelope(event, { commitId: "duplicate-question", parentCommitId: event.commitId }),
  );
  expect(BrowserNotification.sent).toHaveLength(1);
  await clickNotification();
  await expect
    .element(screen.getByRole("group", { name: "Which environment?", exact: true }))
    .toBeVisible();
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Waiting for response", { exact: true }))
    .not.toBeInTheDocument();
  expect(commands.steerTurn).not.toHaveBeenCalled();
  expect(commands.startTurn).not.toHaveBeenCalled();
});

async function readyTask(
  items: Parameters<typeof baseTurn>[1] = [],
  setup: { goal?: ThreadGoal | null; completed?: boolean } = {},
) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  const options = getHostOptions(hostMock.startGuiHostConnection);
  const turn = setup.completed
    ? baseTurn("notification-turn", items)
    : inProgressTurn("notification-turn", items);
  queueAttachProjectionResponse(
    commands,
    attachWithGoal(
      attachWithThreadName(attachWithTurns(attachResponse, [turn]), ""),
      setup.goal ?? null,
    ),
  );
  initializeHost(options, commands);
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toHaveAttribute("contenteditable", "true");
  const question = (title = "Continue?", count = 1) =>
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "notification-question",
        turn.id,
        asyncQuestionMessage(
          "notification-item",
          Array.from({ length: count }, () => ({ title, options: null })),
        ),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    );
  return { screen, commands, options, router, turn, question };
}

test("notifies successful completion away from the GUI and navigates to its task", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, router, turn } = await readyTask();
  await router.navigate({ to: "/history" });
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "answer-completed",
        turn.id,
        agentMessage("answer", "  Work\n complete. "),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(
        eventTurnCompleted,
        "finished",
        baseTurn(turn.id, [agentMessage("answer", "  Work\n complete. ")]),
      ),
      { parentCommitId: "answer-completed" },
    ),
  );
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  expect(BrowserNotification.sent[0]?.options.body).toBe("Work complete.");
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Close", exact: true }).click();
  documentFocused = true;
  await clickNotification();
  await expect.element(screen.getByText("Work complete.", { exact: true })).toBeVisible();
});

test("does not notify or mark a question in the foreground task being viewed", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, question } = await readyTask();
  emitProjectionEvent(options, question());
  await expect.element(screen.getByRole("group", { name: "Continue?", exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Waiting for response", { exact: true }))
    .not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(0);
  expect(BrowserNotification.requestPermission).not.toHaveBeenCalled();
});

test.each(
  [
    { place: "history", focused: true, visible: true, browser: false, marker: true },
    { place: "other", focused: true, visible: true, browser: false, marker: true },
    { place: "current", focused: false, visible: true, browser: true, marker: true },
    { place: "current", focused: true, visible: false, browser: true, marker: true },
  ].flatMap((scenario) =>
    (["completed", "failed"] as const).map((status) => ({ ...scenario, status })),
  ),
)(
  "completion matrix: $status $place focused=$focused visible=$visible",
  async ({ place, focused, visible, browser, status }) => {
    BrowserNotification.permission = "granted";
    const { screen, options, router, commands, turn } = await readyTask();
    if (place === "other") {
      const secondId = "00000000-0000-0000-0000-000000000002";
      queueAttachProjectionResponse(
        commands,
        attachWithThreadId(attachWithTurns(attachResponse, []), secondId),
      );
      await router.navigate({ to: "/task/$threadId", params: { threadId: secondId } });
    }
    await expect
      .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
      .toHaveAttribute("contenteditable", "true");
    if (place === "history") await router.navigate({ to: "/history" });
    documentFocused = focused;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(visible ? "visible" : "hidden");
    const terminal =
      status === "completed"
        ? baseTurn(turn.id)
        : failedTurn(turn.id, {
            message: "Matrix failure",
            codexErrorInfo: null,
            additionalDetails: null,
            misalignment: null,
          });
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnCompleted(eventTurnCompleted, "matrix-finished", terminal), {
        parentCommitId: attachResponse.snapshot.headCommitId,
      }),
    );
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    const indicator = screen.getByText("Execution finished", { exact: true });
    await expect.element(indicator).toBeVisible();
    await expect.poll(() => BrowserNotification.sent.length).toBe(Number(browser));
  },
);

test.each(["completed", "failed"] as const)(
  "completion matrix: %s current focused=true visible=true",
  async (status) => {
    BrowserNotification.permission = "granted";
    const { screen, options, turn } = await readyTask();
    const terminal =
      status === "completed"
        ? baseTurn(turn.id)
        : failedTurn(turn.id, {
            message: "Matrix failure",
            codexErrorInfo: null,
            additionalDetails: null,
            misalignment: null,
          });
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnCompleted(eventTurnCompleted, "matrix-finished", terminal), {
        parentCommitId: attachResponse.snapshot.headCommitId,
      }),
    );
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect
      .element(screen.getByText("Execution finished", { exact: true }))
      .not.toBeInTheDocument();
    expect(BrowserNotification.sent).toHaveLength(0);
  },
);

test("completion handles failed separately", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, turn } = await readyTask();
  documentFocused = false;
  const terminal = failedTurn(turn.id, {
    message: "Network unavailable",
    codexErrorInfo: null,
    additionalDetails: null,
    misalignment: null,
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(turnCompleted(eventTurnCompleted, "terminal", terminal), {
      parentCommitId: attachResponse.snapshot.headCommitId,
    }),
  );
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  expect(BrowserNotification.sent[0]?.options.body).toBe("Execution failed: Network unavailable");
  await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
});

test("completion handles interrupted separately", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, turn } = await readyTask();
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(turnCompleted(eventTurnCompleted, "terminal", interruptedTurn(turn.id)), {
      parentCommitId: attachResponse.snapshot.headCommitId,
    }),
  );
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Execution finished", { exact: true }))
    .not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(0);
});

test.each([
  { text: "  Final\n\t answer   ", body: "Final answer" },
  { text: "🧑‍💻".repeat(201), body: "🧑‍💻".repeat(200) },
  { text: "  \n\t ", body: "Execution finished" },
])("completion previews the last final answer: $body", async ({ text, body }) => {
  BrowserNotification.permission = "granted";
  const { options, turn } = await readyTask();
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(
        eventTurnCompleted,
        "preview-finished",
        baseTurn(turn.id, [
          agentMessage("earlier", "Earlier final answer"),
          agentMessage("last-final", text),
          agentMessage("commentary", "Do not use commentary", "commentary"),
        ]),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  expect(BrowserNotification.sent[0]?.options.body).toBe(body);
  expect(BrowserNotification.sent[0]?.title).toBe(launchThreadId);
});

test("completion ignores duplicate terminal events and completed snapshot history", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, turn } = await readyTask([agentMessage("old", "Old answer")], {
    completed: true,
  });
  documentFocused = false;
  const historical = eventWithEnvelope(turnCompleted(eventTurnCompleted, "historical", turn), {
    parentCommitId: attachResponse.snapshot.headCommitId,
  });
  emitProjectionEvent(options, historical);
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Execution finished", { exact: true }))
    .not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(0);
  await screen.getByRole("button", { name: "Close", exact: true }).click();
  const next = inProgressTurn("new-live-turn");
  emitProjectionEvent(
    options,
    eventWithEnvelope(turnStarted(eventTurnStarted, "new-start", next), {
      parentCommitId: historical.commitId,
    }),
  );
  const completed = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "new-finished", baseTurn(next.id)),
    { parentCommitId: "new-start" },
  );
  emitProjectionEvent(options, completed);
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  emitProjectionEvent(options, completed);
  emitProjectionEvent(
    options,
    eventWithEnvelope(completed, {
      commitId: "terminal-repeated",
      parentCommitId: completed.commitId,
    }),
  );
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
  expect(BrowserNotification.sent).toHaveLength(1);
});

test.each(["updated", "cleared"] as const)(
  "active snapshot goal suppresses completion until goal is $0",
  async (change) => {
    BrowserNotification.permission = "granted";
    const { screen, options, turn, question } = await readyTask([], {
      goal: threadGoal(launchThreadId, "active"),
    });
    documentFocused = false;
    const asked = question();
    emitProjectionEvent(options, asked);
    await expect.poll(() => BrowserNotification.sent.length).toBe(1);
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnCompleted(eventTurnCompleted, "goal-intermediate", baseTurn(turn.id)), {
        parentCommitId: asked.commitId,
      }),
    );
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect.element(screen.getByText("Waiting for response", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText("Execution finished", { exact: true }))
      .not.toBeInTheDocument();
    expect(BrowserNotification.sent).toHaveLength(1);
    await screen.getByRole("button", { name: "Close", exact: true }).click();
    const changed =
      change === "updated"
        ? goalUpdated(eventTurnCompleted, "goal-changed", threadGoal(launchThreadId, "complete"))
        : goalCleared(eventTurnCompleted, "goal-changed");
    emitProjectionEvent(
      options,
      eventWithEnvelope(changed, { parentCommitId: "goal-intermediate" }),
    );
    const next = inProgressTurn("goal-last-turn");
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnStarted(eventTurnStarted, "goal-last-start", next), {
        parentCommitId: changed.commitId,
      }),
    );
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnCompleted(eventTurnCompleted, "goal-finished", baseTurn(next.id)), {
        parentCommitId: "goal-last-start",
      }),
    );
    await expect.poll(() => BrowserNotification.sent.length).toBe(2);
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect.element(screen.getByText("Waiting for response", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
  },
);

async function readyQueuedCompletion(addSuccessor: boolean) {
  BrowserNotification.permission = "granted";
  const { screen, options, commands, turn } = await readyTask();
  const request = createDeferred<{ turn: Turn }>();
  vi.mocked(commands.startTurn).mockImplementationOnce(() => request.promise);
  const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
  await composer.fill("Continue the work");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  // A successor remaining in the queue must not hide rejection behind an unsent claim.
  if (addSuccessor) {
    await composer.fill("Wait for recovery");
    await screen.getByRole("button", { name: "Send", exact: true }).click();
  }
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(
        eventTurnCompleted,
        "queue-first-finished",
        baseTurn(turn.id, [agentMessage("first-answer", "First finished")]),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  await expect.poll(() => vi.mocked(commands.startTurn).mock.calls.length).toBe(1);
  expect(BrowserNotification.sent).toHaveLength(0);
  return { screen, options, commands, request };
}

test("completion waits for queued start: unknown", async () => {
  const { screen, request } = await readyQueuedCompletion(false);
  request.reject(
    new GuiHostCommandError({
      source: "missingResult",
      delivery: "deliveryUnknown",
      error: new Error("Start response unavailable"),
    }),
  );
  await expect.element(screen.getByText("Sending result unknown", { exact: true })).toBeVisible();
  expect(BrowserNotification.sent).toHaveLength(0);
});

test("completion waits for queued start: rejected", async () => {
  const { screen, request, commands } = await readyQueuedCompletion(true);
  request.reject(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("Start response unavailable"),
    }),
  );
  await expect
    .element(screen.getByRole("button", { name: "Continue sending", exact: true }))
    .toBeVisible();
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  expect(BrowserNotification.sent[0]?.options.body).toBe("First finished");
  expect(commands.startTurn).toHaveBeenCalledOnce();
});

test.each(["accepted", "late acceptance"] as const)(
  "completion waits for queued start: %s",
  async (settlement) => {
    const { screen, options, request } = await readyQueuedCompletion(false);
    const next = inProgressTurn("queue-next-turn");
    if (settlement === "accepted") request.resolve({ turn: next });
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnStarted(eventTurnStarted, "queue-next-start", next), {
        parentCommitId: "queue-first-finished",
      }),
    );
    emitProjectionEvent(
      options,
      eventWithEnvelope(
        itemCompleted(
          eventItemCompleted,
          "queue-answer-completed",
          next.id,
          agentMessage("next-answer", "All finished"),
        ),
        { parentCommitId: "queue-next-start" },
      ),
    );
    emitProjectionEvent(
      options,
      eventWithEnvelope(
        turnCompleted(
          eventTurnCompleted,
          "queue-next-finished",
          baseTurn(next.id, [agentMessage("next-answer", "All finished")]),
        ),
        { parentCommitId: "queue-answer-completed" },
      ),
    );
    await expect.element(screen.getByText("All finished", { exact: true })).toBeVisible();
    await expect
      .poll(() => BrowserNotification.sent.length)
      .toBe(settlement === "late acceptance" ? 0 : 1);
    request.resolve({ turn: next });
    await expect.poll(() => BrowserNotification.sent.length).toBe(1);
    expect(BrowserNotification.sent[0]?.options.body).toBe("All finished");
  },
);

test("a live active goal update suppresses completion and clearing it does not replay the suppressed turn", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, turn } = await readyTask();
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      goalUpdated(eventTurnCompleted, "goal-activated", threadGoal(launchThreadId, "active")),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "active-goal-finished", baseTurn(turn.id)),
      { parentCommitId: "goal-activated" },
    ),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(goalCleared(eventTurnCompleted, "goal-removed"), {
      parentCommitId: "active-goal-finished",
    }),
  );
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Execution finished", { exact: true }))
    .not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(0);
});

test("delivers questions through persistent notifications without closing them on unmount", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, router, question } = await readyTask();
  await router.navigate({ to: "/history" });
  emitProjectionEvent(options, question());
  await expect.poll(() => showNotification.mock.calls.length).toBe(1);
  expect(BrowserNotification.sent).toHaveLength(1);
  expect(BrowserNotification.sent[0]?.options.data).toEqual({
    tabId: window.name,
    threadId: launchThreadId,
  });
  await screen.unmount();
  expect(getNotifications).not.toHaveBeenCalled();
  expect(showNotification).toHaveBeenCalledOnce();
});

test.each([
  { place: "current", focused: false, visible: true },
  { place: "current", focused: true, visible: false },
  { place: "other", focused: true, visible: true },
] as const)(
  "question matrix: $place focused=$focused visible=$visible",
  async ({ place, focused, visible }) => {
    BrowserNotification.permission = "granted";
    const { screen, commands, options, router, question } = await readyTask();
    if (place === "other") {
      const secondId = "00000000-0000-0000-0000-000000000002";
      queueAttachProjectionResponse(
        commands,
        attachWithThreadId(attachWithTurns(attachResponse, []), secondId),
      );
      await router.navigate({ to: "/task/$threadId", params: { threadId: secondId } });
    }
    await expect
      .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
      .toHaveAttribute("contenteditable", "true");
    documentFocused = focused;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(visible ? "visible" : "hidden");
    emitProjectionEvent(options, question());
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect.element(screen.getByText("Waiting for response", { exact: true })).toBeVisible();
    await expect.poll(() => BrowserNotification.sent.length).toBe(1);
    expect(BrowserNotification.requestPermission).not.toHaveBeenCalled();
  },
);

test.each([
  "default",
  "denied",
  "unavailable",
  "throws",
  "registration fails",
  "worker unavailable",
] as const)("retains question markers when notification permission is %s", async (permission) => {
  if (permission === "unavailable") vi.stubGlobal("Notification", undefined);
  else
    BrowserNotification.permission =
      permission === "default" || permission === "denied" ? permission : "granted";
  if (permission === "throws") {
    showNotification.mockRejectedValue(
      new Error("Platform does not support persistent notifications"),
    );
  }
  if (permission === "registration fails")
    register.mockRejectedValue(new Error("Registration unavailable"));
  if (permission === "worker unavailable")
    vi.spyOn(navigator, "serviceWorker", "get").mockReturnValue(
      undefined as unknown as ServiceWorkerContainer,
    );
  const { screen, options, router, question } = await readyTask();
  await router.navigate({ to: "/history" });
  emitProjectionEvent(options, question());
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.element(screen.getByText("Waiting for response", { exact: true })).toBeVisible();
  expect(BrowserNotification.requestPermission).not.toHaveBeenCalled();
  expect(BrowserNotification.sent).toHaveLength(0);
});

test.each([
  { title: "🧑‍💻".repeat(31), count: 1, body: "Question: " + "🧑‍💻".repeat(30) },
  { title: "Which environment?", count: 2, body: "2 questions need a response" },
])(
  "uses grapheme previews and multiple-question counts: $count",
  async ({ title, count, body }) => {
    BrowserNotification.permission = "granted";
    const { options, router, question } = await readyTask();
    await router.navigate({ to: "/history" });
    emitProjectionEvent(options, question(title, count));
    await expect.poll(() => BrowserNotification.sent.length).toBe(1);
    expect(BrowserNotification.sent[0]?.title).toBe(launchThreadId);
    expect(BrowserNotification.sent[0]?.options.body).toBe(body);
  },
);

test("does not notify snapshot questions or their replay", async () => {
  BrowserNotification.permission = "granted";
  const item = asyncQuestionMessage("notification-item", [{ title: "Continue?", options: null }]);
  const { options, router, question, screen } = await readyTask([item]);
  await router.navigate({ to: "/history" });
  emitProjectionEvent(options, question());
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Waiting for response", { exact: true }))
    .not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(0);
});

test("focus clears only the viewed task marker without answering its question", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, commands, question } = await readyTask();
  documentFocused = false;
  emitProjectionEvent(options, question());
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  documentFocused = true;
  window.dispatchEvent(new Event("focus"));
  await expect
    .element(screen.getByRole("group", { name: "Continue?", exact: true }).getByRole("textbox"))
    .toBeVisible();
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Waiting for response", { exact: true }))
    .not.toBeInTheDocument();
  expect(commands.steerTurn).not.toHaveBeenCalled();
});

test("does not replay notifications on reconnect and ignores old connection callbacks", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, question, turn } = await readyTask();
  documentFocused = false;
  emitProjectionEvent(options, question());
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  markCommandsUnavailable(options);
  options.onStatus?.({ label: "closed" });
  await screen.getByRole("button", { name: "Reconnect", exact: true }).click();
  const recovered = createGuiHostCommands({ loadedThreadIds: [launchThreadId] });
  queueAttachProjectionResponse(
    recovered,
    attachWithTurns(attachResponse, [
      baseTurn(turn.id, [
        asyncQuestionMessage("notification-item", [{ title: "Continue?", options: null }]),
      ]),
    ]),
  );
  initializeHost(getHostOptions(hostMock.startGuiHostConnection), recovered);
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toHaveAttribute("contenteditable", "true");
  emitProjectionEvent(
    options,
    eventWithEnvelope(question(), {
      commitId: "old-connection",
      parentCommitId: "notification-question",
    }),
  );
  expect(BrowserNotification.sent).toHaveLength(1);
  await screen.unmount();
  expect(getNotifications).not.toHaveBeenCalled();
});

test.each(["default", "denied", "unavailable"] as const)(
  "completion keeps its marker when browser permission is %s",
  async (permission) => {
    if (permission === "unavailable") vi.stubGlobal("Notification", undefined);
    else BrowserNotification.permission = permission;
    const { screen, options, turn } = await readyTask();
    documentFocused = false;
    emitProjectionEvent(
      options,
      eventWithEnvelope(
        turnCompleted(eventTurnCompleted, "no-permission-finished", baseTurn(turn.id)),
        { parentCommitId: attachResponse.snapshot.headCommitId },
      ),
    );
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
    expect(BrowserNotification.sent).toHaveLength(0);
    expect(BrowserNotification.requestPermission).not.toHaveBeenCalled();
  },
);

test("completion restores an Active goal on reconnect without replaying prior completion", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, turn } = await readyTask();
  documentFocused = false;
  const completed = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "before-disconnect", baseTurn(turn.id)),
    {
      parentCommitId: attachResponse.snapshot.headCommitId,
    },
  );
  emitProjectionEvent(options, completed);
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  markCommandsUnavailable(options);
  options.onStatus?.({ label: "closed" });
  await screen.getByRole("button", { name: "Reconnect", exact: true }).click();
  const recovered = createGuiHostCommands({ loadedThreadIds: [launchThreadId] });
  queueAttachProjectionResponse(
    recovered,
    attachWithGoal(
      attachWithTurns(attachResponse, [baseTurn(turn.id)]),
      threadGoal(launchThreadId, "active"),
    ),
  );
  const restoredOptions = getHostOptions(hostMock.startGuiHostConnection);
  initializeHost(restoredOptions, recovered);
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toHaveAttribute("contenteditable", "true");
  emitProjectionEvent(
    options,
    eventWithEnvelope(completed, { commitId: "old-callback", parentCommitId: completed.commitId }),
  );
  const next = inProgressTurn("restored-next");
  emitProjectionEvent(
    restoredOptions,
    eventWithEnvelope(turnStarted(eventTurnStarted, "restored-start", next), {
      parentCommitId: attachResponse.snapshot.headCommitId,
    }),
  );
  emitProjectionEvent(
    restoredOptions,
    eventWithEnvelope(turnCompleted(eventTurnCompleted, "restored-finished", baseTurn(next.id)), {
      parentCommitId: "restored-start",
    }),
  );
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
  expect(BrowserNotification.sent).toHaveLength(1);
});

test.each(["rejection", "synchronous exception"])(
  "permission %s leaves questions and task markers usable",
  async (failure) => {
    BrowserNotification.requestPermission.mockImplementationOnce(() => {
      if (failure === "synchronous exception") throw new Error("Permission unavailable");
      return Promise.reject(new Error("Permission unavailable"));
    });
    const { screen, options, router, question } = await readyTask();
    await screen.getByRole("button", { name: "Enable browser notifications", exact: true }).click();
    await expect
      .element(
        screen.getByText("Browser notifications are unavailable. Task markers remain enabled.", {
          exact: true,
        }),
      )
      .toBeVisible();
    await router.navigate({ to: "/history" });
    emitProjectionEvent(options, question());
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect.element(screen.getByText("Waiting for response", { exact: true })).toBeVisible();
    expect(BrowserNotification.requestPermission).toHaveBeenCalledOnce();
  },
);
