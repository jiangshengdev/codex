import { useEffect } from "react";
import { useAppDispatch } from "@/app/hooks";
import type {
  GuiHostCommands,
  GuiHostStatus,
  LaunchParams,
} from "@/features/guiHost/guiHostClient";
import { startGuiHostConnection } from "@/features/guiHost/guiHostClient";
import {
  ProjectionIngressAdapter,
  type ProjectionIngressOutcome,
} from "@/features/projectionIngress/projectionIngressAdapter";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import {
  replayForProjectionEvent,
  snapshotReplayIndexFromTurns,
  type SnapshotReplayIndex,
  threadRuntimeAttached,
  threadRuntimeDeltaAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";

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
    let launchThreadId: string | null = null;
    let projectionIngress: ProjectionIngressAdapter | null = null;
    let snapshotReplayIndex: SnapshotReplayIndex | null = null;
    const dispatchProjectionOutcome = (outcome: ProjectionIngressOutcome) => {
      switch (outcome.type) {
        case "attachAccepted":
          dispatch(threadRuntimeAttached(outcome.response));
          return;
        case "eventAccepted":
          dispatch(
            threadRuntimeEventBuffered({
              notification: outcome.notification,
              replay:
                snapshotReplayIndex == null
                  ? "live"
                  : replayForProjectionEvent(snapshotReplayIndex, outcome.notification),
            }),
          );
          return;
        case "deltaAccepted":
          dispatch(threadRuntimeDeltaAccepted({ notification: outcome.notification }));
          return;
        case "manualReconnectRequired":
          dispatch(
            threadRuntimeManualReconnectRequired({
              reason: outcome.reason,
              threadId: outcome.threadId,
              subscriptionId: outcome.subscriptionId,
            }),
          );
          return;
        case "ignored":
          return;
      }
    };

    try {
      cleanupConnection = startGuiHostConnection({
        location: new URL(window.location.href),
        replaceState: window.history.replaceState.bind(window.history),
        onStatus: setStatus,
        onLaunchParams: (params) => {
          setLaunchParams(params);
          launchThreadId = params.threadId;
          projectionIngress = new ProjectionIngressAdapter(params.threadId);
          snapshotReplayIndex = null;
          dispatch(launchThreadIdRecorded(params.threadId));
        },
        onProjectionAttached: (response) => {
          const attachedThreadId = response.snapshot.thread.id;
          dispatch(attachedThreadIdObserved(attachedThreadId));

          if (launchThreadId !== attachedThreadId || projectionIngress == null) {
            return;
          }

          const outcome = projectionIngress.handleAttach(response);
          if (outcome.type === "attachAccepted") {
            snapshotReplayIndex = snapshotReplayIndexFromTurns(
              outcome.response.snapshot.thread.turns,
            );
          }

          dispatchProjectionOutcome(outcome);
        },
        onProjectionEvent: (notification) => {
          if (projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleEvent(notification));
        },
        onProjectionDelta: (notification) => {
          if (projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleDelta(notification));
        },
        onProjectionClosed: (notification) => {
          if (projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleClosed(notification));
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
      cleanupConnection?.();
    };
  }, [dispatch, setCommands, setLaunchParams, setStatus]);

  return null;
}
