import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { userEvent, within } from "storybook/test";
import { useComposerPendingInput } from "@/features/composerTurnControl/composerPendingInputHost";
import { PendingInputPreview, PendingInputScenarioView } from "../PendingInputScenarioView";
import { createPendingInputEditingScenario } from "./pendingInputEditingScenario";

type InitialEditingState = "queue" | "editing" | "deleteConfirmation" | "retained";

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
  const [initializationError, setInitializationError] = useState<{ error: unknown } | null>(null);
  const deleteLabel = t`Delete`;

  useEffect(() => {
    if (initialState === "queue") return;
    let current = true;
    const isCurrent = () => current;
    const binding = host.getSnapshot().connection?.binding;
    if (binding == null) throw new Error("Pending preview binding is required for initialization");
    if (host.getSnapshot().pending.phase === "closed") host.session.open(binding);
    if (initialState === "deleteConfirmation") {
      // Initialize the list item's own confirmation through its rendered control.
      const initializeDeletion = async () => {
        const dialog = await within(document.body).findByRole("dialog");
        if (!isCurrent()) return;
        const button = await within(dialog).findByRole("button", { name: deleteLabel });
        if (!isCurrent()) return;
        await userEvent.click(button);
      };
      void initializeDeletion().catch((error: unknown) => {
        if (current) setInitializationError({ error });
      });
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
    return () => {
      current = false;
    };
  }, [deleteLabel, host, initialState, scenario]);

  useEffect(() => {
    const edit = snapshot.pending.view?.edit;
    const binding = snapshot.connection?.binding;
    if (
      initialState !== "retained" ||
      retainedInitialized.current ||
      edit?.phase !== "active" ||
      binding == null
    )
      return;
    retainedInitialized.current = true;
    scenario.loseEditingSession();
    host.session.saveEdit(binding, edit.preparationToken);
  }, [host, initialState, scenario, snapshot]);

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
    <div className="grid gap-2 border-b border-separator pb-3">
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
    </div>
  );
}

export function PendingInputEditingPreview({
  initialState = "queue",
  ...options
}: Readonly<{ guiding?: boolean; sendingConflict?: boolean; initialState?: InitialEditingState }>) {
  return (
    <PendingInputPreview
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
