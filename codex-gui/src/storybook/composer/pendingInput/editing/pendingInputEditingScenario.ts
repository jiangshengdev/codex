import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import { createPendingInputScenario } from "../pendingInputScenario";

export function createPendingInputEditingScenario({
  guiding = false,
  sendingConflict = false,
  mixedText = false,
}: Readonly<{ guiding?: boolean; sendingConflict?: boolean; mixedText?: boolean }> = {}) {
  const scenario = createPendingInputScenario({
    ordinaryCount: guiding ? 0 : mixedText ? 3 : 1,
    guidingCount: guiding ? 2 : 0,
    mixedText,
  });
  let loseEdit = false;
  const role: ActiveThreadComposerRole = {
    ...scenario.role,
    beginPendingInputEdit: (...args) => {
      // A bounded management-result fixture, not a simulation of queue dispatch.
      if (sendingConflict)
        return {
          type: "notManageable",
          scope: "liveOwner",
          revision: scenario.coordinator.getSnapshot().detailRevision,
        };
      const result = scenario.role.beginPendingInputEdit(...args);
      if (result.type !== "begun") return result;
      return {
        ...result,
        reservation: {
          cancel: result.reservation.cancel,
          save: (capture) => {
            if (!loseEdit) return result.reservation.save(capture);
            loseEdit = false;
            // Release the real reservation before injecting the lost-session result.
            result.reservation.cancel();
            return {
              type: "unavailable",
              scope: "liveOwner",
              reason: "sessionInvalidated",
              revision: scenario.coordinator.getSnapshot().detailRevision,
            };
          },
        },
      };
    },
  };
  return {
    ...scenario,
    role,
    guiding,
    sendingConflict,
    loseEditingSession: () => {
      loseEdit = true;
    },
  };
}
