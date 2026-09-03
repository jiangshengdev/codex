import { useLingui } from "@lingui/react/macro";
import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { ThreadHistoryDetailContent } from "./ThreadHistoryDetailContent";
import {
  initialThreadHistoryDetailState,
  ThreadHistoryDetailOwner,
  type ThreadHistoryDetailState,
} from "./threadHistoryDetailOwner";
import { useStrictModeSafeOwner } from "./useStrictModeSafeOwner";

type RetainedThreadHistoryDetailCapability = Readonly<{
  readThread: GuiHostCommands["readThread"];
}>;

export function ThreadHistoryDetailPage() {
  const { threadId } = useParams({ from: "/app/history/$threadId" });
  const { t } = useLingui();
  const { activeThreadSession, authorizationToken, commands, routeTarget, status } =
    useAppCapabilities();
  const activateThread = activeThreadSession?.activate ?? null;
  const [retainedCapability, setRetainedCapability] =
    useState<RetainedThreadHistoryDetailCapability | null>(() =>
      commands == null ? null : { readThread: commands.readThread },
    );

  useEffect(() => {
    if (commands == null) {
      return;
    }

    let isCurrent = true;
    queueMicrotask(() => {
      if (isCurrent) {
        setRetainedCapability((retained) => retained ?? { readThread: commands.readThread });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [commands]);

  const unavailableState: ThreadHistoryDetailState =
    status.label === "error"
      ? { type: "error", error: status.message }
      : status.label === "closed"
        ? { type: "error", error: t`The task connection was closed.` }
        : initialThreadHistoryDetailState;

  return (
    <main className="app-shell-content-boundary grid min-h-0 flex-1 content-start gap-6 py-6">
      {retainedCapability == null ? (
        <ThreadHistoryDetailContent
          authorizationToken={authorizationToken}
          activateThread={activateThread}
          retry={null}
          routeTarget={routeTarget}
          state={unavailableState}
          threadId={threadId}
        />
      ) : (
        <ThreadHistoryDetailOwnerBound
          authorizationToken={authorizationToken}
          activateThread={activateThread}
          readThread={retainedCapability.readThread}
          routeTarget={routeTarget}
          threadId={threadId}
        />
      )}
    </main>
  );
}

type ThreadHistoryDetailOwnerBoundProps = Readonly<{
  activateThread: ActiveThreadSession["activate"] | null;
  authorizationToken: string | null;
  readThread: GuiHostCommands["readThread"];
  routeTarget: GuiRouteTarget;
  threadId: string;
}>;

function ThreadHistoryDetailOwnerBound({
  activateThread,
  authorizationToken,
  readThread,
  routeTarget,
  threadId,
}: ThreadHistoryDetailOwnerBoundProps) {
  const owner = useMemo(
    () => new ThreadHistoryDetailOwner({ threadId, readThread }),
    [readThread, threadId],
  );
  const state = useStrictModeSafeOwner(owner);

  return (
    <ThreadHistoryDetailContent
      activateThread={activateThread}
      authorizationToken={authorizationToken}
      retry={owner.retry}
      routeTarget={routeTarget}
      state={state}
      threadId={threadId}
    />
  );
}
