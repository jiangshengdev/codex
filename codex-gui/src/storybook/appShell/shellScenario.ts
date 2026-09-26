import type { AppDispatch } from "@/app/store";
import { createActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import { createThreadResumeResponse } from "@/features/guiHost/__tests__/threadResumeTestBuilders";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithSnapshotThread,
  attachWithThreadId,
  attachWithTurns,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createRecoveryCommands } from "../recovery/recoveryCommands";

export const shellThreadId = "00000000-0000-0000-0000-000000000201";
export const shellCwd = "/storybook/shell";
export type ShellScenarioOptions = Readonly<{
  route?: GuiRouteTarget["type"];
  title?: "long" | "preview" | "missing";
  empty?: boolean;
  missingCwd?: boolean;
  error?: "task" | "connection";
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
  const commands = {
    ...fallback.commands,
    listLoadedThreads: () => Promise.resolve({ data: [], nextCursor: null }),
    readThread: () => Promise.resolve({ thread: task.snapshot.thread }),
    resumeThread: () =>
      Promise.resolve(
        createThreadResumeResponse(task.snapshot.thread, {
          cwd: shellCwd,
          model: "storybook-model",
          modelProvider: "storybook",
          approvalPolicy: "on-request",
        }),
      ),
    attachThreadProjection: () => Promise.resolve(task),
  };
  const controller = createActiveThreadSession({
    dispatch,
    commands,
    authorizationSession: authorization,
    persistence: { authorizationContext: authorization.getPersistenceContext(), storage },
    scheduler: { requestFrame: requestAnimationFrame, cancelFrame: cancelAnimationFrame },
  });
  const newSessionOwner = new NewSessionOwner();
  let start: Promise<void> | undefined;
  return {
    options,
    commands,
    session: controller.session,
    newSessionOwner,
    title: task.snapshot.thread.name,
    start: () =>
      (start ??= (async () => {
        if (!options.empty) await controller.session.activate(shellThreadId);
        if (options.route === "newTask") newSessionOwner.open(options.missingCwd ? null : shellCwd);
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
