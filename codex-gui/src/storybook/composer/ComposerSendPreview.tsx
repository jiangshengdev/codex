import { Toast } from "@heroui/react";
import { StrictMode } from "react";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerSendScenario, type ComposerSendPreset } from "./composerSendScenario";

export function ComposerSendPreview({
  preset,
  longText = false,
}: Readonly<{ preset: ComposerSendPreset; longText?: boolean }>) {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview
        key={`${preset}-${String(longText)}`}
        createScenario={() => createComposerSendScenario(preset, longText)}
      >
        {(scenario) => (
          <ComposerSimulation
            scenario={scenario}
            initialResponseTurnId={scenario.initialResponseTurnId}
          />
        )}
      </PendingInputPreview>
    </StrictMode>
  );
}
