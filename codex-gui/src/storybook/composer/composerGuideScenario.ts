import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { definiteFailure, guideRefusal } from "./pendingInput/recovery/recoveryScenario";
import { createComposerScenario } from "./composerScenario";
import { mixedMessageText } from "../shared/mixedMessageText";

export type ComposerGuidePreset =
  | "empty"
  | "withInput"
  | "idle"
  | "ordinaryQueue"
  | "requestPending"
  | "runtimePending"
  | "unavailable"
  | "failed"
  | "queuedLongList"
  | "unknown";

export function createComposerGuideScenario(preset: ComposerGuidePreset) {
  const scenario = createComposerScenario(undefined, preset === "idle" ? null : "preview-active");
  if (preset === "withInput" || preset === "idle") {
    scenario.coordinator.saveDraft(
      composerDraftCapture("Review this fictional running turn.").draft,
    );
  }
  if (preset === "ordinaryQueue") {
    scenario.coordinator.submit(composerDraftCapture("Promote this ordinary queued message."));
  } else if (preset === "queuedLongList") {
    // One issuing request; remaining guides stay in the real serial queue.
    for (let index = 1; index <= 23; index++)
      scenario.coordinator.submitSteer(
        composerDraftCapture(mixedMessageText("Guide message", index)),
      );
  } else if (preset !== "empty" && preset !== "withInput" && preset !== "idle")
    scenario.coordinator.submitSteer(composerDraftCapture("Guide this fictional change."));
  const initialGuideReceipts: ReturnType<typeof scenario.steers.getSnapshot>[number]["params"][] =
    [];
  if (preset === "runtimePending" || preset === "unknown") {
    const request = scenario.steers.getSnapshot()[0];
    if (request != null) {
      if (preset === "runtimePending") request.resolve({ turnId: request.params.expectedTurnId });
      else request.reject(new Error("Simulated guide delivery unknown"));
      // Both accepted and uncertain requests can receive a later runtime confirmation.
      initialGuideReceipts.push(request.params);
    }
  }
  if (preset === "unavailable") scenario.steers.getSnapshot()[0]?.reject(guideRefusal());
  if (preset === "failed") scenario.steers.getSnapshot()[0]?.reject(definiteFailure());
  return { ...scenario, initialGuideReceipts };
}
