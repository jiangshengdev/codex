import { vi } from "vitest";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
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

export const attachResponse: ThreadProjectionAttachResponse = attachBaseline;
export const launchThreadId = attachResponse.snapshot.thread.id;

let cleanupConnectionCallCount = 0;

export const createGuiHostCommands = (): GuiHostCommands => ({
  startTurn: vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: inProgressTurn("turn-started-from-app"),
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
  cleanupConnectionCallCount = 0;
  startGuiHostConnectionMock.mockReset();
  startGuiHostConnectionMock.mockImplementation((options) => {
    options.onLaunchParams?.({ threadId: launchThreadId, token: "secret" });
    return () => {
      cleanupConnectionCallCount += 1;
    };
  });
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
  options.onStatus?.({ label: "attached" });
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
