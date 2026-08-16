import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useAppDispatch } from "@/app/hooks";
import type { ContinueThread } from "@/features/appShell/AppCapabilities";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import { ProjectionApplicationCoordinator } from "@/features/projectionCoordination/projectionApplicationCoordinator";
import {
  ThreadSwitchCoordinator,
  type ActiveThreadOwnerHandle,
} from "@/features/projectionCoordination/threadSwitchCoordinator";

export type GuiHostConnectionBridgeProps = {
  setStatus: (status: GuiHostStatus) => void;
  setCommands: (commands: GuiHostCommands | null) => void;
  setLaunchParams: Dispatch<SetStateAction<BrowserLaunchParams | null>>;
  setActiveOwner: (activeOwner: ActiveThreadOwnerHandle | null) => void;
  setContinueThread: Dispatch<SetStateAction<ContinueThread | null>>;
};

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  setLaunchParams,
  setActiveOwner,
  setContinueThread,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    let launchThreadId: string | null = null;
    let initialAttachResponse:
      | Parameters<ProjectionApplicationCoordinator["handleProjectionAttached"]>[0]
      | null = null;
    let readyCommands: GuiHostCommands | null = null;
    let queueCoordinator: ComposerInputQueueCoordinator | null = null;
    let switchCoordinator: ThreadSwitchCoordinator | null = null;
    const scheduler = {
      requestFrame: (callback: () => void) => window.requestAnimationFrame(callback),
      cancelFrame: (frameId: number) => {
        window.cancelAnimationFrame(frameId);
      },
    };
    const initialProjectionOwner = new ProjectionApplicationCoordinator({
      dispatch,
      scheduler,
      acceptedEventSink: (payload) => {
        queueCoordinator?.observeAcceptedEvent(payload);
      },
    });
    const publishActiveOwner = (activeOwner: ActiveThreadOwnerHandle): void => {
      setActiveOwner(activeOwner);
      setLaunchParams((params) =>
        params == null ? null : { ...params, threadId: activeOwner.threadId },
      );
    };
    const initializeActiveOwner = (): void => {
      if (
        switchCoordinator != null ||
        launchThreadId == null ||
        initialAttachResponse == null ||
        readyCommands == null
      ) {
        return;
      }
      queueCoordinator = createComposerInputQueueCoordinator({
        threadId: launchThreadId,
        activeTurnId:
          initialAttachResponse.snapshot.thread.turns
            .toReversed()
            .find((turn) => turn.status === "inProgress")?.id ?? null,
        startTurn: readyCommands.startTurn,
      });
      const activeOwner: ActiveThreadOwnerHandle = {
        threadId: launchThreadId,
        subscriptionId: initialAttachResponse.subscriptionId,
        projectionOwner: initialProjectionOwner,
        queueCoordinator,
      };
      const nextSwitchCoordinator = new ThreadSwitchCoordinator({
        activeOwner,
        commands: readyCommands,
        dispatch,
        publishActiveOwner,
        scheduler,
      });
      switchCoordinator = nextSwitchCoordinator;
      setActiveOwner(activeOwner);
      setContinueThread(() => nextSwitchCoordinator.continueThread);
    };

    try {
      cleanupConnection = startGuiHostConnection({
        location: new URL(window.location.href),
        replaceState: window.history.replaceState.bind(window.history),
        onStatus: setStatus,
        onLaunchParams: (params) => {
          setLaunchParams(params);
          launchThreadId = params.threadId;
          initialProjectionOwner.handleLaunchThread(params.threadId);
        },
        onProjectionAttached: (response) => {
          initialProjectionOwner.handleProjectionAttached(response);
          if (initialAttachResponse == null && response.snapshot.thread.id === launchThreadId) {
            initialAttachResponse = response;
            initializeActiveOwner();
          }
        },
        onProjectionEvent: (notification) => {
          (switchCoordinator ?? initialProjectionOwner).handleProjectionEvent(notification);
        },
        onProjectionDelta: (notification) => {
          (switchCoordinator ?? initialProjectionOwner).handleProjectionDelta(notification);
        },
        onProjectionClosed: (notification) => {
          (switchCoordinator ?? initialProjectionOwner).handleProjectionClosed(notification);
        },
        onCommandsReady: (commands) => {
          readyCommands = commands;
          setCommands(commands);
          initializeActiveOwner();
        },
        onCommandsUnavailable: () => {
          readyCommands = null;
          setCommands(null);
          setContinueThread(null);
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
      setActiveOwner(null);
      setContinueThread(null);
      if (switchCoordinator == null) {
        queueCoordinator?.dispose();
        initialProjectionOwner.dispose();
      } else {
        switchCoordinator.dispose();
      }
      cleanupConnection?.();
    };
  }, [dispatch, setActiveOwner, setCommands, setContinueThread, setLaunchParams, setStatus]);

  return null;
}
