import type { ErrorNotice } from "@/feedback/ErrorNoticeStack";
import {
  useActiveThreadSessionSnapshot,
  useAppCapabilities,
} from "@/features/appShell/AppCapabilities";
import { ConnectionTaskRecoveryNotice } from "./ConnectionTaskRecoveryNotice";
import { ProjectionRecoveryNotice } from "./ProjectionRecoveryNotice";

/** Read the current owner's recovery state directly; presentation owns no recovery queue. */
export function useCurrentTaskRecoveryNotices(): ErrorNotice[] {
  const { activeThreadSession, routeTarget, status, connectionRecovery } = useAppCapabilities();
  const snapshot = useActiveThreadSessionSnapshot();
  if (
    activeThreadSession == null ||
    routeTarget.type !== "currentTask" ||
    (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") ||
    routeTarget.threadId !== snapshot.threadId
  )
    return [];

  const notices: ErrorNotice[] = [];
  if (snapshot.connection.phase === "unavailable") {
    notices.push({
      id: `${snapshot.identity.instanceId}:connection`,
      content: (
        <ConnectionTaskRecoveryNotice
          connection={snapshot.connection}
          canRecover={status.label === "initialized" && connectionRecovery == null}
          onRecover={() => {
            void activeThreadSession.recoverConnection(snapshot.threadId, snapshot.identity);
          }}
        />
      ),
    });
  }
  if (snapshot.phase === "projectionUnavailable") {
    notices.push({
      id: `${snapshot.identity.instanceId}:projection`,
      content: (
        <ProjectionRecoveryNotice
          snapshot={snapshot}
          onRecover={() => {
            void activeThreadSession.recoverProjection(snapshot.threadId, snapshot.identity);
          }}
        />
      ),
    });
  }
  return notices;
}
