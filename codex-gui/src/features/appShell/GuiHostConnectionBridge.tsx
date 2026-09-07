import { useEffect, useRef, useState } from "react";
import { useAppDispatch } from "@/app/hooks";
import {
  createActiveThreadSession,
  type ActiveThreadSession,
  type ActiveThreadSessionController,
} from "@/features/activeThreadSession/activeThreadSession";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import { errorText } from "@/text/errorText";
import type { NewSessionOwner } from "@/features/newSession/newSessionOwner";

export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  startupTarget: GuiRouteTarget;
  setAuthorizationToken: (token: string | null) => void;
  setActiveThreadSession: (session: ActiveThreadSession | null) => void;
  newSessionOwner: NewSessionOwner;
};

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  startupTarget,
  setAuthorizationToken,
  setActiveThreadSession,
  newSessionOwner,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();
  const frozenStartupTarget = useRef(startupTarget);
  const [pageSessionRevision, setPageSessionRevision] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    let activeThreadController: ActiveThreadSessionController | null = null;
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
      };
    }
    setAuthorizationToken(authorizationSession.getSnapshot().token);
    const suspendRestoredQueue = (): void => {
      activeThreadController?.suspendRestoredQueue();
    };
    const handlePageShow = (event: PageTransitionEvent): void => {
      if (!event.persisted) return;
      suspendRestoredQueue();
      setPageSessionRevision((revision) => revision + 1);
    };
    window.addEventListener("pagehide", suspendRestoredQueue);
    window.addEventListener("pageshow", handlePageShow);

    const connectionUnavailable = (): void => {
      newSessionOwner.setConnection(null);
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
          const controller = createActiveThreadSession({
            authorizationSession,
            commands,
            dispatch,
            scheduler,
            persistence: { authorizationContext: authorizationSession.getPersistenceContext() },
          });
          activeThreadController = controller;
          newSessionOwner.setConnection({ commands, session: controller.session });
          setActiveThreadSession(controller.session);
          const target = frozenStartupTarget.current;
          void controller.activateRecoveryThread(
            target.type === "currentTask" ? target.threadId : undefined,
          );
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
      newSessionOwner.setConnection(null);
      window.removeEventListener("pagehide", suspendRestoredQueue);
      window.removeEventListener("pageshow", handlePageShow);
      activeThreadController?.dispose();
      activeThreadController = null;
      setCommands(null);
      setAuthorizationToken(null);
      setActiveThreadSession(null);
      cleanupConnection?.();
    };
  }, [
    dispatch,
    newSessionOwner,
    pageSessionRevision,
    setActiveThreadSession,
    setAuthorizationToken,
    setCommands,
    setStatus,
  ]);

  return null;
}
