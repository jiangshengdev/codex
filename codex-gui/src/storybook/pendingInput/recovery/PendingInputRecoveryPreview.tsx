import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useRef, useState, useSyncExternalStore } from "react";
import { baseTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import { PendingInputPreview, PendingInputScenarioView } from "../PendingInputScenarioView";
import {
  createRecoveryScenario,
  definiteFailure,
  guideRefusal,
  type RecoveryPreset,
  type RecoveryScenario,
} from "./recoveryScenario";
import { DevOnly } from "../../DevOnly";

function GuideControls({ scenario }: Readonly<{ scenario: RecoveryScenario }>) {
  const requests = useSyncExternalStore(scenario.steers.subscribe, scenario.steers.getSnapshot);
  const receipts = useSyncExternalStore(
    scenario.guideReceipts.subscribe,
    scenario.guideReceipts.getSnapshot,
  );
  return (
    <DevOnly>
      <Button variant="secondary" isDisabled={requests.length === 0} onPress={scenario.acceptGuide}>
        <Trans comment="Resolve the local guide request as accepted by the active turn">
          Simulate guide success
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={receipts.length === 0}
        onPress={scenario.confirmGuide}
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
        onPress={() => requests[0]?.reject(new Error("Simulated delivery unknown"))}
      >
        <Trans comment="Leave delivery of the local guide request uncertain">
          Simulate guide unknown
        </Trans>
      </Button>
    </DevOnly>
  );
}

function RecoveryControls({
  scenario,
  preset,
}: Readonly<{ scenario: RecoveryScenario; preset: RecoveryPreset }>) {
  const requests = useSyncExternalStore(scenario.starts.subscribe, scenario.starts.getSnapshot);
  const snapshot = useSyncExternalStore(scenario.display.subscribe, scenario.display.getSnapshot);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(() =>
    preset === "unsent" || preset === "recovering" || preset === "recoveryDisabled"
      ? null
      : "preview-active",
  );
  const sequence = useRef(0);
  return (
    <DevOnly>
      {snapshot.isRecovering && (
        <>
          <p className="text-sm text-muted">
            <Trans>
              This preview freezes the brief recovery notification. Release it to inspect the
              pending send request.
            </Trans>
          </p>
          <Button
            variant="secondary"
            isDisabled={!snapshot.isRecovering}
            onPress={scenario.releaseRecoveryDisplay}
          >
            <Trans comment="Stop freezing the captured recovery notification and show live coordinator state">
              Release recovery display
            </Trans>
          </Button>
        </>
      )}
      <Button
        variant="secondary"
        isDisabled={
          activeTurnId == null || requests.length > 0 || responseId != null || snapshot.isRecovering
        }
        onPress={() => {
          if (activeTurnId == null) return;
          scenario.completeTurn(activeTurnId);
          setActiveTurnId(null);
        }}
      >
        <Trans comment="Inject the terminal event for the current simulated assistant turn; queued input may then start sending">
          Simulate current turn completed
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={requests.length === 0 || snapshot.isRecovering}
        onPress={() => {
          const id = `recovery-turn-${String(++sequence.current)}`;
          requests[0]?.resolve({ turn: { ...baseTurn(id), status: "inProgress" } });
          setResponseId(id);
        }}
      >
        <Trans comment="Resolve the local start-turn request without injecting a runtime event">
          Simulate send response
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={requests.length === 0 || snapshot.isRecovering}
        onPress={() => requests[0]?.reject(definiteFailure())}
      >
        <Trans comment="Reject the simulated sending request with definite non-delivery">
          Simulate send failure
        </Trans>
      </Button>
      <Button
        variant="secondary"
        isDisabled={responseId == null}
        onPress={() => {
          if (responseId == null) return;
          scenario.acceptTurn(responseId);
          setActiveTurnId(responseId);
          setResponseId(null);
        }}
      >
        <Trans comment="Inject the runtime turn-started event that confirms the simulated queued message was accepted">
          Simulate runtime confirmation
        </Trans>
      </Button>
    </DevOnly>
  );
}

function RecoveryView({
  scenario,
  preset,
}: Readonly<{ scenario: RecoveryScenario; preset: RecoveryPreset }>) {
  const snapshot = useSyncExternalStore(scenario.display.subscribe, scenario.display.getSnapshot);
  return (
    <PendingInputScenarioView
      scenario={scenario}
      displaySnapshot={snapshot}
      mutationsEnabled={preset !== "recoveryDisabled" && !snapshot.isRecovering}
    >
      <GuideControls scenario={scenario} />
      <RecoveryControls scenario={scenario} preset={preset} />
    </PendingInputScenarioView>
  );
}

export function PendingInputRecoveryPreview({
  preset = "guiding",
  mixedText = false,
}: Readonly<{ preset?: RecoveryPreset; mixedText?: boolean }>) {
  return (
    <PendingInputPreview
      key={`${preset}-${String(mixedText)}`}
      createScenario={() => createRecoveryScenario(preset, mixedText)}
    >
      {(scenario) => <RecoveryView scenario={scenario} preset={preset} />}
    </PendingInputPreview>
  );
}
