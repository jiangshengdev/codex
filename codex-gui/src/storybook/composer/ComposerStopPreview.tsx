import { Button, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { StrictMode, useSyncExternalStore } from "react";
import { DevOnly } from "../DevOnly";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { definiteFailure } from "../pendingInput/recovery/recoveryScenario";
import { ComposerSimulation } from "./ComposerPreview";
import type { ComposerScenario } from "./composerScenario";
import { createComposerStopScenario, type ComposerStopPreset } from "./composerStopScenario";

function StopControls({ scenario }: Readonly<{ scenario: ComposerScenario }>) {
  const requests = useSyncExternalStore(
    scenario.interrupts.subscribe,
    scenario.interrupts.getSnapshot,
  );
  return (
    <DevOnly className="grid gap-3">
      <Button
        variant="secondary"
        isDisabled={requests.length === 0}
        onPress={() => requests[0]?.resolve({})}
      >
        <Trans comment="Accept the simulated stop request without ending the running turn">
          Simulate stop response
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={requests.length === 0}
        onPress={() => requests[0]?.reject(definiteFailure())}
      >
        <Trans comment="Reject the simulated stop request as definitely not accepted">
          Simulate stop failure
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={requests.length === 0}
        onPress={() => requests[0]?.reject(new Error("Simulated stop delivery unknown"))}
      >
        <Trans comment="Leave acceptance of the simulated stop request uncertain while waiting for a runtime terminal event">
          Simulate stop unknown
        </Trans>
      </Button>
    </DevOnly>
  );
}

export function ComposerStopPreview({
  preset = "running",
}: Readonly<{ preset?: ComposerStopPreset }>) {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview key={preset} createScenario={() => createComposerStopScenario(preset)}>
        {(scenario) => (
          <ComposerSimulation scenario={scenario} interruptOnCompletion>
            {() => <StopControls scenario={scenario} />}
          </ComposerSimulation>
        )}
      </PendingInputPreview>
    </StrictMode>
  );
}
