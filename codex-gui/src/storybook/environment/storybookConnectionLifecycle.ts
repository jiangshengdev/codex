import {
  createActiveThreadSession,
  type ActiveThreadSessionController,
  type CreateActiveThreadSessionInput,
} from "@/features/activeThreadSession/activeThreadSession";
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import {
  startGuiHostConnectionLifecycle,
  type GuiHostConnectionLifecycleInput,
} from "@/features/appShell/guiHostConnectionLifecycle";
import type { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { startGuiHostConnection } from "@/features/guiHost/guiHostClient";

type StorybookConnectionInput = Pick<
  GuiHostConnectionLifecycleInput,
  "dispatch" | "newSessionOwner"
> & {
  threadId: string;
  authorization: BrowserAuthorizationSession;
  persistence: CreateActiveThreadSessionInput["persistence"];
  getCapabilities(): AppCapabilities;
  patch(update: Partial<AppCapabilities>): void;
  prepare(controller: ActiveThreadSessionController): void | Promise<void>;
  startConnection: typeof startGuiHostConnection;
};

/** Real connection/session ownership with page-local persistence and a simulated transport. */
export function startStorybookConnectionLifecycle(input: StorybookConnectionInput) {
  let active = true;
  const lifecycle = startGuiHostConnectionLifecycle(
    {
      dispatch: input.dispatch,
      newSessionOwner: input.newSessionOwner,
      getRouteTarget: () => input.getCapabilities().routeTarget,
      setStatus: (status) => {
        input.patch({ status });
      },
      setCommands: (commands) => {
        input.patch({ commands });
      },
      // Preview attachments are out of scope; keep real uploads unavailable.
      setAuthorizationToken: () => undefined,
      setActiveThreadSession: (activeThreadSession) => {
        input.patch({ activeThreadSession });
      },
      setConnectionRecovery: (connectionRecovery) => {
        input.patch({ connectionRecovery });
      },
    },
    {
      readLocation: () => new URL(`http://storybook.invalid/task/${input.threadId}`),
      replaceState: () => undefined,
      subscribePageTransitions: () => () => undefined,
      scheduler: {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (id) => {
          window.cancelAnimationFrame(id);
        },
      },
      queueMicrotask,
    },
    {
      consumeAuthorization: () => input.authorization,
      startConnection: input.startConnection,
      createSession: (sessionInput) => {
        const controller = createActiveThreadSession({
          ...sessionInput,
          persistence: input.persistence,
        });
        return {
          ...controller,
          activateRecoveryThread: async (preferredThreadId) => {
            const outcome = await controller.activateRecoveryThread(preferredThreadId);
            if (outcome.type === "ready" && active) await input.prepare(controller);
            return outcome;
          },
        };
      },
    },
  );
  return {
    dispose() {
      active = false;
      lifecycle.dispose();
    },
  };
}
