import type { AppDispatch } from "@/app/store";
import { createActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import { createThreadResumeResponse } from "@/features/guiHost/__tests__/threadResumeTestBuilders";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { attachWithSnapshotThread } from "@/features/projection/__tests__/projectionTestBuilders";
import { createRecoveryCommands } from "../recovery/recoveryCommands";
import {
  historyCurrentId,
  historySelectedId,
  historyReturnedId,
  historyCwd,
  historyTasks,
} from "./historyFixtures";

export function createHistoryScenario(dispatch: AppDispatch) {
  const fallback = createRecoveryCommands();
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
      historyCwd,
    },
    crypto.randomUUID(),
  );
  const task = (threadId: string) => {
    const result = historyTasks.find((entry) => entry.snapshot.thread.id === threadId);
    if (result == null) throw new Error(`Unknown local history task: ${threadId}`);
    return result;
  };
  let subscription = 0;
  let activationCount = 0;
  const commands: GuiHostCommands = {
    ...fallback.commands,
    listThreads: () =>
      Promise.resolve({
        data: [task(historySelectedId).snapshot.thread],
        nextCursor: null,
        backwardsCursor: null,
      }),
    listLoadedThreads: () => Promise.resolve({ data: [], nextCursor: null }),
    readThread: ({ threadId }) => Promise.resolve({ thread: task(threadId).snapshot.thread }),
    resumeThread: async ({ threadId }) => {
      if (threadId !== historyCurrentId)
        await new Promise<void>((resolve) => setTimeout(resolve, 600));
      return createThreadResumeResponse(task(threadId).snapshot.thread, {
        cwd: historyCwd,
        model: "storybook-model",
        modelProvider: "storybook",
        approvalPolicy: "on-request",
      });
    },
    attachThreadProjection: ({ threadId }) => {
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
  const session = {
    ...controller.session,
    activate: (threadId: string) => {
      activationCount += 1;
      // Simulate the public activation capability returning an authoritative identity.
      return controller.session.activate(
        threadId === historySelectedId ? historyReturnedId : threadId,
      );
    },
  };
  let start: Promise<unknown> | undefined;
  return {
    commands,
    session,
    newSessionOwner: new NewSessionOwner(),
    start: () => (start ??= controller.session.activate(historyCurrentId)),
    getActivationCount: () => activationCount,
    dispose() {
      controller.dispose();
      fallback.dispose();
    },
  };
}
