import { StrictMode, useEffect, useSyncExternalStore } from "react";
import { Button } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { useAppDispatch } from "@/app/hooks";
import { AppCapabilitiesContext } from "@/features/appShell/AppCapabilities";
import { AppShell } from "@/features/appShell/AppShell";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { PendingInputPreview } from "../composer/pendingInput/PendingInputScenarioView";
import { DevOnly } from "../environment/DevOnly";
import { createQuestionScenario, type QuestionPreset } from "./questionScenario";

function QuestionPage({
  scenario,
}: Readonly<{ scenario: ReturnType<typeof createQuestionScenario> }>) {
  const requests = useSyncExternalStore(scenario.steers.subscribe, scenario.steers.getSnapshot);
  const starts = useSyncExternalStore(scenario.starts.subscribe, scenario.starts.getSnapshot);
  const attachments = useSyncExternalStore(
    scenario.attachments.subscribe,
    scenario.attachments.getSnapshot,
  );
  const capabilities = useSyncExternalStore(scenario.subscribe, scenario.getSnapshot);
  const ready = useSyncExternalStore(scenario.subscribe, scenario.isReady);
  useEffect(() => {
    scenario.start();
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
          isDisabled={requests.length + starts.length === 0}
          onPress={() => {
            scenario.confirmNext();
          }}
        >
          <Trans comment="Inject the runtime acceptance event for the next answer in the local question preview">
            Simulate runtime confirmation
          </Trans>
        </Button>
        {attachments.length > 0 && (
          <Button
            variant="secondary"
            onPress={() => {
              scenario.confirmAttachment();
            }}
          >
            <Trans comment="Complete the simulated backend attachment after connection recovery">
              Simulate task attachment
            </Trans>
          </Button>
        )}
        <Button
          variant="secondary"
          isDisabled={
            capabilities.commands == null ||
            attachments.length > 0 ||
            requests.length + starts.length > 0
          }
          onPress={() => {
            scenario.completeTurn();
          }}
        >
          <Trans comment="Inject a completed turn event in the local question preview">
            Simulate turn completion
          </Trans>
        </Button>
      </DevOnly>
      <AppCapabilitiesContext value={capabilities}>
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
