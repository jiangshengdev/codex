import { Toast } from "@heroui/react";
import { StrictMode } from "react";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerSendScenario, type ComposerSendPreset } from "./composerSendScenario";

export function ComposerSendPreview({ preset }: Readonly<{ preset: ComposerSendPreset }>) {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview key={preset} createScenario={() => createComposerSendScenario(preset)}>
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
