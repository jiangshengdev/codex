import { vi } from "vitest";
import { TOKEN_FRAGMENT_KEY } from "@codex-gui-host-contract";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type {
  GuiHostCommands,
  GuiHostStatus,
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
import type {
  SkillMetadata,
  SkillsListResponse,
  ThreadProjectionAttachResponse,
} from "@codex-protocol/v2";

export { createDeferred, type Deferred } from "./testDeferred";

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

const testSupportResetErrorMessage = "Test support reset discarded projection attach";

let cleanupConnectionCallCount = 0;
let resetGeneration = 0;

type AttachProjectionParams = Parameters<GuiHostCommands["attachThreadProjection"]>[0];
type AttachProjectionResponse = Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>;

export type DeferredAttachProjection = Readonly<{
  getRequestThreadId: () => string | null;
  getState: () => "queued" | "pending" | "settled" | "discarded";
  resolve: (response?: AttachProjectionResponse) => void;
  reject: (error: unknown) => void;
}>;

export type BrowserAuthorizationSessionSeed = Readonly<{
  token: string;
  activeThreadId?: string | null;
}>;

type RegisteredDeferredAttachProjection = Readonly<{
  discard: () => void;
}>;

let deferredAttachProjections = new WeakMap<GuiHostCommands, Set<DeferredAttachProjection>>();
const activeDeferredAttachProjections = new Set<RegisteredDeferredAttachProjection>();

export const createGuiHostCommands = (): GuiHostCommands => ({
  compactThread: vi.fn<GuiHostCommands["compactThread"]>().mockResolvedValue({}),
  attachThreadProjection: vi
    .fn<GuiHostCommands["attachThreadProjection"]>()
    .mockResolvedValue(attachResponse),
  listSkills: vi.fn<GuiHostCommands["listSkills"]>().mockResolvedValue({
    data: [{ cwd: attachResponse.snapshot.thread.cwd, skills: [], errors: [] }],
  }),
  listThreads: vi.fn<GuiHostCommands["listThreads"]>().mockResolvedValue({
    data: [],
    nextCursor: null,
    backwardsCursor: null,
  }),
  readThread: vi.fn<GuiHostCommands["readThread"]>().mockImplementation(({ threadId }) =>
    Promise.resolve({
      thread: { ...attachResponse.snapshot.thread, id: threadId },
    }),
  ),
  resumeThread: vi.fn<GuiHostCommands["resumeThread"]>().mockImplementation(({ threadId }) =>
    Promise.resolve({
      thread: { ...attachResponse.snapshot.thread, id: threadId },
      model: "gpt-5",
      modelProvider: "openai",
      serviceTier: null,
      cwd: attachResponse.snapshot.thread.cwd,
      instructionSources: [],
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandbox: { type: "dangerFullAccess" },
      reasoningEffort: null,
      turnsBackwardsCursor: null,
      itemsBackwardsCursor: null,
    }),
  ),
  detachThreadProjection: vi
    .fn<GuiHostCommands["detachThreadProjection"]>()
    .mockResolvedValue({ status: "detached" }),
  startTurn: vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: inProgressTurn("turn-started-from-app"),
  }),
  steerTurn: vi.fn<GuiHostCommands["steerTurn"]>().mockResolvedValue({
    turnId: "turn-steered-from-app",
  }),
  interruptTurn: vi.fn<GuiHostCommands["interruptTurn"]>().mockResolvedValue({}),
});

export const createCommands = createGuiHostCommands;

export const skillsListResponse = (
  cwd: string,
  skills: SkillMetadata[],
  errors: SkillsListResponse["data"][number]["errors"] = [],
): SkillsListResponse => ({
  data: [{ cwd, skills, errors }],
});

export const queueAttachProjectionResponse = (
  commands: GuiHostCommands,
  response: AttachProjectionResponse = attachResponse,
): void => {
  vi.mocked(commands.attachThreadProjection).mockResolvedValueOnce(response);
};

export const queueAttachProjectionError = (commands: GuiHostCommands, error: unknown): void => {
  vi.mocked(commands.attachThreadProjection).mockRejectedValueOnce(error);
};

export const queueDeferredAttachProjection = (
  commands: GuiHostCommands,
): DeferredAttachProjection => {
  let requestThreadId: string | null = null;
  let state: "queued" | "pending" | "settled" | "discarded" = "queued";
  let resolvePromise: (response: AttachProjectionResponse) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const responsePromise = new Promise<AttachProjectionResponse>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const settle = (settlement: () => void): void => {
    if (state !== "pending") {
      throw new Error(`Deferred projection attach must be pending, not ${state}`);
    }
    state = "settled";
    activeDeferredAttachProjections.delete(registered);
    settlement();
  };
  const deferred: DeferredAttachProjection = {
    getRequestThreadId: () => requestThreadId,
    getState: () => state,
    resolve: (response = attachResponse) => {
      settle(() => {
        resolvePromise(response);
      });
    },
    reject: (error) => {
      settle(() => {
        rejectPromise(error);
      });
    },
  };
  const registered: RegisteredDeferredAttachProjection = {
    discard: () => {
      if (state === "settled" || state === "discarded") {
        return;
      }
      const wasPending = state === "pending";
      state = "discarded";
      if (wasPending) {
        rejectPromise(new Error(testSupportResetErrorMessage));
      }
    },
  };
  activeDeferredAttachProjections.add(registered);
  const commandsDeferred = deferredAttachProjections.get(commands) ?? new Set();
  commandsDeferred.add(deferred);
  deferredAttachProjections.set(commands, commandsDeferred);
  vi.mocked(commands.attachThreadProjection).mockImplementationOnce(
    (params: AttachProjectionParams) => {
      if (state === "discarded") {
        return Promise.reject(new Error(testSupportResetErrorMessage));
      }
      requestThreadId = params.threadId;
      state = "pending";
      return responsePromise;
    },
  );
  return deferred;
};

export const getAttachProjectionThreadIds = (commands: GuiHostCommands): string[] =>
  vi.mocked(commands.attachThreadProjection).mock.calls.map(([params]) => params.threadId);

export const getPendingAttachProjectionCount = (commands: GuiHostCommands): number =>
  Array.from(deferredAttachProjections.get(commands) ?? []).filter(
    (deferred) => deferred.getState() === "pending",
  ).length;

export const attachWithCommittedMessages = (): ThreadProjectionAttachResponse =>
  attachWithTurns(attachResponse, [
    baseTurn("turn-app-surface", [
      userMessage("user-app-surface", [textInput("Hello from App")]),
      agentMessage("agent-app-surface", "Committed App response"),
    ]),
  ]);

export const resetAppBrowserTestSupport = (
  startGuiHostConnectionMock: StartGuiHostConnectionMock,
  authorizationSession?: BrowserAuthorizationSessionSeed,
): void => {
  const generation = ++resetGeneration;
  for (const deferred of activeDeferredAttachProjections) {
    deferred.discard();
  }
  activeDeferredAttachProjections.clear();
  deferredAttachProjections = new WeakMap();
  cleanupConnectionCallCount = 0;
  if (authorizationSession != null) {
    seedBrowserAuthorizationSession(authorizationSession);
  }
  startGuiHostConnectionMock.mockReset();
  startGuiHostConnectionMock.mockImplementation((options) => {
    options.onStatus?.({ label: "connecting" });
    let cleanedUp = false;
    return () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      if (generation !== resetGeneration) {
        return;
      }
      cleanupConnectionCallCount += 1;
    };
  });
};

export const seedBrowserAuthorizationSession = ({
  token,
  activeThreadId = null,
}: BrowserAuthorizationSessionSeed): void => {
  const location = new URL("https://codex.test/browser-authorization-session-seed");
  location.hash = new URLSearchParams({ [TOKEN_FRAGMENT_KEY]: token }).toString();
  const session = consumeBrowserAuthorizationSession({
    location,
    replaceState: () => undefined,
    storage: window.sessionStorage,
  });
  if (activeThreadId != null) {
    session.commitActiveThread(activeThreadId);
  }
};

export const getCleanupConnectionCallCount = (): number => cleanupConnectionCallCount;

export const getConnectionStartCount = (
  startGuiHostConnectionMock: StartGuiHostConnectionMock,
): number => startGuiHostConnectionMock.mock.calls.length;

export const getHostOptions = (
  startGuiHostConnectionMock: StartGuiHostConnectionMock,
  index: number | "latest" = "latest",
): StartGuiHostConnectionOptions => {
  const resolvedIndex =
    index === "latest" ? startGuiHostConnectionMock.mock.calls.length - 1 : index;
  const options = startGuiHostConnectionMock.mock.calls[resolvedIndex]?.[0];
  if (options == null) {
    throw new Error(`Expected GUI host connection start ${String(index)}`);
  }

  return options;
};

export const initializeHost = (
  options: StartGuiHostConnectionOptions,
  commands: GuiHostCommands = createGuiHostCommands(),
): GuiHostCommands => {
  options.onStatus?.({ label: "authenticated" });
  options.onStatus?.({ label: "initialized" });
  options.onCommandsReady?.(commands);
  return commands;
};

export const emitRawHostStatus = (
  options: StartGuiHostConnectionOptions,
  status: GuiHostStatus,
): void => {
  options.onStatus?.(status);
};

export const markCommandsUnavailable = (options: StartGuiHostConnectionOptions): void => {
  options.onCommandsUnavailable?.();
};

export const emitSkillsChanged = (options: StartGuiHostConnectionOptions): void => {
  options.onSkillsChanged?.({});
};

export const emitThreadStatusChanged = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onThreadStatusChanged"]>>[0],
): void => {
  options.onThreadStatusChanged?.(notification);
};

export const emitProjectionEvent = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onProjectionEvent"]>>[0],
): void => {
  options.onProjectionEvent?.(notification);
};

export const emitProjectionDelta = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onProjectionDelta"]>>[0],
): void => {
  options.onProjectionDelta?.(notification);
};

export const emitProjectionClosed = (
  options: StartGuiHostConnectionOptions,
  notification: Parameters<NonNullable<StartGuiHostConnectionOptions["onProjectionClosed"]>>[0],
): void => {
  options.onProjectionClosed?.(notification);
};
