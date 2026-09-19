import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { definiteFailure } from "../pendingInput/recovery/recoveryScenario";
import { createComposerScenario } from "./composerScenario";

export type ComposerStopPreset = "running" | "requestPending" | "accepted" | "unknown" | "failed";

export function createComposerStopScenario(preset: ComposerStopPreset) {
  const scenario = createComposerScenario(undefined, "preview-active");
  if (preset !== "running") {
    scenario.coordinator.saveDraft(composerDraftCapture("Keep this draft while stopping.").draft);
    scenario.coordinator.interruptActiveTurn();
    if (preset === "accepted") scenario.interrupts.getSnapshot()[0]?.resolve({});
    if (preset === "unknown")
      scenario.interrupts.getSnapshot()[0]?.reject(new Error("Simulated stop delivery unknown"));
    if (preset === "failed") scenario.interrupts.getSnapshot()[0]?.reject(definiteFailure());
  }
  return scenario;
}
