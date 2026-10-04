import type {
  ActiveThreadProjectionAcceptedEvent,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjectionFacts";
import type { ActiveThreadSessionIdentity } from "@/features/activeThreadSession/activeThreadSessionIdentity";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";

export function createTranscriptReadModelActions(identity: ActiveThreadSessionIdentity) {
  let sessionRevision = 0;
  const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
    activeThreadReadModelTransitionApplied({ identity, sessionRevision: ++sessionRevision, facts });

  return {
    readModelAction,
    threadRuntimeAttached: (
      response: Extract<
        ActiveThreadProjectionReadModelFact,
        { type: "baselineAttached" }
      >["response"],
    ) => readModelAction({ type: "baselineAttached", response }),
    threadRuntimeEventBuffered: (payload: ActiveThreadProjectionAcceptedEvent) =>
      readModelAction({ type: "eventAccepted", payload }),
    threadRuntimeDeltasAccepted: ({
      notifications,
    }: Pick<
      Extract<ActiveThreadProjectionReadModelFact, { type: "deltasAccepted" }>,
      "notifications"
    >) => readModelAction({ type: "deltasAccepted", notifications }),
    threadRuntimeManualReconnectRequired: (
      input: Omit<
        Extract<ActiveThreadProjectionReadModelFact, { type: "projectionUnavailable" }>,
        "type"
      >,
    ) => readModelAction({ type: "projectionUnavailable", ...input }),
  };
}
