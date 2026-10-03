import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import type { TaskNotificationTarget } from "@/features/taskNotifications/taskNotificationProtocol";
import {
  attachResponse,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  launchThreadId,
  resetAppBrowserTestSupport,
  queueAttachProjectionResponse,
  emitProjectionEvent,
  markCommandsUnavailable,
  createDeferred,
} from "./appBrowserTestSupport";
import {
  eventItemCompleted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  asyncQuestionMessage,
  attachWithTurns,
  attachWithThreadName,
  attachWithThreadId,
  baseTurn,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  agentMessage,
  turnCompleted,
  turnStarted,
  failedTurn,
  interruptedTurn,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";

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

async function readyTask(items: Parameters<typeof baseTurn>[1] = []) {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  const options = getHostOptions(hostMock.startGuiHostConnection);
  const turn = inProgressTurn("notification-turn", items);
  queueAttachProjectionResponse(
    commands,
    attachWithThreadName(attachWithTurns(attachResponse, [turn]), ""),
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

test("notifies a completed task while away and opens its task without changing execution", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, router, commands, turn } = await readyTask();
  await router.navigate({ to: "/history" });
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(
        eventTurnCompleted,
        "completion",
        baseTurn(turn.id, [agentMessage("result", "Finished successfully")]),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  expect(BrowserNotification.sent[0]?.title).toBe(launchThreadId);
  expect(BrowserNotification.sent[0]?.options.body).toBe("Finished successfully");
  documentFocused = true;
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
  await screen.getByRole("button", { name: "Close", exact: true }).click();
  await clickNotification();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${launchThreadId}`);
  expect(commands.startTurn).not.toHaveBeenCalled();
});

test.each(
  [
    { place: "current", focused: true, visible: true, notified: false, marked: false },
    { place: "history", focused: true, visible: true, notified: false, marked: true },
    { place: "other", focused: true, visible: true, notified: false, marked: true },
    { place: "current", focused: false, visible: true, notified: true, marked: true },
    { place: "current", focused: true, visible: false, notified: true, marked: true },
  ].flatMap((place) => [false, true].map((failed) => ({ ...place, failed }))),
)(
  "completion matrix $place focused=$focused visible=$visible failed=$failed",
  async ({ place, focused, visible, notified, marked, failed }) => {
    BrowserNotification.permission = "granted";
    const { screen, options, router, turn, commands } = await readyTask();
    if (place === "other") {
      const otherId = "00000000-0000-0000-0000-000000000002";
      queueAttachProjectionResponse(
        commands,
        attachWithThreadId(attachWithTurns(attachResponse, []), otherId),
      );
      await router.navigate({ to: "/task/$threadId", params: { threadId: otherId } });
    }
    await expect
      .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
      .toHaveAttribute("contenteditable", "true");
    if (place === "history") await router.navigate({ to: "/history" });
    documentFocused = focused;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue(visible ? "visible" : "hidden");
    const result = failed
      ? failedTurn(turn.id, {
          message: "Provider rejected request",
          codexErrorInfo: null,
          additionalDetails: null,
          misalignment: null,
        })
      : baseTurn(turn.id);
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnCompleted(eventTurnCompleted, "matrix-completed", result), {
        parentCommitId: attachResponse.snapshot.headCommitId,
      }),
    );
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    const marker = screen.getByText("Execution finished", { exact: true });
    await expect.poll(() => marker.query()?.checkVisibility() ?? null).toBe(marked ? true : null);
    await expect
      .poll(() => BrowserNotification.sent.map((entry) => entry.options.body))
      .toEqual(
        notified
          ? [failed ? "Execution failed: Provider rejected request" : "Execution finished"]
          : [],
      );
  },
);

test.each([
  { text: " \n First\t second \n", expected: "First second" },
  { text: "🧑‍💻".repeat(201), expected: "🧑‍💻".repeat(200) },
  { text: " \n ", expected: "Execution finished" },
])("previews the last final answer: $expected", async ({ text, expected }) => {
  BrowserNotification.permission = "granted";
  const { options, turn } = await readyTask();
  documentFocused = false;
  const items = [
    agentMessage("first", "Earlier result"),
    agentMessage("last", text),
    agentMessage("progress", "Still talking", "commentary"),
    asyncQuestionMessage("async-final", [
      { title: "A question is not the final result", options: null },
    ]),
  ];
  emitProjectionEvent(
    options,
    eventWithEnvelope(turnCompleted(eventTurnCompleted, "preview-end", baseTurn(turn.id, items)), {
      parentCommitId: attachResponse.snapshot.headCommitId,
    }),
  );
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  expect(BrowserNotification.sent[0]?.options.body).toBe(expected);
});

test.each(["default", "denied", "unavailable"] as const)(
  "keeps completion markers with %s notification permission",
  async (permission) => {
    BrowserNotification.permission = permission === "unavailable" ? "default" : permission;
    if (permission === "unavailable") vi.stubGlobal("Notification", undefined);
    const { screen, options, router, turn } = await readyTask();
    await router.navigate({ to: "/history" });
    documentFocused = false;
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnCompleted(eventTurnCompleted, "no-permission-end", baseTurn(turn.id)), {
        parentCommitId: attachResponse.snapshot.headCommitId,
      }),
    );
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
    expect(BrowserNotification.sent).toHaveLength(0);
    expect(BrowserNotification.requestPermission).not.toHaveBeenCalled();
  },
);

test("suppresses goal continuation while preserving questions and notifies the final stopped turn once", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, router, turn, question } = await readyTask();
  await router.navigate({ to: "/history" });
  documentFocused = false;
  emitProjectionEvent(options, question());
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  const intermediate = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "goal-intermediate", baseTurn(turn.id), {
      type: "known",
      status: "active",
    }),
    { parentCommitId: "notification-question" },
  );
  emitProjectionEvent(options, intermediate);
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.element(screen.getByText("Waiting for response", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("Execution finished", { exact: true }))
    .not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(1);
  const next = inProgressTurn("goal-final");
  emitProjectionEvent(
    options,
    eventWithEnvelope(turnStarted(eventTurnStarted, "goal-next-start", next), {
      parentCommitId: intermediate.commitId,
    }),
  );
  const terminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "goal-final-end", baseTurn(next.id), {
      type: "known",
      status: "complete",
    }),
    { parentCommitId: "goal-next-start" },
  );
  emitProjectionEvent(options, terminal);
  await expect.poll(() => BrowserNotification.sent.length).toBe(2);
  await expect.element(screen.getByText("Execution finished", { exact: true })).toBeVisible();
  emitProjectionEvent(options, terminal);
  emitProjectionEvent(
    options,
    eventWithEnvelope(terminal, { commitId: "goal-duplicate", parentCommitId: terminal.commitId }),
  );
  expect(BrowserNotification.sent).toHaveLength(2);
});

test.each(["accepted", "rejected", "unknown"] as const)(
  "holds completion through the queued request until its %s outcome",
  async (outcome) => {
    BrowserNotification.permission = "granted";
    const { screen, options, router, turn, commands } = await readyTask();
    const pending = createDeferred<Awaited<ReturnType<typeof commands.startTurn>>>();
    vi.mocked(commands.startTurn).mockImplementationOnce(() => pending.promise);
    await screen
      .getByRole("combobox", { name: "Message Codex", exact: true })
      .fill("Continue with queued work");
    await screen.getByRole("button", { name: "Send", exact: true }).click();
    await router.navigate({ to: "/history" });
    documentFocused = false;
    emitProjectionEvent(
      options,
      eventWithEnvelope(turnCompleted(eventTurnCompleted, "queue-first-end", baseTurn(turn.id)), {
        parentCommitId: attachResponse.snapshot.headCommitId,
      }),
    );
    await expect.poll(() => vi.mocked(commands.startTurn).mock.calls.length).toBe(1);
    expect(BrowserNotification.sent).toHaveLength(0);
    if (outcome !== "accepted") {
      pending.reject(
        new GuiHostCommandError({
          source: "rpc",
          delivery: outcome === "rejected" ? "definitelyNotAccepted" : "deliveryUnknown",
          error: new Error("Cannot send queued input"),
        }),
      );
    } else {
      const next = inProgressTurn("queued-successor");
      emitProjectionEvent(
        options,
        eventWithEnvelope(turnStarted(eventTurnStarted, "queue-next-start", next), {
          parentCommitId: "queue-first-end",
        }),
      );
      emitProjectionEvent(
        options,
        eventWithEnvelope(
          turnCompleted(
            eventTurnCompleted,
            "queue-next-end",
            baseTurn(next.id, [agentMessage("queued-result", "Queued work finished")]),
          ),
          {
            parentCommitId: "queue-next-start",
          },
        ),
      );
    }
    expect(BrowserNotification.sent).toHaveLength(0);
    if (outcome === "accepted") pending.resolve({ turn: inProgressTurn("queued-successor") });
    await expect.poll(() => BrowserNotification.sent.length).toBe(outcome === "unknown" ? 0 : 1);
    expect(BrowserNotification.sent.map((entry) => entry.options.body)).toEqual(
      outcome === "unknown"
        ? []
        : [outcome === "accepted" ? "Queued work finished" : "Execution finished"],
    );
    await screen.getByRole("button", { name: "Menu", exact: true }).click();
    await expect
      .poll(
        () =>
          screen.getByText("Execution finished", { exact: true }).query()?.checkVisibility() ??
          null,
      )
      .toBe(outcome === "unknown" ? null : true);
  },
);

test("does not notify a locally stopped turn", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, router, turn, commands } = await readyTask();
  await screen.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => vi.mocked(commands.interruptTurn).mock.calls.length).toBe(1);
  await router.navigate({ to: "/history" });
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(turnCompleted(eventTurnCompleted, "stopped", interruptedTurn(turn.id)), {
      parentCommitId: attachResponse.snapshot.headCommitId,
    }),
  );
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Execution finished", { exact: true }))
    .not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(0);
});

test("preserves the live final answer when the terminal summary has no items", async () => {
  BrowserNotification.permission = "granted";
  const { options, turn } = await readyTask();
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "final-item",
        turn.id,
        agentMessage("final", "Actual final result"),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "summary-end", {
        ...baseTurn(turn.id),
        itemsView: "notLoaded",
      }),
      { parentCommitId: "final-item" },
    ),
  );
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  expect(BrowserNotification.sent[0]?.options.body).toBe("Actual final result");
});

test("does not guess completion when the authoritative goal read is unavailable", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, turn, router } = await readyTask();
  await router.navigate({ to: "/history" });
  documentFocused = false;
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "unknown-goal", baseTurn(turn.id), { type: "unavailable" }),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(screen.getByText("Execution finished", { exact: true }))
    .not.toBeInTheDocument();
  expect(BrowserNotification.sent).toHaveLength(0);
});

test("does not replay completion on a reconnected snapshot or old connection callback", async () => {
  BrowserNotification.permission = "granted";
  const { screen, options, turn } = await readyTask();
  documentFocused = false;
  const terminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "before-reconnect", baseTurn(turn.id)),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, terminal);
  await expect.poll(() => BrowserNotification.sent.length).toBe(1);
  markCommandsUnavailable(options);
  options.onStatus?.({ label: "closed" });
  await screen.getByRole("button", { name: "Reconnect", exact: true }).click();
  const recovered = createGuiHostCommands({ loadedThreadIds: [launchThreadId] });
  queueAttachProjectionResponse(recovered, attachWithTurns(attachResponse, [baseTurn(turn.id)]));
  const recoveredOptions = getHostOptions(hostMock.startGuiHostConnection);
  initializeHost(recoveredOptions, recovered);
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toHaveAttribute("contenteditable", "true");
  emitProjectionEvent(
    options,
    eventWithEnvelope(terminal, { commitId: "old-callback", parentCommitId: terminal.commitId }),
  );
  emitProjectionEvent(recoveredOptions, terminal);
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  expect(BrowserNotification.sent).toHaveLength(1);
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
