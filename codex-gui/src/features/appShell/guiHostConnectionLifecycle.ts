import type { AppDispatch } from "@/app/store";
import {
  createActiveThreadSession,
  type ActiveThreadSession,
  type ActiveThreadSessionController,
  type CreateActiveThreadSessionInput,
} from "@/features/activeThreadSession/activeThreadSession";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import {
  startGuiHostConnection,
  type GuiHostCommands,
  type GuiHostStatus,
} from "@/features/guiHost/guiHostClient";
import type { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { errorText } from "@/text/errorText";

export type GuiHostConnectionLifecycleInput = {
  dispatch: AppDispatch;
  getRouteTarget: () => GuiRouteTarget;
  newSessionOwner: NewSessionOwner;
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  setAuthorizationToken: (token: string | null) => void;
  setActiveThreadSession: (session: ActiveThreadSession | null) => void;
  setConnectionRecovery: (recovery: GuiHostConnectionRecovery | null) => void;
};

export type GuiHostConnectionRecovery = Readonly<{
  pending: boolean;
  error: unknown;
  reconnect(): void;
}>;

export type GuiHostConnectionLifecycle = Readonly<{
  dispose(): void;
  reconnect(): void;
}>;

type PageTransitionHandlers = {
  onHide: () => void;
  onShow: (event: Pick<PageTransitionEvent, "persisted">) => void;
};

export type GuiHostConnectionLifecycleEnvironment = {
  readLocation: () => URL;
  replaceState: History["replaceState"];
  subscribePageTransitions: (handlers: PageTransitionHandlers) => () => void;
  scheduler: CreateActiveThreadSessionInput["scheduler"];
  queueMicrotask: typeof queueMicrotask;
};

type LifecycleDependencies = {
  consumeAuthorization: typeof consumeBrowserAuthorizationSession;
  startConnection: typeof startGuiHostConnection;
  createSession: typeof createActiveThreadSession;
};

const productionDependencies: LifecycleDependencies = {
  consumeAuthorization: consumeBrowserAuthorizationSession,
  startConnection: startGuiHostConnection,
  createSession: createActiveThreadSession,
};

function browserEnvironment(): GuiHostConnectionLifecycleEnvironment {
  return {
    readLocation: () => new URL(window.location.href),
    replaceState: window.history.replaceState.bind(window.history),
    subscribePageTransitions: ({ onHide, onShow }) => {
      window.addEventListener("pagehide", onHide);
      window.addEventListener("pageshow", onShow);
      return () => {
        window.removeEventListener("pagehide", onHide);
        window.removeEventListener("pageshow", onShow);
      };
    },
    scheduler: {
      requestFrame: (callback) => window.requestAnimationFrame(callback),
      cancelFrame: (frameId) => {
        window.cancelAnimationFrame(frameId);
      },
    },
    queueMicrotask: (callback) => {
      window.queueMicrotask(callback);
    },
  };
}

/** Owns connection replacement for one page mount; callers only release the mount. */
export function startGuiHostConnectionLifecycle(
  input: GuiHostConnectionLifecycleInput,
  environment = browserEnvironment(),
  dependencies = productionDependencies,
): GuiHostConnectionLifecycle {
  const { newSessionOwner, setStatus, setCommands, setAuthorizationToken, setActiveThreadSession } =
    input;
  let active = true;
  let controller: ActiveThreadSessionController | null = null;
  let round = 0;
  let cleanupConnection: (() => void) | null = null;
  let recovery: GuiHostConnectionRecovery | null = null;
  const publishRecovery = (pending: boolean, error: unknown): void => {
    recovery = { pending, error, reconnect };
    input.setConnectionRecovery(recovery);
  };
  const unavailable = (): void => {
    newSessionOwner.setConnection(null);
    controller?.connectionUnavailable();
    setCommands(null);
  };
  const preferredThreadId = (): string | null => {
    const target = input.getRouteTarget();
    return target.type === "currentTask" ? target.threadId : null;
  };
  const startRound = (): void => {
    const identity = ++round;
    let terminated = false;
    const current = (): boolean => active && identity === round;
    const fail = (error: unknown): void => {
      if (!current()) return;
      terminated = true;
      unavailable();
      setStatus({ label: "error", message: errorText(error) });
      publishRecovery(false, error);
    };
    let authorizationSession;
    try {
      authorizationSession = dependencies.consumeAuthorization({
        location: environment.readLocation(),
        replaceState: environment.replaceState,
      });
    } catch (error: unknown) {
      environment.queueMicrotask(() => {
        fail(error);
      });
      return;
    }
    setAuthorizationToken(authorizationSession.getSnapshot().token);
    try {
      cleanupConnection = dependencies.startConnection({
        location: environment.readLocation(),
        token: authorizationSession.getSnapshot().token,
        onStatus: (status) => {
          if (!current()) return;
          setStatus(status);
          if (status.label === "error") publishRecovery(false, new Error(status.message));
          if (status.label === "closed") publishRecovery(false, recovery?.error ?? null);
        },
        onProjectionEvent: (notification) => {
          if (current()) controller?.handleProjectionEvent(notification);
        },
        onProjectionDelta: (notification) => {
          if (current()) controller?.handleProjectionDelta(notification);
        },
        onProjectionClosed: (notification) => {
          if (current()) controller?.handleProjectionClosed(notification);
        },
        onSkillsChanged: () => {
          if (current()) controller?.handleSkillsChanged();
        },
        onThreadStatusChanged: (notification) => {
          if (current()) controller?.handleThreadStatusChanged(notification);
        },
        onCommandsReady: (commands) => {
          if (!current() || terminated) return;
          setCommands(commands);
          if (controller != null) {
            const retained = controller;
            const restoration = retained.restoreConnection(commands, preferredThreadId);
            if (!current()) return;
            newSessionOwner.setConnection({ commands, session: retained.session });
            recovery = null;
            input.setConnectionRecovery(null);
            void restoration.catch((error: unknown) => {
              if (current()) fail(error);
            });
            return;
          }
          const nextController = dependencies.createSession({
            authorizationSession,
            commands,
            dispatch: input.dispatch,
            scheduler: environment.scheduler,
            persistence: { authorizationContext: authorizationSession.getPersistenceContext() },
          });
          controller = nextController;
          newSessionOwner.setConnection({ commands, session: nextController.session });
          setActiveThreadSession(nextController.session);
          recovery = null;
          input.setConnectionRecovery(null);
          void nextController.activateRecoveryThread(preferredThreadId());
        },
        onCommandsUnavailable: () => {
          if (!current()) return;
          terminated = true;
          unavailable();
          publishRecovery(false, recovery?.error ?? null);
        },
      });
    } catch (error: unknown) {
      environment.queueMicrotask(() => {
        fail(error);
      });
    }
  };
  const reconnect = (): void => {
    if (!active || recovery?.pending) return;
    round += 1;
    unavailable();
    publishRecovery(true, recovery?.error ?? null);
    const cleanup = cleanupConnection;
    try {
      cleanup?.();
    } catch (error: unknown) {
      publishRecovery(false, error);
      setStatus({ label: "error", message: errorText(error) });
      return;
    }
    cleanupConnection = null;
    startRound();
  };
  const suspend = (): void => {
    if (active) controller?.suspendRestoredQueue();
  };
  const unsubscribe = environment.subscribePageTransitions({
    onHide: suspend,
    onShow: (event) => {
      if (!active || !event.persisted) return;
      suspend();
      reconnect();
    },
  });
  startRound();
  const dispose = (): void => {
    if (!active) return;
    active = false;
    newSessionOwner.setConnection(null);
    unsubscribe();
    controller?.dispose();
    controller = null;
    setCommands(null);
    setAuthorizationToken(null);
    setActiveThreadSession(null);
    input.setConnectionRecovery(null);
    cleanupConnection?.();
  };
  return { dispose, reconnect };
}
