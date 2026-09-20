import { Button, Surface, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { StrictMode, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ActiveThreadSessionSnapshot } from "@/features/activeThreadSession/activeThreadSession";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import { baseTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import { DevOnly } from "../DevOnly";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { definiteFailure } from "../pendingInput/recovery/recoveryScenario";
import { createComposerScenario, previewSkill, type ComposerScenario } from "./composerScenario";
import { createComposerTextScenario } from "./composerTextScenario";

const skillsRole = {
  invalidateSkills: () => false,
  refreshSkills: () => false,
  retrySkills: () => false,
};

export function ComposerSimulation({
  scenario,
  children,
  onRestoreQueue,
  interruptOnCompletion = false,
  initialSkillAvailable = true,
  initialResponseTurnId = null,
  authorizationToken = null,
  showSimulationControls = true,
}: Readonly<{
  scenario: ComposerScenario;
  children?: (isIdle: boolean) => ReactNode;
  onRestoreQueue?: (activeTurnId: string | null) => void;
  interruptOnCompletion?: boolean;
  initialSkillAvailable?: boolean;
  initialResponseTurnId?: string | null;
  authorizationToken?: string | null;
  showSimulationControls?: boolean;
}>) {
  const composer = useSyncExternalStore(
    scenario.coordinator.subscribe,
    scenario.coordinator.getSnapshot,
  );
  const requests = useSyncExternalStore(scenario.starts.subscribe, scenario.starts.getSnapshot);
  const [activeTurnId, setActiveTurnId] = useState(scenario.initialActiveTurnId);
  const [responseTurnId, setResponseTurnId] = useState(initialResponseTurnId);
  const [skillAvailable, setSkillAvailable] = useState(initialSkillAvailable);
  const release = scenario.coordinator.getReleaseReadiness();
  // Restoring a saved queue deliberately retains queued and unknown-send records.
  // Other blockers can contain unsaved edits or unfinished control operations.
  const canRestoreQueue =
    requests.length === 0 &&
    responseTurnId == null &&
    (release.type === "safe" ||
      release.blockers.every(
        (blocker) =>
          blocker.type === "ordinaryQueued" ||
          (blocker.type === "pendingStart" && blocker.phase === "deliveryUnknown"),
      ));
  const snapshot: Extract<ActiveThreadSessionSnapshot, { phase: "active" }> = {
    phase: "active",
    revision: 1,
    identity: scenario.identity,
    threadId: "thread-1",
    subscriptionId: "preview-subscription",
    activeTurnId,
    threadStatus: activeTurnId == null ? { type: "idle" } : { type: "active", activeFlags: [] },
    compaction: { phase: "idle", canRequest: false, startFailure: null },
    compactionRole: {
      requestCompaction: () => ({ type: "rejected", reason: "operationInProgress" }),
    },
    composer,
    composerRole: scenario.role,
    connection: { phase: "available" },
    skills: {
      type: "ready",
      candidates: skillAvailable ? [previewSkill] : [],
      partialErrorCount: 0,
    },
    skillsRole,
  };
  return (
    <Surface
      className="app-shell-content-boundary grid gap-4 rounded-3xl py-4"
      data-app-shell-content-layout="reading"
    >
      <p className="text-sm text-muted">
        <Trans>
          Local simulation. Requests and runtime events advance only when you use the simulation
          controls.
        </Trans>
      </p>
      <ComposerTurnControl
        authorizationToken={authorizationToken}
        guardCompositionEndEnter={false}
        routeTarget={{ type: "currentTask", threadId: "thread-1" }}
        sessionSnapshot={snapshot}
      />
      {showSimulationControls ? (
        <DevOnly className="grid gap-3">
          <Button
            variant="secondary"
            isDisabled={requests.length === 0}
            onPress={() => {
              const request = requests[0];
              if (request == null) return;
              const id = `composer-preview-${crypto.randomUUID()}`;
              request.resolve({ turn: { ...baseTurn(id), status: "inProgress" } });
              setResponseTurnId(id);
            }}
          >
            <Trans>Simulate send response</Trans>
          </Button>
          <Button
            variant="secondary"
            isDisabled={requests.length === 0}
            onPress={() => requests[0]?.reject(definiteFailure())}
          >
            <Trans comment="Reject the simulated ordinary send as definitely not accepted">
              Simulate send failure
            </Trans>
          </Button>
          <Button
            variant="secondary"
            isDisabled={requests.length === 0}
            onPress={() => requests[0]?.reject(new Error("Simulated delivery unknown"))}
          >
            <Trans comment="Settle the simulated ordinary send without knowing whether it was accepted">
              Simulate send unknown
            </Trans>
          </Button>
          <Button
            variant="secondary"
            isDisabled={responseTurnId == null}
            onPress={() => {
              if (responseTurnId == null) return;
              scenario.acceptTurn(responseTurnId);
              setActiveTurnId(responseTurnId);
              setResponseTurnId(null);
            }}
          >
            <Trans>Simulate runtime confirmation</Trans>
          </Button>
          <Button
            variant="secondary"
            isDisabled={activeTurnId == null}
            onPress={() => {
              if (activeTurnId == null) return;
              scenario.completeTurn(
                activeTurnId,
                interruptOnCompletion ? "interrupted" : "completed",
              );
              setActiveTurnId(null);
            }}
          >
            {interruptOnCompletion ? (
              <Trans comment="Inject the interrupted terminal event for the current simulated turn, separately from the stop request response">
                Simulate current turn interrupted
              </Trans>
            ) : (
              <Trans>Simulate current turn completed</Trans>
            )}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setSkillAvailable((value) => !value);
            }}
          >
            {skillAvailable ? (
              <Trans comment="Remove the fictional skill from the local catalog to exercise selected-skill validation">
                Simulate skill unavailable
              </Trans>
            ) : (
              <Trans comment="Return the fictional skill to the local catalog">
                Restore simulated skill
              </Trans>
            )}
          </Button>
          <p role="status">
            {requests.length > 0 ? (
              <Trans>Waiting for send response</Trans>
            ) : responseTurnId != null ? (
              <Trans>Response received; waiting for runtime confirmation</Trans>
            ) : activeTurnId != null ? (
              <Trans>Current turn is running</Trans>
            ) : (
              <Trans>Simulation is idle</Trans>
            )}
          </p>
        </DevOnly>
      ) : null}
      {onRestoreQueue != null ? (
        <DevOnly>
          <Button
            variant="secondary"
            isDisabled={!canRestoreQueue}
            onPress={() => {
              onRestoreQueue(activeTurnId);
            }}
          >
            <Trans comment="Remount the Composer using its isolated saved queue and current simulated runtime">
              Simulate saved queue restore
            </Trans>
          </Button>
        </DevOnly>
      ) : null}
      {children?.(activeTurnId == null && responseTurnId == null && requests.length === 0)}
    </Surface>
  );
}

export function ComposerPreview({ initialText }: Readonly<{ initialText?: string }>) {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview
        key={initialText}
        createScenario={() =>
          initialText == null ? createComposerScenario() : createComposerTextScenario(initialText)
        }
      >
        {(scenario) => <ComposerSimulation scenario={scenario} />}
      </PendingInputPreview>
    </StrictMode>
  );
}
