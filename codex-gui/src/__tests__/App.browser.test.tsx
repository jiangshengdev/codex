import { beforeEach, expect, test, vi } from "vitest";
import App from "@/App";
import type {
  GuiHostStatus,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import {
  selectProjectionByThreadId,
  selectProjectionReattachByThreadId,
} from "@/features/projection/projectionSlice";
import { selectThreadIdentityState } from "@/features/threadIdentity/threadIdentitySlice";
import { renderWithProviders } from "@/utils/test-utils";
import type {
  ThreadProjectionAttachResponse,
  ThreadProjectionEventNotification,
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

test("App renders the GUI host status panel without opening a real WebSocket", async () => {
  const screen = await renderWithProviders(<App />);

  await expect.element(screen.getByRole("heading", { name: "GUI host" })).toBeVisible();
  await expect.element(screen.getByText("connecting")).toBeVisible();
  await expect.element(screen.getByText(/^no$/)).toBeVisible();
  await expect.element(screen.getByText(/^0$/)).toBeVisible();
  await expect.element(screen.getByText(/^none$/)).toBeVisible();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});

test("App reflects GUI host status callback updates", async () => {
  const screen = await renderWithProviders(<App />);

  emitStatus?.({
    label: "received event",
    eventCount: 2,
    lastEventType: "turnStarted",
  });

  await expect.element(screen.getByText("received event")).toBeVisible();
  await expect.element(screen.getByText(/^yes$/)).toBeVisible();
  await expect.element(screen.getByText(/^2$/)).toBeVisible();
  await expect.element(screen.getByText("turnStarted")).toBeVisible();
});

test("App dispatches GUI host projection payloads into Redux", async () => {
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

  const projection = selectProjectionByThreadId(store.getState(), threadId);
  expect(projection?.subscriptionId).toBe(attachResponse.subscriptionId);
  expect(projection?.headCommitId).toBe(projectionEvent.commitId);
  expect(projection?.thread.turns).toEqual([
    ...attachResponse.snapshot.thread.turns,
    projectionEvent.event.notification.turn,
  ]);
});

test("App records mismatched attach identity without advancing projection state", async () => {
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
  expect(selectProjectionByThreadId(store.getState(), launchThreadId)).toBeNull();
  expect(selectProjectionByThreadId(store.getState(), mismatchedThreadId)).toBeNull();
  expect(selectProjectionReattachByThreadId(store.getState(), launchThreadId)).toBeNull();
});

test("App closes the GUI host connection when unmounted", async () => {
  const screen = await renderWithProviders(<App />);

  await screen.unmount();

  expect(cleanupConnectionCallCount).toBe(1);
});
