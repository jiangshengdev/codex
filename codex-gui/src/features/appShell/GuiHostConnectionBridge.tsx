import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { createStoreHook } from "react-redux";
import { useAppDispatch } from "@/app/hooks";
import type { AppStore } from "@/app/store";
import type { ContinueThread } from "@/features/appShell/AppCapabilities";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import {
  RouteConnectionStartupCoordinator,
  type RouteConnectionStartupOutcome,
} from "@/features/appShell/routeConnectionStartupCoordinator";
import {
  ThreadSwitchCoordinator,
  type ActiveOwnerPublicationReceipt,
} from "@/features/projectionCoordination/threadSwitchCoordinator";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";

const useAppStore = createStoreHook().withTypes<AppStore>();

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
  const appStore = useAppStore();
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
    let currentActiveOwner: ActiveThreadOwnerHandle | null = null;
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
    const setCurrentActiveOwner = (activeOwner: ActiveThreadOwnerHandle | null): void => {
      currentActiveOwner = activeOwner;
      setActiveOwner(activeOwner);
    };
    const publishActiveOwner = (
      activeOwner: ActiveThreadOwnerHandle,
    ): ActiveOwnerPublicationReceipt => {
      setCurrentActiveOwner(activeOwner);
      try {
        authorizationSession.commitActiveThread(activeOwner.threadId);
        return { ownerPublished: true, authorizationPersistenceError: null };
      } catch (error: unknown) {
        return { ownerPublished: true, authorizationPersistenceError: error };
      }
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
      currentActiveOwner = null;
      disposeOwnerCoordinator();
      setCommands(null);
      setStartupOutcome(null);
      setCurrentActiveOwner(null);
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
        onSkillsChanged: () => {
          currentActiveOwner?.skillCatalog.invalidate();
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
            if (outcome.type !== "ready") {
              if (outcome.type === "failed") {
                setStatus({ label: "error", message: startupFailureText(outcome) });
              }
              return;
            }
            const nextSwitchCoordinator = new ThreadSwitchCoordinator({
              activeOwner: outcome.activeOwner,
              commands,
              dispatch,
              readCommittedActiveThreadId: () => appStore.getState().threadIdentity.launchThreadId,
              publishActiveOwner,
              scheduler,
            });
            startupCoordinator = null;
            switchCoordinator = nextSwitchCoordinator;
            notificationCoordinator = nextSwitchCoordinator;
            if (outcome.activeOwner != null) {
              startupOwnsActiveOwner = false;
              setCurrentActiveOwner(outcome.activeOwner);
            }
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
    appStore,
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
