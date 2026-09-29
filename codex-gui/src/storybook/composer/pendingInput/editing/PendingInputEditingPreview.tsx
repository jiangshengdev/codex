import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { within } from "storybook/test";
import { initializeWhenReady } from "../../../environment/initializeWhenReady";
import { useComposerPendingInput } from "@/features/composerTurnControl/composerPendingInputHost";
import { PendingInputPreview, PendingInputScenarioView } from "../PendingInputScenarioView";
import { createPendingInputEditingScenario } from "./pendingInputEditingScenario";
import { DevOnly } from "../../../environment/DevOnly";

type InitialEditingState =
  | "queue"
  | "editing"
  | "deleteConfirmation"
  | "retained"
  | "discardConfirmation";

function InitialState({
  scenario,
  initialState,
}: Readonly<{
  scenario: ReturnType<typeof createPendingInputEditingScenario>;
  initialState: InitialEditingState;
}>) {
  const host = useComposerPendingInput();
  const { t } = useLingui();
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const retainedInitialized = useRef(false);
  const discardInitialized = useRef(false);
  const [initializationError, setInitializationError] = useState<{ error: unknown } | null>(null);
  const deleteLabel = t`Delete`;

  useEffect(() => {
    if (initialState === "queue") return;
    const binding = host.getSnapshot().connection?.binding;
    if (binding == null) throw new Error("Pending preview binding is required for initialization");
    if (host.getSnapshot().pending.phase === "closed") host.session.open(binding);
    if (initialState === "deleteConfirmation") {
      // Initialize the list item's own confirmation through its rendered control.
      return initializeWhenReady(
        document.body,
        () => {
          const dialog = within(document.body).queryByRole("dialog");
          if (dialog == null) return false;
          const item = within(dialog).queryByRole("group", {
            name: /^Ordinary message 1(?:\s|$)/,
          });
          if (item == null) return false;
          const button = within(item).queryByRole("button", { name: deleteLabel });
          if (button == null) return false;
          button.click();
          return true;
        },
        setInitializationError,
        "Pending preview delete button was not mounted",
      );
    } else if (host.getSnapshot().pending.view?.edit == null) {
      const page = scenario.role.readPendingInputPage({
        lane: "ordinary",
        revision: scenario.coordinator.getSnapshot().detailRevision,
        cursor: null,
        limit: 1,
      });
      if (page.type !== "page" || page.items[0] == null)
        throw new Error("Initial queued message is required");
      host.session.beginEdit(binding, page.items[0]);
    }
  }, [deleteLabel, host, initialState, scenario]);

  useEffect(() => {
    const edit = snapshot.pending.view?.edit;
    const binding = snapshot.connection?.binding;
    if (
      (initialState !== "retained" && initialState !== "discardConfirmation") ||
      retainedInitialized.current ||
      edit?.phase !== "active" ||
      binding == null
    )
      return;
    retainedInitialized.current = true;
    scenario.loseEditingSession();
    host.session.saveEdit(binding, edit.preparationToken);
  }, [host, initialState, scenario, snapshot]);

  useEffect(() => {
    const binding = snapshot.connection?.binding;
    if (
      initialState !== "discardConfirmation" ||
      discardInitialized.current ||
      snapshot.pending.view?.edit?.phase !== "retained" ||
      binding == null
    )
      return;
    discardInitialized.current = true;
    host.session.requestClose(binding);
  }, [host, initialState, snapshot]);

  if (initializationError != null) throw initializationError.error;
  return null;
}

function EditingControls({
  scenario,
}: Readonly<{ scenario: ReturnType<typeof createPendingInputEditingScenario> }>) {
  const host = useComposerPendingInput();
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const edit = snapshot.pending.view?.edit;
  return (
    <DevOnly>
      <p className="text-sm text-muted">
        {scenario.sendingConflict ? (
          <Trans>
            This fixture injects a sending-conflict result when editing is requested. It does not
            simulate queue dispatch.
          </Trans>
        ) : (
          <Trans>
            This control injects a lost editing-session result for previewing content protection.
          </Trans>
        )}
      </p>
      <Button
        variant="secondary"
        isDisabled={edit?.phase !== "active"}
        onPress={() => {
          const binding = host.getSnapshot().connection?.binding;
          if (binding == null || edit?.phase !== "active") return;
          scenario.loseEditingSession();
          host.session.saveEdit(binding, edit.preparationToken);
        }}
      >
        <Trans comment="Inject a failed save in the local pending-message editor simulation">
          Simulate editing session lost
        </Trans>
      </Button>
      {scenario.guiding ? (
        <Button
          variant="secondary"
          isDisabled={edit?.phase !== "active"}
          onPress={() => {
            scenario.completeTurn();
          }}
        >
          <Trans comment="Complete the simulated target turn while its guiding message is being edited">
            Simulate target turn closed
          </Trans>
        </Button>
      ) : null}
    </DevOnly>
  );
}

export function PendingInputEditingPreview({
  initialState = "queue",
  ...options
}: Readonly<{
  guiding?: boolean;
  sendingConflict?: boolean;
  mixedText?: boolean;
  initialState?: InitialEditingState;
}>) {
  return (
    <PendingInputPreview
      key={JSON.stringify({ ...options, initialState })}
      createScenario={() => createPendingInputEditingScenario(options)}
      renderDrawerControls={(scenario) => <EditingControls scenario={scenario} />}
    >
      {(scenario) => (
        <PendingInputScenarioView scenario={scenario}>
          <InitialState scenario={scenario} initialState={initialState} />
        </PendingInputScenarioView>
      )}
    </PendingInputPreview>
  );
}
