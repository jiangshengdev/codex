import { Button, Surface, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { StrictMode, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ActiveThreadSessionSnapshot } from "@/features/activeThreadSession/activeThreadSession";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";
import { baseTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import { DevOnly } from "../DevOnly";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { createComposerScenario, previewSkill, type ComposerScenario } from "./composerScenario";

const skillsRole = {
  invalidateSkills: () => false,
  refreshSkills: () => false,
  retrySkills: () => false,
};

export function ComposerSimulation({
  scenario,
  children,
}: Readonly<{ scenario: ComposerScenario; children?: (isIdle: boolean) => ReactNode }>) {
  const composer = useSyncExternalStore(
    scenario.coordinator.subscribe,
    scenario.coordinator.getSnapshot,
  );
  const requests = useSyncExternalStore(scenario.starts.subscribe, scenario.starts.getSnapshot);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [responseTurnId, setResponseTurnId] = useState<string | null>(null);
  const [skillAvailable, setSkillAvailable] = useState(true);
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
    <Surface className="mx-auto grid w-full max-w-2xl gap-4 rounded-3xl p-4">
      <p className="text-sm text-muted">
        <Trans>
          Local simulation. Requests and runtime events advance only when you use the simulation
          controls.
        </Trans>
      </p>
      <ComposerTurnControl
        authorizationToken={null}
        guardCompositionEndEnter={false}
        routeTarget={{ type: "currentTask", threadId: "thread-1" }}
        sessionSnapshot={snapshot}
      />
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
            scenario.completeTurn(activeTurnId);
            setActiveTurnId(null);
          }}
        >
          <Trans>Simulate current turn completed</Trans>
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
      {children?.(activeTurnId == null && responseTurnId == null && requests.length === 0)}
    </Surface>
  );
}

export function ComposerPreview() {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview createScenario={createComposerScenario}>
        {(scenario) => <ComposerSimulation scenario={scenario} />}
      </PendingInputPreview>
    </StrictMode>
  );
}
