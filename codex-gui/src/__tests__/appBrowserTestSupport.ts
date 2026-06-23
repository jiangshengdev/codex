import { vi } from "vitest";
import type {
  GuiHostCommands,
  GuiHostStatus,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { ThreadProjectionAttachResponse } from "@codex-protocol/v2";

export type StartGuiHostConnectionMock = {
  mockImplementation: (
    implementation: (options: StartGuiHostConnectionOptions) => () => void,
  ) => void;
  mockReset: () => void;
  mock: {
    calls: [StartGuiHostConnectionOptions][];
  };
};

export const attachResponse = attachBaselineJson as ThreadProjectionAttachResponse;
export const launchThreadId = attachResponse.snapshot.thread.id;

let emitStatus: ((status: GuiHostStatus) => void) | undefined;
let cleanupConnectionCallCount = 0;

export const createGuiHostCommands = (): GuiHostCommands => ({
  startTurn: vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
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
  interruptTurn: vi.fn<GuiHostCommands["interruptTurn"]>().mockResolvedValue({}),
});

export const createCommands = createGuiHostCommands;

export const attachWithCommittedMessages = (): ThreadProjectionAttachResponse =>
  attachWithTurns(attachResponse, [
    baseTurn("turn-app-surface", [
      userMessage("user-app-surface", [textInput("Hello from App")]),
      agentMessage("agent-app-surface", "Committed App response"),
    ]),
  ]);

export const resetAppBrowserTestSupport = (
  startGuiHostConnectionMock: StartGuiHostConnectionMock,
): void => {
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
};

export const emitGuiHostStatus = (status: GuiHostStatus): void => {
  emitStatus?.(status);
};

export const getCleanupConnectionCallCount = (): number => cleanupConnectionCallCount;

export const getHostOptions = (
  startGuiHostConnectionMock: StartGuiHostConnectionMock,
): StartGuiHostConnectionOptions => {
  const options = startGuiHostConnectionMock.mock.calls[0]?.[0];
  if (options == null) {
    throw new Error("Expected GUI host connection to start");
  }

  return options;
};

export const attachProjection = (
  options: StartGuiHostConnectionOptions,
  response: ThreadProjectionAttachResponse = attachResponse,
): void => {
  options.onProjectionAttached?.(response);
};

export const markHostAttached = (options: StartGuiHostConnectionOptions): void => {
  options.onStatus?.({ label: "attached", eventCount: 0, lastEventType: null });
};

export const markCommandsReady = (
  options: StartGuiHostConnectionOptions,
  commands: GuiHostCommands = createGuiHostCommands(),
): GuiHostCommands => {
  options.onCommandsReady?.(commands);
  return commands;
};

export const emitProjectionEvent = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onProjectionEvent"]>>[0],
): void => {
  options.onProjectionEvent?.(notification);
};

export const emitProjectionClosed = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onProjectionClosed"]>>[0],
): void => {
  options.onProjectionClosed?.(notification);
};
