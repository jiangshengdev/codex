import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type { CreateComposerInputQueueCoordinatorInput } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { eventItemStarted } from "@/features/projection/__tests__/projectionFixtures";
import {
  eventForThreadOwner,
  itemStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { createPendingInputScenario, manualRequests } from "../pendingInputScenario";

export type RecoveryPreset =
  | "guiding"
  | "unsent"
  | "guideAccepted"
  | "guideUnknown"
  | "priority"
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

export function createRecoveryScenario(preset: RecoveryPreset) {
  const recoveryPreset =
    preset === "unsent" || preset === "recoveryDisabled" || preset === "recovering";
  const scenario = createPendingInputScenario(
    recoveryPreset
      ? { ordinaryCount: 1, startSending: true }
      : { ordinaryCount: 3, guidingCount: preset === "combined" ? 2 : 1 },
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
  if (preset === "priority" || preset === "combined")
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
