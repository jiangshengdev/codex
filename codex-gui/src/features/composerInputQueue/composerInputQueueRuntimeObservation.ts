import type { ActiveThreadProjectionAcceptedEvent } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import type { RuntimeObservation } from "./composerInputQueue";

export function runtimeObservationFromAcceptedProjectionEvent(
  payload: Readonly<ActiveThreadProjectionAcceptedEvent>,
): RuntimeObservation | null {
  if (payload.replay !== "live") {
    return null;
  }

  const { commitId, event } = payload.notification;
  switch (event.type) {
    case "turnStarted":
      return { type: "turnStarted", turnId: event.notification.turn.id, commitId };
    case "turnCompleted": {
      const { id: turnId, status } = event.notification.turn;
      return status === "inProgress" ? null : { type: "turnCompleted", turnId, status, commitId };
    }
    case "itemStarted": {
      const { item, turnId } = event.notification;
      return item.type === "userMessage" && item.clientId != null
        ? { type: "userMessageCommitted", clientId: item.clientId, turnId, commitId }
        : null;
    }
    case "itemCompleted":
    case "tokenUsageUpdated":
      return null;
  }
  event satisfies never;
}
