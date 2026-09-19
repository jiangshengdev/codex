import { Toast } from "@heroui/react";
import { StrictMode, useState } from "react";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerQueueScenario } from "./composerQueueScenario";
import { PendingInputBrowsingInitialState } from "../pendingInput/PendingInputBrowsingInitialState";

function QueueSimulation({
  environment,
  longList,
}: Readonly<{ environment: ReturnType<typeof createComposerQueueScenario>; longList: boolean }>) {
  const [session, setSession] = useState(() => environment.createSession());
  return (
    <ComposerSimulation
      key={session.identity.instanceId}
      scenario={session}
      onRestoreQueue={(activeTurnId) => {
        setSession(environment.restore(activeTurnId));
      }}
    >
      {longList ? () => <PendingInputBrowsingInitialState /> : undefined}
    </ComposerSimulation>
  );
}

export function ComposerQueuePreview({ longList = false }: Readonly<{ longList?: boolean }>) {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview
        key={String(longList)}
        createScenario={() => createComposerQueueScenario(longList)}
      >
        {(environment) => <QueueSimulation environment={environment} longList={longList} />}
      </PendingInputPreview>
    </StrictMode>
  );
}
