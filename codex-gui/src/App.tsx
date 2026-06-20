import { useEffect, useState } from "react";
import { Surface } from "@heroui/react";
import { useAppDispatch } from "./app/hooks";
import { CommittedTranscriptSurface } from "./features/committedTranscriptSurface/CommittedTranscriptSurface";
import type { GuiHostStatus } from "./features/guiHost/guiHostClient";
import { startGuiHostConnection } from "./features/guiHost/guiHostClient";
import {
  ProjectionIngressAdapter,
  type ProjectionIngressOutcome,
} from "./features/projectionIngress/projectionIngressAdapter";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "./features/threadIdentity/threadIdentitySlice";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "./features/threadRuntime/threadRuntimeSlice";

function App() {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
    eventCount: 0,
    lastEventType: null,
  });

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    let launchThreadId: string | null = null;
    let projectionIngress: ProjectionIngressAdapter | null = null;
    const dispatchProjectionOutcome = (outcome: ProjectionIngressOutcome) => {
      switch (outcome.type) {
        case "attachAccepted":
          dispatch(threadRuntimeAttached(outcome.response));
          return;
        case "eventAccepted":
          dispatch(threadRuntimeEventBuffered(outcome.notification));
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
          launchThreadId = params.threadId;
          projectionIngress = new ProjectionIngressAdapter(params.threadId);
          dispatch(launchThreadIdRecorded(params.threadId));
        },
        onProjectionAttached: (response) => {
          const attachedThreadId = response.snapshot.thread.id;
          dispatch(attachedThreadIdObserved(attachedThreadId));

          if (launchThreadId !== attachedThreadId || projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleAttach(response));
        },
        onProjectionEvent: (notification) => {
          if (projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleEvent(notification));
        },
        onProjectionClosed: (notification) => {
          if (projectionIngress == null) {
            return;
          }

          dispatchProjectionOutcome(projectionIngress.handleClosed(notification));
        },
      });
    } catch (error: unknown) {
      queueMicrotask(() => {
        if (!isMounted) {
          return;
        }

        setStatus({
          label: "error",
          eventCount: 0,
          lastEventType: null,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return () => {
      isMounted = false;
      cleanupConnection?.();
    };
  }, [dispatch]);

  return (
    <main
      className="min-h-svh w-full px-4 py-6 sm:px-6 lg:px-8"
      data-gui-host-status={status.label}
    >
      <Surface className="mx-auto grid w-full max-w-6xl content-start p-4 sm:p-6" variant="default">
        <CommittedTranscriptSurface />
      </Surface>
    </main>
  );
}

export default App;
