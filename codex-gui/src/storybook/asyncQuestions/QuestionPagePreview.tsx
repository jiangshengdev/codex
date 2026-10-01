import { StrictMode, useEffect, useSyncExternalStore } from "react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useAppDispatch } from "@/app/hooks";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { AppShell } from "@/features/appShell/AppShell";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { PendingInputPreview } from "../composer/pendingInput/PendingInputScenarioView";
import { DevOnly } from "../environment/DevOnly";
import { createQuestionScenario, questionThreadId, type QuestionPreset } from "./questionScenario";

function QuestionPage({
  scenario,
}: Readonly<{ scenario: ReturnType<typeof createQuestionScenario> }>) {
  const requests = useSyncExternalStore(scenario.steers.subscribe, scenario.steers.getSnapshot);
  const ready = useSyncExternalStore(scenario.subscribe, scenario.isReady);
  useEffect(() => {
    void scenario.start();
  }, [scenario]);
  if (!ready) return null;
  return (
    <>
      <DevOnly>
        <p className="text-sm text-muted">
          <Trans>
            Local simulation. Submit an answer, then confirm it to show the runtime user message.
          </Trans>
        </p>
        <Button
          variant="secondary"
          isDisabled={requests.length === 0}
          onPress={() => {
            scenario.confirmNext();
          }}
        >
          <Trans comment="Inject the runtime acceptance event for the next answer in the local question preview">
            Simulate runtime confirmation
          </Trans>
        </Button>
      </DevOnly>
      <AppCapabilitiesContext
        value={{
          status: { label: "initialized" },
          authorizationToken: null,
          commands: scenario.commands,
          activeThreadSession: scenario.session,
          connectionRecovery: null,
          newSessionOwner: scenario.newSessionOwner,
          routeTarget: { type: "currentTask", threadId: questionThreadId },
        }}
      >
        <AppShell>
          <CurrentTaskPage />
        </AppShell>
      </AppCapabilitiesContext>
    </>
  );
}

export function QuestionPagePreview({
  preset = "plainText",
}: Readonly<{ preset?: QuestionPreset }>) {
  const dispatch = useAppDispatch();
  return (
    <StrictMode>
      <PendingInputPreview
        className=""
        key={preset}
        createScenario={() => createQuestionScenario(dispatch, preset)}
      >
        {(scenario) => <QuestionPage scenario={scenario} />}
      </PendingInputPreview>
    </StrictMode>
  );
}
