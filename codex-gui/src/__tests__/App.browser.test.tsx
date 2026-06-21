import { beforeEach, expect, test, vi } from "vitest";
import App from "@/App";
import type {
  GuiHostCommands,
  GuiHostStatus,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import closedBackpressureJson from "@/features/projection/__fixtures__/closed-backpressure.json";
import eventItemStartedJson from "@/features/projection/__fixtures__/event-item-started.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  buildSnapshotReplayMaterials,
  selectSnapshotReplayMaterials,
} from "@/features/snapshotReplay/snapshotReplay";
import { selectThreadIdentityState } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  ThreadProjectionClosedNotification,
  ThreadProjectionEventNotification,
  Turn,
  UserInput,
} from "@codex-protocol/v2";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

type StartGuiHostConnectionMock = {
  mockImplementation: (
    implementation: (options: StartGuiHostConnectionOptions) => () => void,
  ) => void;
  mockReset: () => void;
  mock: {
    calls: [StartGuiHostConnectionOptions][];
  };
};

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
const launchThreadId = attachResponse.snapshot.thread.id;

const textInput = (text: string): UserInput => ({
  type: "text",
  text,
  text_elements: [],
});

const userMessage = (id: string, content: UserInput[]): ThreadItem => ({
  type: "userMessage",
  id,
  clientId: null,
  content,
});

const agentMessage = (id: string, text: string): ThreadItem => ({
  type: "agentMessage",
  id,
  text,
  phase: "final_answer",
  memoryCitation: null,
});

const createCommands = (): GuiHostCommands => ({
  startTurn: vi.fn().mockResolvedValue({
    turn: {
      id: "turn-started-from-app",
      items: [],
      itemsView: "full",
      status: "inProgress",
      error: null,
      startedAt: 1700000100,
      completedAt: null,
      durationMs: null,
    },
  }),
  interruptTurn: vi.fn().mockResolvedValue({}),
});

const attachWithCommittedMessages = (): ThreadProjectionAttachResponse => {
  const turn: Turn = {
    id: "turn-app-surface",
    items: [
      userMessage("user-app-surface", [textInput("Hello from App")]),
      agentMessage("agent-app-surface", "Committed App response"),
    ],
    itemsView: "full",
    status: "completed",
    error: null,
    startedAt: 1700000001,
    completedAt: 1700000005,
    durationMs: 4000,
  };

  return {
    ...attachResponse,
    snapshot: {
      ...attachResponse.snapshot,
      thread: {
        ...attachResponse.snapshot.thread,
        turns: [turn],
      },
    },
  };
};

let emitStatus: ((status: GuiHostStatus) => void) | undefined;
let cleanupConnectionCallCount: number;

beforeEach(() => {
  emitStatus = undefined;
  cleanupConnectionCallCount = 0;
  startGuiHostConnectionMock.mockReset();
  startGuiHostConnectionMock.mockImplementation((options) => {
    options.onLaunchParams?.({ threadId: launchThreadId, token: "secret" });
    emitStatus = options.onStatus;
    return () => {
      cleanupConnectionCallCount += 1;
    };
  });
});

test("App renders the committed transcript shell without visible host debug details", async () => {
  const screen = await renderWithProviders(<App />);

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "connecting");
  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});

test("App renders composer in the shell without visible host debug details", async () => {
  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
});

test("App keeps host status as a test hook instead of visible shell content", async () => {
  const screen = await renderWithProviders(<App />);

  emitStatus?.({
    label: "received event",
    eventCount: 2,
    lastEventType: "turnStarted",
  });

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "received event");
});

test("App dispatches accepted host projection payloads into thread runtime", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
  const threadId = attachResponse.snapshot.thread.id;
  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionEvent?.(projectionEvent);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId: threadId,
    attachedThreadId: threadId,
    attachStatus: "attached",
  });

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.threadId).toBe(threadId);
  expect(runtime?.sessionId).toBe(attachResponse.snapshot.thread.sessionId);
  expect(runtime?.snapshotTurns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(runtime?.activeTurnId).toBe(projectionEvent.event.notification.turn.id);
  expect(runtime?.eventBuffer).toStrictEqual([
    { type: "projectionEvent", notification: projectionEvent },
  ]);
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "active",
  });
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(
    buildSnapshotReplayMaterials(runtime),
  );
});

test("App passes ready commands to composer and sends plain text", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Hello from App composer");
  await screen.getByRole("button", { name: "Send" }).click();

  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId: launchThreadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "Hello from App composer", text_elements: [] }],
  });
});

test("App enables Stop for the current active turn", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);
  options?.onProjectionEvent?.(projectionEvent);

  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  await screen.getByRole("button", { name: "Stop" }).click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledWith({
    threadId: launchThreadId,
    turnId: projectionEvent.event.notification.turn.id,
  });
});

test("App renders committed transcript messages from an attached projection", async () => {
  const screen = await renderWithProviders(<App />);

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachWithCommittedMessages());

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("Hello from App")).toBeVisible();
  await expect.element(screen.getByText("Committed App response")).toBeVisible();
});

test("App records mismatched attach identity without advancing runtime state", async () => {
  const { store } = await renderWithProviders(<App />);
  const mismatchedThreadId = "00000000-0000-0000-0000-000000000999";
  const mismatchedAttachResponse: ThreadProjectionAttachResponse = {
    ...attachResponse,
    snapshot: {
      ...attachResponse.snapshot,
      thread: {
        ...attachResponse.snapshot.thread,
        id: mismatchedThreadId,
      },
    },
  };

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(mismatchedAttachResponse);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId,
    attachedThreadId: mismatchedThreadId,
    attachStatus: "mismatch",
  });
  expect(selectThreadRuntimeRecord(store.getState())).toBeNull();
  expect(selectThreadRuntimeSubscription(store.getState())).toBeNull();
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual([]);
});

test("App stops forwarding runtime events after backpressure requires manual reconnect", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
  const projectionClosed = closedBackpressureJson as ThreadProjectionClosedNotification;

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionClosed?.(projectionClosed);
  options?.onProjectionEvent?.(projectionEvent);

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.threadId).toBe(launchThreadId);
  expect(runtime?.snapshotTurns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "manualReconnectRequired",
    reason: "backpressure",
    subscriptionId: attachResponse.subscriptionId,
  });
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
  expect(selectSnapshotReplayMaterials(store.getState())).toStrictEqual(
    buildSnapshotReplayMaterials(runtime),
  );
});

test("App disables composer after projection backpressure requires reconnect", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);
  const projectionClosed = closedBackpressureJson as ThreadProjectionClosedNotification;

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);
  options?.onProjectionClosed?.(projectionClosed);

  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
});

test("App disables composer when host commands become unavailable", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);

  await expect.element(screen.getByPlaceholder("Message Codex")).toBeEnabled();
  options?.onCommandsUnavailable?.();

  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
});

test("App records manual reconnect when a projection event breaks the baseline", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventItemStartedJson as ThreadProjectionEventNotification;

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionEvent?.(projectionEvent);

  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "manualReconnectRequired",
    reason: "commitChainMismatch",
    subscriptionId: attachResponse.subscriptionId,
  });
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
});

test("App closes the host connection when unmounted", async () => {
  const screen = await renderWithProviders(<App />);

  await screen.unmount();

  expect(cleanupConnectionCallCount).toBe(1);
});

test("App does not render optimistic user messages after send", async () => {
  const commandHandle = createCommands();
  const screen = await renderWithProviders(<App />);

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
  options?.onCommandsReady?.(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Not optimistic");
  await screen.getByRole("button", { name: "Send" }).click();

  await expect.element(screen.getByText("Not optimistic")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
