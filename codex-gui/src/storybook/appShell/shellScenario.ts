import type { AppDispatch } from "@/app/store";
import { createActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands } from "@/features/guiHost/guiHostCommandGateway";
import { createThreadResumeResponse } from "@/features/guiHost/__tests__/threadResumeTestBuilders";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithSnapshotThread,
  attachWithThreadId,
  attachWithTurns,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createRecoveryCommands } from "../recovery/recoveryCommands";

export const shellThreadId = "00000000-0000-0000-0000-000000000201";
export const shellSecondThreadId = "00000000-0000-0000-0000-000000000202";
export const shellCwd = "/storybook/shell";
export type ShellScenarioOptions = Readonly<{
  route?: GuiRouteTarget["type"];
  title?: "long" | "preview" | "missing";
  empty?: boolean;
  missingCwd?: boolean;
  error?: "task" | "connection";
  realPages?: boolean;
  inputUnavailable?: boolean;
  newDraft?: string;
  collection?: "multiple" | "long" | "missing" | "running" | "navigationFailure" | "removalFailure";
}>;

export function createShellScenario(dispatch: AppDispatch, options: ShellScenarioOptions) {
  const fallback = createRecoveryCommands();
  const baseline = attachWithTurns(attachWithThreadId(attachBaseline, shellThreadId), []);
  const task = attachWithSnapshotThread(baseline, {
    ...baseline.snapshot.thread,
    name:
      options.title === "long"
        ? "Long shell task title ".repeat(20)
        : options.title == null
          ? "Shell task one"
          : null,
    preview: options.title === "preview" ? "Shell task preview fallback" : "",
    cwd: shellCwd,
    status: { type: "idle" },
  });
  const tasks = new Map([[shellThreadId, task]]);
  if (options.collection != null) {
    const count = options.collection === "long" ? 24 : 3;
    for (let index = 2; index <= count; index += 1) {
      const id = `00000000-0000-0000-0000-${String(200 + index).padStart(12, "0")}`;
      const attach = attachWithThreadId(baseline, id);
      tasks.set(
        id,
        attachWithSnapshotThread(attach, {
          ...attach.snapshot.thread,
          name:
            options.collection === "missing" && index === 2
              ? null
              : options.collection === "long"
                ? `Shell task ${String(index)} ${"long task name ".repeat(20)}`
                : `Shell task ${String(index)}`,
          preview: "",
          cwd: shellCwd,
          status:
            options.collection === "running" && index === 2
              ? { type: "active", activeFlags: [] }
              : { type: "idle" },
        }),
      );
    }
  }
  const getTask = (threadId: string) => {
    const result = tasks.get(threadId);
    if (result == null) throw new Error(`Unknown local shell task: ${threadId}`);
    return result;
  };
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
      token: "storybook-shell-fictional-token",
      activeThreadId: null,
      ...(options.missingCwd ? {} : { historyCwd: shellCwd }),
    },
    crypto.randomUUID(),
  );
  let removalFailurePending = options.collection === "removalFailure";
  const commands: GuiHostCommands = {
    ...fallback.commands,
    listLoadedThreads: () => Promise.resolve({ data: [], nextCursor: null }),
    listThreads: () =>
      Promise.resolve({
        data: options.empty ? [] : [...tasks.values()].map((entry) => entry.snapshot.thread),
        nextCursor: null,
        backwardsCursor: null,
      }),
    readThread: ({ threadId }) => Promise.resolve({ thread: getTask(threadId).snapshot.thread }),
    resumeThread: ({ threadId }) =>
      Promise.resolve(
        createThreadResumeResponse(getTask(threadId).snapshot.thread, {
          cwd: shellCwd,
          model: "storybook-model",
          modelProvider: "storybook",
          approvalPolicy: "on-request",
        }),
      ),
    attachThreadProjection: ({ threadId }) => Promise.resolve(getTask(threadId)),
    detachThreadProjection: ({ threadId }) => {
      if (removalFailurePending && threadId === shellSecondThreadId) {
        removalFailurePending = false;
        return Promise.reject(
          new Error("STORYBOOK_REMOVAL_FAILED: simulated local detach failure"),
        );
      }
      return Promise.resolve({ status: "detached" });
    },
  };
  const controller = createActiveThreadSession({
    dispatch,
    commands,
    authorizationSession: authorization,
    persistence: { authorizationContext: authorization.getPersistenceContext(), storage },
    scheduler: { requestFrame: requestAnimationFrame, cancelFrame: cancelAnimationFrame },
  });
  const newSessionOwner = new NewSessionOwner();
  if (options.realPages) newSessionOwner.setConnection({ commands, session: controller.session });
  let start: Promise<void> | undefined;
  return {
    options,
    commands,
    session: controller.session,
    newSessionOwner,
    title: task.snapshot.thread.name,
    start: () =>
      (start ??= (async () => {
        if (!options.empty) {
          for (const id of tasks.keys()) await controller.session.activate(id);
          await controller.session.view(shellThreadId);
        }
        if (options.route === "newTask") newSessionOwner.open(options.missingCwd ? null : shellCwd);
        if (options.newDraft != null) {
          newSessionOwner.open(shellCwd);
          newSessionOwner.saveDraft(composerDraftCapture(options.newDraft).draft);
        }
        if (options.error === "task")
          controller.session.setOperationError(
            shellThreadId,
            "navigation",
            new Error("STORYBOOK_NAVIGATION_FAILED: simulated local navigation failure"),
          );
      })()),
    dispose() {
      controller.dispose();
      fallback.dispose();
    },
  };
}
