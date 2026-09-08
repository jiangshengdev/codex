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
  startupTarget: GuiRouteTarget;
  newSessionOwner: NewSessionOwner;
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  setAuthorizationToken: (token: string | null) => void;
  setActiveThreadSession: (session: ActiveThreadSession | null) => void;
};

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
): () => void {
  const restart = (): void => {
    releaseRound();
    releaseRound = startRound(input, environment, dependencies, restart);
  };
  let releaseRound = startRound(input, environment, dependencies, restart);
  return () => {
    releaseRound();
  };
}

function startRound(
  input: GuiHostConnectionLifecycleInput,
  environment: GuiHostConnectionLifecycleEnvironment,
  dependencies: LifecycleDependencies,
  restart: () => void,
): () => void {
  const { newSessionOwner, setStatus, setCommands, setAuthorizationToken, setActiveThreadSession } =
    input;
  let active = true;
  let controller: ActiveThreadSessionController | null = null;
  let cleanupConnection: (() => void) | undefined;
  let authorizationSession;
  try {
    authorizationSession = dependencies.consumeAuthorization({
      location: environment.readLocation(),
      replaceState: environment.replaceState,
    });
  } catch (error: unknown) {
    environment.queueMicrotask(() => {
      if (active) setStatus({ label: "error", message: errorText(error) });
    });
    return () => {
      active = false;
      setAuthorizationToken(null);
      setActiveThreadSession(null);
    };
  }

  setAuthorizationToken(authorizationSession.getSnapshot().token);
  const suspend = (): void => {
    if (active) controller?.suspendRestoredQueue();
  };
  const unsubscribe = environment.subscribePageTransitions({
    onHide: suspend,
    onShow: (event) => {
      if (!active || !event.persisted) return;
      suspend();
      restart();
    },
  });
  const connectionUnavailable = (): void => {
    if (!active) return;
    newSessionOwner.setConnection(null);
    controller?.connectionUnavailable();
    setCommands(null);
  };

  try {
    cleanupConnection = dependencies.startConnection({
      location: environment.readLocation(),
      token: authorizationSession.getSnapshot().token,
      onStatus: (status) => {
        if (active) setStatus(status);
      },
      onProjectionEvent: (notification) => {
        if (active) controller?.handleProjectionEvent(notification);
      },
      onProjectionDelta: (notification) => {
        if (active) controller?.handleProjectionDelta(notification);
      },
      onProjectionClosed: (notification) => {
        if (active) controller?.handleProjectionClosed(notification);
      },
      onSkillsChanged: () => {
        if (active) controller?.handleSkillsChanged();
      },
      onThreadStatusChanged: (notification) => {
        if (active) controller?.handleThreadStatusChanged(notification);
      },
      onCommandsReady: (commands) => {
        if (!active) return;
        setCommands(commands);
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
        const target = input.startupTarget;
        void nextController.activateRecoveryThread(
          target.type === "currentTask" ? target.threadId : undefined,
        );
      },
      onCommandsUnavailable: connectionUnavailable,
    });
  } catch (error: unknown) {
    environment.queueMicrotask(() => {
      if (!active) return;
      connectionUnavailable();
      setStatus({ label: "error", message: errorText(error) });
    });
  }

  return () => {
    active = false;
    newSessionOwner.setConnection(null);
    unsubscribe();
    controller?.dispose();
    controller = null;
    setCommands(null);
    setAuthorizationToken(null);
    setActiveThreadSession(null);
    cleanupConnection?.();
  };
}
