import { Toast } from "@heroui/react";
import { StrictMode, useState } from "react";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerQueueScenario } from "./composerQueueScenario";

function QueueSimulation({
  environment,
}: Readonly<{ environment: ReturnType<typeof createComposerQueueScenario> }>) {
  const [session, setSession] = useState(() => environment.createSession());
  return (
    <ComposerSimulation
      key={session.identity.instanceId}
      scenario={session}
      onRestoreQueue={(activeTurnId) => {
        setSession(environment.restore(activeTurnId));
      }}
    />
  );
}

export function ComposerQueuePreview() {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview createScenario={createComposerQueueScenario}>
        {(environment) => <QueueSimulation environment={environment} />}
      </PendingInputPreview>
    </StrictMode>
  );
}
