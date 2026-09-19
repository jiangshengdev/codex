import { Button, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { StrictMode, useState, useSyncExternalStore } from "react";
import { eventItemStarted } from "@/features/projection/__tests__/projectionFixtures";
import {
  eventForThreadOwner,
  itemStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { DevOnly } from "../DevOnly";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { definiteFailure, guideRefusal } from "../pendingInput/recovery/recoveryScenario";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerGuideScenario, type ComposerGuidePreset } from "./composerGuideScenario";
import { PendingInputBrowsingInitialState } from "../pendingInput/PendingInputBrowsingInitialState";

function GuideControls({
  scenario,
}: Readonly<{ scenario: ReturnType<typeof createComposerGuideScenario> }>) {
  const requests = useSyncExternalStore(scenario.steers.subscribe, scenario.steers.getSnapshot);
  const [receipts, setReceipts] = useState(scenario.initialGuideReceipts);
  return (
    <DevOnly className="grid gap-3">
      <Button
        variant="secondary"
        isDisabled={requests.length === 0}
        onPress={() => {
          const request = requests[0];
          if (request == null) return;
          request.resolve({ turnId: request.params.expectedTurnId });
          setReceipts((previous) => [...previous, request.params]);
        }}
      >
        <Trans comment="Resolve a simulated Guide request without confirming runtime acceptance">
          Simulate guide response
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={receipts.length === 0}
        onPress={() => {
          const receipt = receipts[0];
          if (receipt == null) return;
          scenario.coordinator.observeAcceptedEvent({
            replay: "live",
            notification: eventForThreadOwner(
              itemStarted(
                eventItemStarted,
                `guide-accepted-${crypto.randomUUID()}`,
                receipt.expectedTurnId,
                userMessage(
                  `guide-item-${crypto.randomUUID()}`,
                  receipt.input,
                  receipt.clientUserMessageId,
                ),
              ),
              { threadId: "thread-1", subscriptionId: "preview-subscription" },
            ),
          });
          setReceipts((previous) => previous.slice(1));
        }}
      >
        <Trans comment="Inject the runtime user-message event confirming accepted guide delivery">
          Simulate guide runtime confirmation
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={requests.length === 0}
        onPress={() => requests[0]?.reject(guideRefusal())}
      >
        <Trans comment="Reject guidance because the simulated active turn cannot be steered">
          Simulate guide refusal
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={requests.length === 0}
        onPress={() => requests[0]?.reject(definiteFailure())}
      >
        <Trans comment="Reject the simulated Guide request as definitely not accepted">
          Simulate guide failure
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={requests.length === 0}
        onPress={() => {
          const request = requests[0];
          if (request == null) return;
          request.reject(new Error("Simulated guide delivery unknown"));
          // An uncertain request can still be confirmed by a later runtime event.
          setReceipts((previous) => [...previous, request.params]);
        }}
      >
        <Trans comment="Leave delivery of the local guide request uncertain">
          Simulate guide unknown
        </Trans>
      </Button>
    </DevOnly>
  );
}

export function ComposerGuidePreview({
  preset = "empty",
}: Readonly<{ preset?: ComposerGuidePreset }>) {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview key={preset} createScenario={() => createComposerGuideScenario(preset)}>
        {(scenario) => (
          <ComposerSimulation scenario={scenario}>
            {() => (
              <>
                <GuideControls scenario={scenario} />
                {preset === "queuedLongList" ? <PendingInputBrowsingInitialState /> : null}
              </>
            )}
          </ComposerSimulation>
        )}
      </PendingInputPreview>
    </StrictMode>
  );
}
