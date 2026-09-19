import { Button, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { StrictMode, useState, useSyncExternalStore } from "react";
import { DevOnly } from "../DevOnly";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerDraftScenario } from "./composerDraftScenario";
import type { ComposerScenario } from "./composerScenario";

function DraftSimulation({
  environment,
  initialSkillAvailable,
}: Readonly<{
  environment: ReturnType<typeof createComposerDraftScenario>;
  initialSkillAvailable: boolean;
}>) {
  const [session, setSession] = useState<ComposerScenario | null>(() =>
    environment.createSession(),
  );
  return session == null ? (
    <>
      <p className="text-sm text-muted">
        <Trans>
          Local simulation. The composer is unmounted; its saved draft is kept until you return or
          restart the simulation.
        </Trans>
      </p>
      <DevOnly>
        <Button
          variant="secondary"
          onPress={() => {
            setSession(environment.createSession());
          }}
        >
          <Trans comment="Remount the local Composer with a new session that reads the same isolated draft storage">
            Simulate returning
          </Trans>
        </Button>
      </DevOnly>
    </>
  ) : (
    <ComposerSimulation scenario={session} initialSkillAvailable={initialSkillAvailable}>
      {(isIdle) => (
        <DraftVisitControls
          session={session}
          isIdle={isIdle}
          environment={environment}
          onLeave={() => {
            environment.leave();
            setSession(null);
          }}
        />
      )}
    </ComposerSimulation>
  );
}

function DraftVisitControls({
  session,
  isIdle,
  environment,
  onLeave,
}: Readonly<{
  session: ComposerScenario;
  isIdle: boolean;
  environment: ReturnType<typeof createComposerDraftScenario>;
  onLeave: () => void;
}>) {
  useSyncExternalStore(session.coordinator.subscribe, session.coordinator.getSnapshot);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  return (
    <DevOnly>
      <p className="text-sm text-muted">
        <Trans>
          Leaving keeps the saved draft. Restarting resets it. Finish simulated sending and save
          changes before leaving.
        </Trans>
      </p>
      <Button
        variant="secondary"
        isDisabled={!isIdle || session.coordinator.getReleaseReadiness().type !== "safe"}
        onPress={onLeave}
      >
        <Trans comment="Unmount the local Composer while preserving this simulation's saved draft">
          Simulate leaving
        </Trans>
      </Button>
      <Button
        variant="secondary"
        onPress={() => {
          environment.setWriteFailure(!storageUnavailable);
          setStorageUnavailable(!storageUnavailable);
          if (!storageUnavailable) session.coordinator.retryPersistence();
        }}
      >
        {storageUnavailable ? (
          <Trans comment="Make local storage writes available again; the product Retry saving action still must be used">
            Restore simulated storage
          </Trans>
        ) : (
          <Trans comment="Make isolated draft storage writes fail and attempt saving through the real coordinator">
            Simulate saving failure
          </Trans>
        )}
      </Button>
    </DevOnly>
  );
}

export function ComposerDraftPreview({
  initialSkillAvailable = true,
}: Readonly<{ initialSkillAvailable?: boolean }>) {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview createScenario={createComposerDraftScenario}>
        {(environment) => (
          <DraftSimulation
            environment={environment}
            initialSkillAvailable={initialSkillAvailable}
          />
        )}
      </PendingInputPreview>
    </StrictMode>
  );
}
