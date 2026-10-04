import type { AppDispatch } from "@/app/store";
import {
  createActiveThreadSession,
  type ActiveThreadSession,
} from "@/features/activeThreadSession/activeThreadSession";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import { createThreadResumeResponse } from "@/features/guiHost/__tests__/threadResumeTestBuilders";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { attachWithSnapshotThread } from "@/features/projection/__tests__/projectionTestBuilders";
import { createRecoveryCommands } from "../recovery/recoveryCommands";
import { createListenerSet } from "@/subscriptions/listenerSet";
import type { ForkScenario } from "./forkScenarios";
import {
  historyCurrentId,
  historySelectedId,
  historyReturnedId,
  historyCwd,
  createHistoryFixtures,
} from "./historyFixtures";
import { createHistoryListCommand, type HistoryListScenario } from "./historyListScenarios";
import { createHistoryReadCommand, type HistoryDetailScenario } from "./historyDetailScenarios";
import {
  continuationFailures,
  continuationWarnings,
  type ContinuationFailurePreset,
  type ContinuationWarningPreset,
} from "./continuationScenarios";

export type HistoryScenarioOptions = Readonly<{
  list?: HistoryListScenario;
  detail?: HistoryDetailScenario;
  continuation?: ContinuationFailurePreset | "unexpectedFailure" | "navigationFailed" | "pending";
  warning?: ContinuationWarningPreset;
  fork?: ForkScenario;
}>;

export function createHistoryScenario(dispatch: AppDispatch, options: HistoryScenarioOptions = {}) {
  const fallback = createRecoveryCommands();
  const tasks = createHistoryFixtures(
    options.list === "longContent",
    options.fork != null && options.detail === "longContent",
  );
  const cancellations = new Set<() => void>();
  const wait = (pending = false): Promise<void> =>
    new Promise((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        reject(new Error("Local history preview disposed"));
      };
      const timer = pending
        ? undefined
        : setTimeout(() => {
            cancellations.delete(cancel);
            resolve();
          }, 600);
      cancellations.add(cancel);
    });
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
  const authorization = new BrowserAuthorizationSession(
    storage,
    {
      token: "storybook-history-token",
      activeThreadId: null,
      ...(options.list === "contextUnavailable" ? {} : { historyCwd }),
    },
    crypto.randomUUID(),
  );
  const task = (threadId: string) => {
    const result = tasks.find((entry) => entry.snapshot.thread.id === threadId);
    if (result == null) throw new Error(`Unknown local history task: ${threadId}`);
    return result;
  };
  let subscription = 0;
  let activationCount = 0;
  let forkCount = 0;
  let forkAttachFailed = false;
  const listeners = createListenerSet();
  const commands: GuiHostCommands = {
    ...fallback.commands,
    forkThread: () => {
      forkCount += 1;
      listeners.notify();
      return Promise.reject(new Error("Creating a fork is outside this local preview."));
    },
    listThreads: createHistoryListCommand(
      options.list,
      wait,
      (threadId) => task(threadId).snapshot.thread,
    ),
    listLoadedThreads: () => Promise.resolve({ data: [], nextCursor: null }),
    readThread: createHistoryReadCommand(
      options.detail,
      ({ threadId }) => Promise.resolve({ thread: task(threadId).snapshot.thread }),
      wait,
    ),
    resumeThread: async ({ threadId }) => {
      if (threadId !== historyCurrentId) await wait();
      return createThreadResumeResponse(task(threadId).snapshot.thread, {
        cwd: historyCwd,
        model: "storybook-model",
        modelProvider: "storybook",
        approvalPolicy: "on-request",
      });
    },
    attachThreadProjection: ({ threadId }) => {
      if (
        options.fork === "activationFailed" &&
        threadId === historyReturnedId &&
        !forkAttachFailed
      ) {
        forkAttachFailed = true;
        // Let the production session wrap this command failure in its activation outcome.
        return Promise.reject(
          new Error("STORYBOOK_FORK_FAILED: The saved fork projection could not be attached."),
        );
      }
      const baseline = task(threadId);
      return Promise.resolve(
        attachWithSnapshotThread(
          baseline,
          baseline.snapshot.thread,
          `history-subscription-${String(++subscription)}`,
        ),
      );
    },
  };
  const controller = createActiveThreadSession({
    dispatch,
    commands,
    authorizationSession: authorization,
    persistence: { authorizationContext: authorization.getPersistenceContext(), storage },
    scheduler: {
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (id) => {
        cancelAnimationFrame(id);
      },
    },
  });
  const session: ActiveThreadSession = {
    ...controller.session,
    activate: async (threadId: string) => {
      activationCount += 1;
      listeners.notify();
      if (options.fork === "openFailed" && activationCount === 1) {
        await wait();
        throw new Error("STORYBOOK_FORK_FAILED: Opening the saved fork failed again.");
      }
      if (options.continuation === "pending") await wait(true);
      if (
        activationCount === 1 &&
        options.continuation != null &&
        options.continuation !== "navigationFailed" &&
        options.continuation !== "pending"
      ) {
        await wait();
        if (options.continuation === "unexpectedFailure")
          throw new Error("STORYBOOK_CONTINUE_FAILED: Unexpected activation result.");
        return continuationFailures[options.continuation];
      }
      // Simulate the public activation capability returning an authoritative identity.
      const outcome = await controller.session.activate(
        threadId === historySelectedId ? historyReturnedId : threadId,
      );
      return outcome.type === "ready" && options.warning != null
        ? { ...outcome, warnings: [...outcome.warnings, continuationWarnings[options.warning]] }
        : outcome;
    },
  };
  let start: Promise<unknown> | undefined;
  let navigationFailed = false;
  return {
    options,
    initialPath:
      options.detail == null &&
      options.continuation == null &&
      options.warning == null &&
      options.fork == null
        ? "/history"
        : `/history/${historySelectedId}`,
    beforeTaskNavigation() {
      if (
        (options.continuation === "navigationFailed" || options.fork === "navigationFailed") &&
        !navigationFailed
      ) {
        navigationFailed = true;
        throw new Error("STORYBOOK_NAVIGATION_FAILED: Local route transition failed.");
      }
    },
    commands,
    session,
    newSessionOwner: new NewSessionOwner(),
    start: () =>
      (start ??=
        options.list === "contextUnavailable"
          ? Promise.resolve()
          : controller.session.activate(historyCurrentId).then((outcome) => {
              if (options.fork === "pageCoexistence") {
                controller.session.setOperationError(
                  historySelectedId,
                  "navigation",
                  new Error("STORYBOOK_OPEN_TASK_FAILED: The history task could not be opened."),
                );
              }
              return outcome;
            })),
    getActivationCount: () => activationCount,
    getForkCount: () => forkCount,
    subscribe: (listener: () => void) => listeners.subscribe(listener),
    dispose() {
      controller.dispose();
      for (const cancel of cancellations) cancel();
      cancellations.clear();
      fallback.dispose();
      listeners.clear();
    },
  };
}
