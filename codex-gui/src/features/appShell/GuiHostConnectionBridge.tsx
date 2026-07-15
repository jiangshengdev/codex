import { useEffect } from "react";
import { useAppDispatch } from "@/app/hooks";
import type {
  GuiHostCommands,
  GuiHostStatus,
  LaunchParams,
} from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import { ProjectionApplicationCoordinator } from "@/features/projectionCoordination/projectionApplicationCoordinator";

export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  setLaunchParams: (params: LaunchParams | null) => void;
};

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  setLaunchParams,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    const coordinator = new ProjectionApplicationCoordinator({
      dispatch,
      scheduler: {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (frameId) => {
          window.cancelAnimationFrame(frameId);
        },
      },
    });

    try {
      cleanupConnection = startGuiHostConnection({
        location: new URL(window.location.href),
        replaceState: window.history.replaceState.bind(window.history),
        onStatus: setStatus,
        onLaunchParams: (params) => {
          setLaunchParams(params);
          coordinator.handleLaunchThread(params.threadId);
        },
        onProjectionAttached: (response) => {
          coordinator.handleProjectionAttached(response);
        },
        onProjectionEvent: (notification) => {
          coordinator.handleProjectionEvent(notification);
        },
        onProjectionDelta: (notification) => {
          coordinator.handleProjectionDelta(notification);
        },
        onProjectionClosed: (notification) => {
          coordinator.handleProjectionClosed(notification);
        },
        onCommandsReady: setCommands,
        onCommandsUnavailable: () => {
          setCommands(null);
        },
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
      setCommands(null);
      setLaunchParams(null);
      coordinator.dispose();
      cleanupConnection?.();
    };
  }, [dispatch, setCommands, setLaunchParams, setStatus]);

  return null;
}
