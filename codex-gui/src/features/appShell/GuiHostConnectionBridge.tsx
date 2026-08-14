import { useEffect } from "react";
import { useAppDispatch } from "@/app/hooks";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import { ProjectionApplicationCoordinator } from "@/features/projectionCoordination/projectionApplicationCoordinator";

export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  setLaunchParams: (params: BrowserLaunchParams | null) => void;
  setComposerInputQueueController: (controller: ComposerInputQueueCoordinator | null) => void;
};

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  setLaunchParams,
  setComposerInputQueueController,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    let launchThreadId: string | null = null;
    let initialActiveTurnId: string | null | undefined;
    let queueCoordinator: ComposerInputQueueCoordinator | null = null;
    const coordinator = new ProjectionApplicationCoordinator({
      dispatch,
      scheduler: {
        requestFrame: (callback) => window.requestAnimationFrame(callback),
        cancelFrame: (frameId) => {
          window.cancelAnimationFrame(frameId);
        },
      },
      acceptedEventSink: (payload) => {
        queueCoordinator?.observeAcceptedEvent(payload);
      },
    });

    try {
      cleanupConnection = startGuiHostConnection({
        location: new URL(window.location.href),
        replaceState: window.history.replaceState.bind(window.history),
        onStatus: setStatus,
        onLaunchParams: (params) => {
          setLaunchParams(params);
          launchThreadId = params.threadId;
          coordinator.handleLaunchThread(params.threadId);
        },
        onProjectionAttached: (response) => {
          coordinator.handleProjectionAttached(response);
          if (initialActiveTurnId === undefined && response.snapshot.thread.id === launchThreadId) {
            initialActiveTurnId =
              response.snapshot.thread.turns
                .toReversed()
                .find((turn) => turn.status === "inProgress")?.id ?? null;
          }
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
        onCommandsReady: (commands) => {
          setCommands(commands);
          if (
            queueCoordinator == null &&
            launchThreadId != null &&
            initialActiveTurnId !== undefined
          ) {
            queueCoordinator = createComposerInputQueueCoordinator({
              threadId: launchThreadId,
              activeTurnId: initialActiveTurnId,
              startTurn: commands.startTurn,
            });
            setComposerInputQueueController(queueCoordinator);
          }
        },
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
      setComposerInputQueueController(null);
      queueCoordinator?.dispose();
      coordinator.dispose();
      cleanupConnection?.();
    };
  }, [dispatch, setCommands, setComposerInputQueueController, setLaunchParams, setStatus]);

  return null;
}
