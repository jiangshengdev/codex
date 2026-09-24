import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { CreateComposerInputQueueCoordinatorInput } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { eventItemStarted } from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  eventForThreadOwner,
  itemStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { createPendingInputScenario, manualRequests } from "../pendingInputScenario";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { mixedMessageText } from "../../../shared/mixedMessageText";

export type RecoveryPreset =
  | "guiding"
  | "unsent"
  | "guideAccepted"
  | "guideUnknown"
  | "priority"
  | "priorityOnly"
  | "allQueues"
  | "recoveryDisabled"
  | "recovering"
  | "combined";

export function definiteFailure() {
  return new GuiHostCommandError({
    source: "rpc",
    delivery: "definitelyNotAccepted",
    error: new Error("Simulated definite rejection"),
  });
}

export function guideRefusal() {
  return new GuiHostCommandError({
    source: "rpc",
    delivery: "definitelyNotAccepted",
    error: new Error("Simulated guide refusal"),
    rpcError: {
      code: -32000,
      message: "cannot steer",
      data: {
        message: "cannot steer",
        codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
        additionalDetails: null,
      },
    },
  });
}

export function createRecoveryScenario(
  preset: RecoveryPreset,
  mixedText = false,
  allQueuesGuidingCount = 1,
) {
  const recoveryPreset =
    preset === "unsent" || preset === "recoveryDisabled" || preset === "recovering";
  const scenario = createPendingInputScenario(
    recoveryPreset
      ? { ordinaryCount: mixedText ? 23 : 1, startSending: true, mixedText }
      : {
          ordinaryCount: preset === "priorityOnly" ? 0 : mixedText ? 23 : 3,
          guidingCount: mixedText ? 23 : preset === "combined" ? 2 : 1,
          mixedText,
        },
  );
  const guideReceipts = manualRequests<
    Parameters<CreateComposerInputQueueCoordinatorInput["steerTurn"]>[0],
    undefined
  >();
  const acceptGuide = () => {
    const request = scenario.steers.getSnapshot()[0];
    if (request == null) return;
    request.resolve({ turnId: request.params.expectedTurnId });
    void guideReceipts.issue(request.params);
  };
  const confirmGuide = () => {
    const receipt = guideReceipts.getSnapshot()[0];
    if (receipt == null) return;
    scenario.coordinator.observeAcceptedEvent({
      replay: "live",
      notification: eventForThreadOwner(
        itemStarted(
          eventItemStarted,
          `accepted-${String(receipt.params.clientUserMessageId)}`,
          receipt.params.expectedTurnId,
          userMessage(
            `item-${String(receipt.params.clientUserMessageId)}`,
            receipt.params.input,
            receipt.params.clientUserMessageId,
          ),
        ),
        { threadId: "thread-1", subscriptionId: "preview-subscription" },
      ),
    });
    receipt.resolve(undefined);
  };

  // Freeze a real, synchronous recovery notification for visual inspection only.
  // All delivery and management transitions remain owned by the coordinator.
  const liveSnapshot = scenario.coordinator.getSnapshot;
  const changes = createListenerSet();
  let frozen: ReturnType<typeof liveSnapshot> | null = null;
  const unsubscribe = scenario.coordinator.subscribe(() => {
    const snapshot = liveSnapshot();
    if (snapshot.isRecovering) frozen = snapshot;
    changes.notify();
  });
  const display = {
    getSnapshot: () => frozen ?? liveSnapshot(),
    subscribe: (listener: () => void) => changes.subscribe(listener),
  };
  const releaseRecoveryDisplay = () => {
    frozen = null;
    changes.notify();
  };

  if (recoveryPreset) {
    scenario.starts.getSnapshot()[0]?.reject(definiteFailure());
    if (preset === "recovering") queueMicrotask(() => scenario.coordinator.recover());
  }
  if (preset === "guideAccepted") acceptGuide();
  if (preset === "guideUnknown")
    scenario.steers.getSnapshot()[0]?.reject(new Error("Simulated delivery unknown"));
  if (preset === "allQueues") {
    const stop = scenario.coordinator.subscribe(() => {
      if (scenario.coordinator.getSnapshot().rejectedSteers.length === 0) return;
      stop();
      queueMicrotask(() => {
        // A later runtime turn can receive new guidance while rejected guidance awaits sending.
        scenario.coordinator.setProjectionUnavailable(true);
        const result = scenario.coordinator.reconcileProjection(
          [{ ...baseTurn("preview-next-active"), status: "inProgress" }],
          [],
        );
        if (result.type === "blocked") throw new Error(result.error);
        scenario.coordinator.setProjectionUnavailable(false);
        for (let index = 1; index <= allQueuesGuidingCount; index++) {
          scenario.coordinator.submitSteer(
            composerDraftCapture(
              allQueuesGuidingCount === 1
                ? "Guidance for the new active turn"
                : mixedText
                  ? mixedMessageText("Guidance for the new active turn", index)
                  : `Guidance for the new active turn ${String(index)}`,
            ),
          );
        }
      });
    });
  }
  if (
    preset === "priority" ||
    preset === "combined" ||
    preset === "priorityOnly" ||
    preset === "allQueues"
  )
    scenario.steers.getSnapshot()[0]?.reject(guideRefusal());
  return {
    ...scenario,
    display,
    guideReceipts,
    acceptGuide,
    confirmGuide,
    releaseRecoveryDisplay,
    dispose: () => {
      unsubscribe();
      changes.clear();
      scenario.dispose();
    },
  };
}

export type RecoveryScenario = ReturnType<typeof createRecoveryScenario>;
