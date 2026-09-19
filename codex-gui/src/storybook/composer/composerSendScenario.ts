import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { baseTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import { definiteFailure } from "../pendingInput/recovery/recoveryScenario";
import { createComposerScenario } from "./composerScenario";
import { createComposerUnknownMultipleScenario } from "./composerUnknownMultipleScenario";
import { composerLongSendText } from "./composerLongSendText";

export type ComposerSendPreset =
  | "requestPending"
  | "runtimePending"
  | "failed"
  | "unknown"
  | "unknownMultiple";

export function createComposerSendScenario(preset: ComposerSendPreset, longText = false) {
  if (preset === "unknownMultiple") {
    return { ...createComposerUnknownMultipleScenario(longText), initialResponseTurnId: null };
  }
  const scenario = createComposerScenario();
  scenario.coordinator.submit(
    composerDraftCapture(longText ? composerLongSendText : "Review this fictional send."),
  );
  const initialResponseTurnId = preset === "runtimePending" ? "preview-send-accepted" : null;
  if (initialResponseTurnId != null) {
    scenario.starts.getSnapshot()[0]?.resolve({
      turn: { ...baseTurn(initialResponseTurnId), status: "inProgress" },
    });
  }
  if (preset === "failed") scenario.starts.getSnapshot()[0]?.reject(definiteFailure());
  if (preset === "unknown")
    scenario.starts.getSnapshot()[0]?.reject(new Error("Simulated delivery unknown"));
  return { ...scenario, initialResponseTurnId };
}
