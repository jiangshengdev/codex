import { useEffect, useState } from "react";
import { useAppDispatch } from "./app/hooks";
import type { GuiHostStatus } from "./features/guiHost/guiHostClient";
import { startGuiHostConnection } from "./features/guiHost/guiHostClient";
import { projectionAttached, projectionEventReceived } from "./features/projection/projectionSlice";
import { ProjectionIngressAdapter } from "./features/projectionIngress/projectionIngressAdapter";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "./features/threadIdentity/threadIdentitySlice";

function App() {
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
    eventCount: 0,
    lastEventType: null,
  });
  const isAttached = status.label === "attached" || status.label === "received event";

  useEffect(() => {
    let isMounted = true;
    let cleanupConnection: (() => void) | undefined;
    let launchThreadId: string | null = null;
    let projectionIngress: ProjectionIngressAdapter | null = null;

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

          const outcome = projectionIngress.handleAttach(response);
          if (outcome.type === "attachAccepted") {
            dispatch(projectionAttached(outcome.response));
          }
        },
        onProjectionEvent: (notification) => {
          if (projectionIngress == null) {
            return;
          }

          const outcome = projectionIngress.handleEvent(notification);
          if (outcome.type === "eventAccepted") {
            dispatch(projectionEventReceived(outcome.notification));
          }
        },
        onProjectionClosed: (notification) => {
          projectionIngress?.handleClosed(notification);
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
      className="grid min-h-svh place-items-center bg-background px-6 py-10 text-foreground"
      data-gui-host-status={status.label}
    >
      <section className="grid w-full max-w-sm gap-3 text-sm">
        <h1 className="text-base font-semibold">GUI host</h1>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-foreground/60">status</dt>
          <dd aria-live="polite">
            {status.label === "error" ? `error: ${status.message}` : status.label}
          </dd>
          <dt className="text-foreground/60">attached</dt>
          <dd>{isAttached ? "yes" : "no"}</dd>
          <dt className="text-foreground/60">events</dt>
          <dd>{status.eventCount}</dd>
          <dt className="text-foreground/60">last event</dt>
          <dd>{status.lastEventType ?? "none"}</dd>
        </dl>
      </section>
    </main>
  );
}

export default App;
