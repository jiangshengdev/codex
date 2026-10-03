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
} from "./appBrowserTestSupport";
import { eventItemCompleted } from "@/features/projection/__tests__/projectionFixtures";
import {
  asyncQuestionMessage,
  attachWithTurns,
  attachWithThreadName,
  attachWithThreadId,
  baseTurn,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
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
