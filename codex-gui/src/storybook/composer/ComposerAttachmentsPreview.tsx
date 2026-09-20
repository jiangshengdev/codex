import { Button, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { StrictMode, useEffect, useRef, useSyncExternalStore } from "react";
import { DevOnly } from "../DevOnly";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerTextScenario } from "./composerTextScenario";
import { createAttachmentRequests } from "./attachmentRequests";

type Preset = "interactive" | "uploading" | "ready";

function createScenario() {
  const composer = createComposerTextScenario("Review this fictional attachment: ");
  const uploads = createAttachmentRequests();
  return {
    ...composer,
    // This preview ends before sending. Product validation still runs before
    // this local boundary; a valid submission leaves the draft intact.
    role: {
      ...composer.role,
      submit: () => ({ type: "rejected", reason: "invalidInput" }) as const,
    },
    uploads,
    dispose() {
      uploads.dispose();
      composer.dispose();
    },
  };
}

function AttachmentSimulation({
  scenario,
  preset,
}: Readonly<{ scenario: ReturnType<typeof createScenario>; preset: Preset }>) {
  const root = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const completedPreset = useRef(false);
  const connected = useSyncExternalStore(scenario.uploads.subscribe, scenario.uploads.isConnected);
  const requests = useSyncExternalStore(scenario.uploads.subscribe, scenario.uploads.getSnapshot);
  useEffect(() => {
    const disconnect = scenario.uploads.connect();
    return () => {
      disconnect();
    };
  }, [scenario]);

  const addSample = () => {
    const input = root.current?.querySelector<HTMLInputElement>('input[type="file"]');
    if (input == null) return;
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["Fictional review notes."], "review-notes.txt", { type: "text/plain" }),
    );
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  useEffect(() => {
    if (!connected || initialized.current || preset === "interactive") return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      initialized.current = true;
      addSample();
    });
    return () => {
      cancelled = true;
    };
  }, [connected, preset]);
  useEffect(() => {
    if (preset !== "ready" || completedPreset.current || requests.length === 0) return;
    completedPreset.current = true;
    requests[0]?.complete();
  }, [preset, requests]);

  return (
    <div ref={root} className="grid gap-3">
      <p className="text-sm text-muted">
        <Trans>
          Files stay in this browser. Uploads are simulated; sending leaves the draft unchanged and
          never contacts a model.
        </Trans>
      </p>
      {connected ? (
        <ComposerSimulation
          scenario={scenario}
          authorizationToken={scenario.uploads.token}
          showSimulationControls={false}
        />
      ) : null}
      <DevOnly className="grid gap-3">
        <Button variant="secondary" onPress={addSample} isDisabled={!connected}>
          <Trans comment="Insert a fictional local file through the Composer file input">
            Add sample file
          </Trans>
        </Button>
        {requests.map(({ id, name, removed, complete }) => (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onPress={complete}>
              <Trans comment="Resolve the simulated upload for the named file, including a response arriving after removal">
                Complete upload {name}
              </Trans>
            </Button>
            {removed ? (
              <span className="text-sm text-muted">
                <Trans>Removed; a late result must not restore this attachment.</Trans>
              </span>
            ) : null}
          </div>
        ))}
      </DevOnly>
    </div>
  );
}

export function ComposerAttachmentsPreview({
  preset = "interactive",
}: Readonly<{ preset?: Preset }>) {
  return (
    <StrictMode>
      <Toast.Provider placement="top" />
      <PendingInputPreview key={preset} createScenario={createScenario}>
        {(scenario) => <AttachmentSimulation scenario={scenario} preset={preset} />}
      </PendingInputPreview>
    </StrictMode>
  );
}
