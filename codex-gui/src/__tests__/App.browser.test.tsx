import { beforeEach, expect, test, vi } from "vitest";
import App from "@/App";
import type {
  GuiHostStatus,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import eventTurnStartedJson from "@/features/projection/__fixtures__/event-turn-started.json";
import { selectProjectionByThreadId } from "@/features/projection/projectionSlice";
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

let emitStatus: ((status: GuiHostStatus) => void) | undefined;
let cleanupConnectionCallCount: number;

beforeEach(() => {
  emitStatus = undefined;
  cleanupConnectionCallCount = 0;
  startGuiHostConnectionMock.mockReset();
  startGuiHostConnectionMock.mockImplementation((options) => {
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
  const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
  const projectionEvent = eventTurnStartedJson as ThreadProjectionEventNotification;
  const threadId = attachResponse.snapshot.thread.id;
  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  options?.onProjectionAttached?.(attachResponse);
  options?.onProjectionEvent?.(projectionEvent);

  const projection = selectProjectionByThreadId(store.getState(), threadId);
  expect(projection?.subscriptionId).toBe(attachResponse.subscriptionId);
  expect(projection?.headCommitId).toBe(projectionEvent.commitId);
  expect(projection?.thread.turns).toEqual([
    ...attachResponse.snapshot.thread.turns,
    projectionEvent.event.notification.turn,
  ]);
});

test("App closes the GUI host connection when unmounted", async () => {
  const screen = await renderWithProviders(<App />);

  await screen.unmount();

  expect(cleanupConnectionCallCount).toBe(1);
});
