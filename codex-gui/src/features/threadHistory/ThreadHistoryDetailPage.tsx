import { Trans } from "@lingui/react/macro";
import { useParams } from "@tanstack/react-router";
import { useLayoutEffect, useMemo } from "react";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import { ThreadHistoryDetailContent } from "./ThreadHistoryDetailContent";
import {
  initialThreadHistoryDetailState,
  ThreadHistoryDetailOwner,
} from "./threadHistoryDetailOwner";
import { useStrictModeSafeOwner } from "./useStrictModeSafeOwner";

export function ThreadHistoryDetailPage() {
  const { threadId } = useParams({ from: "/app/history/$threadId" });
  const { activeThreadSession, authorizationToken, commands, routeTarget, status } =
    useAppCapabilities();
  const activateThread = activeThreadSession?.activate ?? null;
  const readThread = commands?.readThread ?? null;
  const owner = useMemo(() => new ThreadHistoryDetailOwner({ threadId }), [threadId]);
  useLayoutEffect(() => {
    owner.setReadThread(readThread);
  }, [owner, readThread]);
  const state = useStrictModeSafeOwner(owner);

  return (
    <main className="task-reading-boundary grid min-h-0 flex-1 content-start gap-4">
      {state.type === "waitingForConnection" ? (
        status.label === "error" || status.label === "closed" ? (
          <p className="pt-3 text-sm text-muted">
            <Trans>Task history is unavailable until the connection is restored.</Trans>
          </p>
        ) : (
          <ThreadHistoryDetailContent
            authorizationToken={authorizationToken}
            activateThread={activateThread}
            retry={null}
            routeTarget={routeTarget}
            state={initialThreadHistoryDetailState}
            threadId={threadId}
          />
        )
      ) : (
        <ThreadHistoryDetailContent
          authorizationToken={authorizationToken}
          activateThread={activateThread}
          retry={readThread == null ? null : owner.retry}
          routeTarget={routeTarget}
          state={state}
          threadId={threadId}
        />
      )}
    </main>
  );
}
