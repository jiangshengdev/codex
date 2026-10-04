import type { ActiveThreadSessionController } from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import {
  attachBaseline,
  closedBackpressure,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  closedWithEnvelope,
  eventForThreadOwner,
  eventWithEnvelope,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { ProjectionManualReconnectReason } from "@/features/projectionIngress/projectionIngressAdapter";

/** Pause a newly attached preview session whose cursor still matches attachBaseline. */
export function pauseProjection(
  controller: ActiveThreadSessionController,
  reason: ProjectionManualReconnectReason,
  threadId: string,
): void {
  const snapshot = controller.session
    .getCollectionSnapshot()
    .members.find((member) => member.threadId === threadId)?.snapshot;
  if (snapshot?.phase !== "active") {
    throw new Error("Projection pause requires an active preview task");
  }
  const owner = { threadId, subscriptionId: snapshot.subscriptionId };
  switch (reason) {
    case "backpressure":
      controller.handleProjectionClosed(closedWithEnvelope(closedBackpressure, owner));
      return;
    case "commitChainMismatch":
    case "missingTurn":
      controller.handleProjectionEvent(
        eventForThreadOwner(
          eventWithEnvelope(
            itemStarted(
              eventItemStarted,
              "storybook-recovery-paused-commit",
              "storybook-recovery-missing-turn",
              agentMessage("storybook-recovery-paused-item", "Local synchronization sample"),
            ),
            {
              parentCommitId:
                reason === "commitChainMismatch"
                  ? "storybook-recovery-unrelated-parent"
                  : attachBaseline.snapshot.headCommitId,
            },
          ),
          owner,
        ),
      );
      return;
  }
  reason satisfies never;
}
