import { vi } from "vitest";
import type {
  GuiHostCommands,
  GuiHostStatus,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import attachBaselineJson from "@/features/projection/__fixtures__/attach-baseline.json";
import type {
  ThreadItem,
  ThreadProjectionAttachResponse,
  Turn,
  UserInput,
} from "@codex-protocol/v2";

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

export const createCommands = (): GuiHostCommands => ({
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

export const attachWithCommittedMessages = (): ThreadProjectionAttachResponse => {
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
