import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useAppDispatch } from "@/app/hooks";
import type { ContinueThread } from "@/features/appShell/AppCapabilities";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import {
  RouteConnectionStartupCoordinator,
  type RouteConnectionStartupOutcome,
} from "@/features/appShell/routeConnectionStartupCoordinator";
import { ThreadSwitchCoordinator } from "@/features/projectionCoordination/threadSwitchCoordinator";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";

export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  startupTarget: GuiRouteTarget;
  setAuthorizationToken: (token: string | null) => void;
  setStartupOutcome: (outcome: RouteConnectionStartupOutcome | null) => void;
  setActiveOwner: (activeOwner: ActiveThreadOwnerHandle | null) => void;
  setContinueThread: Dispatch<SetStateAction<ContinueThread | null>>;
};

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  startupTarget,
  setAuthorizationToken,
  setStartupOutcome,
  setActiveOwner,
  setContinueThread,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();
  const frozenStartupTarget = useRef(startupTarget);

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    let startupCoordinator: RouteConnectionStartupCoordinator | null = null;
    let switchCoordinator: ThreadSwitchCoordinator | null = null;
    let notificationCoordinator:
      | RouteConnectionStartupCoordinator
      | ThreadSwitchCoordinator
      | null = null;
    let startupOwnsActiveOwner = true;
    let startupGeneration = 0;
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
      };
    }
    setAuthorizationToken(authorizationSession.getSnapshot().token);
    const publishActiveOwner = (activeOwner: ActiveThreadOwnerHandle): void => {
      setActiveOwner(activeOwner);
      authorizationSession.commitActiveThread(activeOwner.threadId);
    };
    const disposeOwnerCoordinator = (): void => {
      const currentSwitchCoordinator = switchCoordinator;
      const currentStartupCoordinator = startupCoordinator;
      const shouldDisposeStartup = startupOwnsActiveOwner;
      switchCoordinator = null;
      startupCoordinator = null;
      notificationCoordinator = null;
      startupOwnsActiveOwner = false;
      if (currentSwitchCoordinator != null) {
        currentSwitchCoordinator.dispose();
      } else if (shouldDisposeStartup) {
        currentStartupCoordinator?.dispose();
      }
    };
    const invalidateCommandsAndOwner = (): void => {
      startupGeneration += 1;
      disposeOwnerCoordinator();
      setCommands(null);
      setStartupOutcome(null);
      setActiveOwner(null);
      setContinueThread(null);
    };

    try {
      cleanupConnection = startGuiHostConnection({
        location: new URL(window.location.href),
        token: authorizationSession.getSnapshot().token,
        onStatus: setStatus,
        onProjectionEvent: (notification) => {
          notificationCoordinator?.handleProjectionEvent(notification);
        },
        onProjectionDelta: (notification) => {
          notificationCoordinator?.handleProjectionDelta(notification);
        },
        onProjectionClosed: (notification) => {
          notificationCoordinator?.handleProjectionClosed(notification);
        },
        onCommandsReady: (commands) => {
          setCommands(commands);
          const generation = ++startupGeneration;
          const coordinator = new RouteConnectionStartupCoordinator({
            target: frozenStartupTarget.current,
            authorizationSession,
            commands,
            dispatch,
            scheduler,
          });
          startupCoordinator = coordinator;
          notificationCoordinator = coordinator;
          void coordinator.start().then((outcome) => {
            if (
              !isMounted ||
              generation !== startupGeneration ||
              startupCoordinator !== coordinator
            ) {
              return;
            }
            setStartupOutcome(outcome);
            if (outcome.type !== "ready" || outcome.activeOwner == null) {
              if (outcome.type === "failed") {
                setStatus({ label: "error", message: startupFailureText(outcome) });
              }
              return;
            }
            const nextSwitchCoordinator = new ThreadSwitchCoordinator({
              activeOwner: outcome.activeOwner,
              commands,
              dispatch,
              publishActiveOwner,
              scheduler,
            });
            startupOwnsActiveOwner = false;
            startupCoordinator = null;
            switchCoordinator = nextSwitchCoordinator;
            notificationCoordinator = nextSwitchCoordinator;
            setActiveOwner(outcome.activeOwner);
            setContinueThread(() => nextSwitchCoordinator.continueThread);
            if (outcome.postCommitFailure != null) {
              setStatus({
                label: "error",
                message: postCommitFailureText(outcome.postCommitFailure.failures),
              });
            }
          });
        },
        onCommandsUnavailable: invalidateCommandsAndOwner,
      });
    } catch (error: unknown) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setCommands(null);
        setStatus({
          label: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return () => {
      isMounted = false;
      invalidateCommandsAndOwner();
      setAuthorizationToken(null);
      cleanupConnection?.();
    };
  }, [
    dispatch,
    setActiveOwner,
    setAuthorizationToken,
    setCommands,
    setContinueThread,
    setStartupOutcome,
    setStatus,
  ]);

  return null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function startupFailureText(
  outcome: Extract<RouteConnectionStartupOutcome, { type: "failed" }>,
): string {
  const failures = [`${outcome.phase}: ${errorText(outcome.error)}`];
  if (outcome.cleanupFailure != null) {
    failures.push(
      `${outcome.cleanupFailure.phase} (${outcome.cleanupFailure.threadId}): ${errorText(outcome.cleanupFailure.error)}`,
    );
  }
  return failures.join("; ");
}

function postCommitFailureText(
  failures: NonNullable<
    Extract<RouteConnectionStartupOutcome, { type: "ready" }>["postCommitFailure"]
  >["failures"],
): string {
  return failures.map((failure) => `${failure.phase}: ${errorText(failure.error)}`).join("; ");
}
