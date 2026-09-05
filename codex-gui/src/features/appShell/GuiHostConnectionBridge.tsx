import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/app/hooks";
import {
  createActiveThreadSession,
  type ActiveThreadActivationFailure,
  type ActiveThreadActivationOutcome,
  type ActiveThreadActivationWarning,
  type ActiveThreadSession,
  type ActiveThreadSessionController,
} from "@/features/activeThreadSession/activeThreadSession";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import { errorText } from "@/text/errorText";

export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  startupTarget: GuiRouteTarget;
  setAuthorizationToken: (token: string | null) => void;
  setActiveThreadSession: (session: ActiveThreadSession | null) => void;
  setActiveThreadStartupError: (error: string | null) => void;
};

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  startupTarget,
  setAuthorizationToken,
  setActiveThreadSession,
  setActiveThreadStartupError,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();
  const frozenStartupTarget = useRef(startupTarget);

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    let activeThreadController: ActiveThreadSessionController | null = null;
    let activationGeneration = 0;
    const scheduler = {
      requestFrame: (callback: () => void) => window.requestAnimationFrame(callback),
      cancelFrame: (frameId: number) => {
        window.cancelAnimationFrame(frameId);
      },
    };
    let authorizationSession;
    try {
      authorizationSession = consumeBrowserAuthorizationSession({
        location: new URL(window.location.href),
        replaceState: window.history.replaceState.bind(window.history),
      });
    } catch (error: unknown) {
      queueMicrotask(() => {
        if (isMounted) {
          setStatus({ label: "error", message: errorText(error) });
        }
      });
      return () => {
        isMounted = false;
        setAuthorizationToken(null);
        setActiveThreadSession(null);
        setActiveThreadStartupError(null);
      };
    }
    setAuthorizationToken(authorizationSession.getSnapshot().token);

    const connectionUnavailable = (): void => {
      activationGeneration += 1;
      activeThreadController?.connectionUnavailable();
      if (isMounted) setCommands(null);
    };

    try {
      cleanupConnection = startGuiHostConnection({
        location: new URL(window.location.href),
        token: authorizationSession.getSnapshot().token,
        onStatus: setStatus,
        onProjectionEvent: (notification) => {
          activeThreadController?.handleProjectionEvent(notification);
        },
        onProjectionDelta: (notification) => {
          activeThreadController?.handleProjectionDelta(notification);
        },
        onProjectionClosed: (notification) => {
          activeThreadController?.handleProjectionClosed(notification);
        },
        onSkillsChanged: () => {
          activeThreadController?.handleSkillsChanged();
        },
        onThreadStatusChanged: (notification) => {
          activeThreadController?.handleThreadStatusChanged(notification);
        },
        onCommandsReady: (commands) => {
          if (!isMounted) return;
          setCommands(commands);
          setActiveThreadStartupError(null);
          const controller = createActiveThreadSession({
            authorizationSession,
            commands,
            dispatch,
            scheduler,
          });
          activeThreadController = controller;
          const generation = ++activationGeneration;
          const target = frozenStartupTarget.current;
          const activation =
            target.type === "currentTask"
              ? controller.session.activate(target.threadId)
              : controller.activateRecoveryThread();
          void activation.then((outcome) => {
            if (
              !isMounted ||
              activationGeneration !== generation ||
              activeThreadController !== controller
            ) {
              return;
            }
            setActiveThreadSession(controller.session);
            const activationError = startupActivationError(outcome);
            setActiveThreadStartupError(activationError);
            const warning = activationWarning(outcome);
            const statusError = activationError ?? warning;
            if (statusError != null) setStatus({ label: "error", message: statusError });
          });
        },
        onCommandsUnavailable: connectionUnavailable,
      });
    } catch (error: unknown) {
      queueMicrotask(() => {
        if (!isMounted) return;
        connectionUnavailable();
        setStatus({ label: "error", message: errorText(error) });
      });
    }

    return () => {
      isMounted = false;
      activationGeneration += 1;
      activeThreadController?.dispose();
      activeThreadController = null;
      setCommands(null);
      setAuthorizationToken(null);
      setActiveThreadSession(null);
      setActiveThreadStartupError(null);
      cleanupConnection?.();
    };
  }, [
    dispatch,
    setActiveThreadSession,
    setActiveThreadStartupError,
    setAuthorizationToken,
    setCommands,
    setStatus,
  ]);

  return null;
}

function startupActivationError(outcome: ActiveThreadActivationOutcome): string | null {
  switch (outcome.type) {
    case "empty":
    case "ready":
      return null;
    case "unavailable":
      return activationFailureText(outcome.failure);
  }
}

function activationWarning(outcome: ActiveThreadActivationOutcome): string | null {
  if (outcome.type !== "ready" || outcome.warnings.length === 0) return null;
  return outcome.warnings.map(activationWarningText).join("; ");
}

function activationWarningText(warning: ActiveThreadActivationWarning): string {
  switch (warning.type) {
    case "authorizationPersistenceFailed":
      return `authorizationSession: ${errorText(warning.error)}`;
    case "previousOwnerCleanupFailed":
      return `previousOwnerCleanup: ${errorText(warning.error)}`;
  }
}

function activationFailureText(failure: ActiveThreadActivationFailure): string {
  switch (failure.type) {
    case "switchInProgress":
      return "Active thread activation is already in progress";
    case "currentThreadChanged":
      return `Active thread changed during activation (expected revision ${String(failure.expectedRevision)}, actual revision ${String(failure.actualRevision)})`;
    case "currentThreadUnresolved":
      return `Active thread could not be released: ${failure.blockers.map(({ type }) => type).join(", ")}`;
    case "connectionLost":
      return "GUI host connection was lost during active thread activation";
    case "operationFailed": {
      const failures = [`${failure.phase}: ${errorText(failure.error)}`];
      if (failure.cleanupError != null) {
        failures.push(`cleanup: ${errorText(failure.cleanupError)}`);
      }
      return failures.join("; ");
    }
  }
}
