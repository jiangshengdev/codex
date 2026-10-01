import type { AppDispatch } from "@/app/store";
import type { ActiveThreadSessionController } from "@/features/activeThreadSession/activeThreadSession";
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import { startStorybookConnectionLifecycle } from "../environment/storybookConnectionLifecycle";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { createRecoveryCommands, recoveryFirstId, recoverySecondId } from "./recoveryCommands";

export type RecoveryPageSetup = (
  controller: ActiveThreadSessionController,
  host: ReturnType<typeof createRecoveryCommands>,
) => Promise<void>;

export function createRecoveryPageScenario(
  dispatch: AppDispatch,
  setup?: RecoveryPageSetup,
  startup = false,
) {
  const host = createRecoveryCommands();
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
  const authorization = new BrowserAuthorizationSession(
    storage,
    { token: "storybook-recovery-token", activeThreadId: recoveryFirstId },
    crypto.randomUUID(),
  );
  const listeners = createListenerSet();
  const newSessionOwner = new NewSessionOwner();
  let capabilities: AppCapabilities = {
    status: { label: "connecting" },
    authorizationToken: null,
    commands: null,
    activeThreadSession: null,
    connectionRecovery: null,
    newSessionOwner,
    routeTarget: { type: "currentTask", threadId: recoveryFirstId },
  };
  let ready = false;
  let disposed = false;
  const isDisposed = () => disposed;
  let connection: StartGuiHostConnectionOptions | null = null;
  let round = 0;
  let lifecycle: ReturnType<typeof startStorybookConnectionLifecycle> | undefined;
  const patch = (update: Partial<AppCapabilities>) => {
    capabilities = { ...capabilities, ...update };
    listeners.notify();
  };
  const close = () => {
    connection?.onCommandsUnavailable?.();
    connection?.onStatus?.({ label: "closed" });
  };
  const prepare = async (controller: ActiveThreadSessionController) => {
    for (const [id, text] of [
      [recoveryFirstId, "Retained draft one"],
      [recoverySecondId, "Retained draft two"],
    ] as const) {
      await controller.session.activate(id);
      if (isDisposed()) return;
      const snapshot = controller.session.getSnapshot();
      if (snapshot.phase !== "active") throw new Error("Preview task could not be initialized");
      snapshot.composerRole.saveDraft(snapshot.revision, composerDraftCapture(text).draft);
    }
    await controller.session.view(recoveryFirstId);
    if (isDisposed()) return;
    if (setup != null) await setup(controller, host);
    else if (!startup) close();
    if (!isDisposed()) {
      ready = true;
      listeners.notify();
    }
  };
  return {
    host,
    getSnapshot: () => capabilities,
    subscribe: (listener: () => void) => listeners.subscribe(listener),
    isReady: () => ready,
    start() {
      if (lifecycle != null || disposed) return;
      lifecycle = startStorybookConnectionLifecycle({
        dispatch,
        newSessionOwner,
        authorization,
        threadId: recoveryFirstId,
        persistence: { authorizationContext: authorization.getPersistenceContext(), storage },
        getCapabilities: () => capabilities,
        patch,
        prepare,
        startConnection: (options) => {
          connection = options;
          const attempt = round++;
          const complete = () => {
            if (startup ? attempt === 0 : attempt === 1) {
              options.onCommandsUnavailable?.();
              options.onStatus?.({
                label: "error",
                message: "STORYBOOK_RECONNECT_FAILED: simulated transport unavailable.",
              });
              if (startup && attempt === 0) {
                ready = true;
                listeners.notify();
              }
            } else {
              options.onStatus?.({ label: "initialized" });
              options.onCommandsReady?.(host.commands);
            }
          };
          const timer = window.setTimeout(complete, attempt === 0 ? 0 : 1_500);
          return () => {
            window.clearTimeout(timer);
          };
        },
      });
    },
    view(threadId: string) {
      patch({ routeTarget: { type: "currentTask", threadId } });
      void capabilities.activeThreadSession?.view(threadId);
    },
    dispose() {
      disposed = true;
      lifecycle?.dispose();
      host.dispose();
      listeners.clear();
    },
  };
}
