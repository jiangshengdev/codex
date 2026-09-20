import { Button, Toast } from "@heroui/react";
import { Trans } from "@lingui/react/macro";
import { StrictMode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AttachmentState } from "@/features/composerEditor/AttachmentNode";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { DevOnly } from "../DevOnly";
import { PendingInputPreview } from "../pendingInput/PendingInputScenarioView";
import { ComposerSimulation } from "./ComposerPreview";
import { createComposerTextScenario } from "./composerTextScenario";
import { createAttachmentRequests } from "./attachmentRequests";

type Preset = "interactive" | "uploading" | "ready" | NonNullable<AttachmentState["failure"]>;

function createScenario() {
  const composer = createComposerTextScenario("Review this fictional attachment: ");
  const uploads = createAttachmentRequests();
  const draftListeners = createListenerSet();
  return {
    ...composer,
    // This preview ends before sending. Product validation still runs before
    // this local boundary; a valid submission leaves the draft intact.
    role: {
      ...composer.role,
      saveDraft: (...args: Parameters<typeof composer.role.saveDraft>) => {
        const result = composer.role.saveDraft(...args);
        draftListeners.notify();
        return result;
      },
      submit: () => ({ type: "rejected", reason: "invalidInput" }) as const,
    },
    uploads,
    subscribeDraft: (listener: () => void) => draftListeners.subscribe(listener),
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
  const [composerGeneration, setComposerGeneration] = useState(0);
  const draft = useSyncExternalStore(scenario.subscribeDraft, scenario.coordinator.getDraft);
  const draftBeforeSample = useRef(draft);
  const connected = useSyncExternalStore(scenario.uploads.subscribe, scenario.uploads.isConnected);
  const requests = useSyncExternalStore(scenario.uploads.subscribe, scenario.uploads.getSnapshot);
  useEffect(() => {
    const disconnect = scenario.uploads.connect();
    return () => {
      disconnect();
    };
  }, [scenario]);

  const addSample = (unsupported = false) => {
    const input = root.current?.querySelector<HTMLInputElement>('input[type="file"]');
    if (input == null) return;
    const transfer = new DataTransfer();
    transfer.items.add(
      unsupported
        ? new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], "sample.svg", {
            type: "image/svg+xml",
          })
        : new File(["Fictional review notes."], "review-notes.txt", { type: "text/plain" }),
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
      draftBeforeSample.current = scenario.coordinator.getDraft();
      addSample(preset === "unsupportedImage");
    });
    return () => {
      cancelled = true;
    };
  }, [connected, preset, scenario]);
  useEffect(() => {
    if (completedPreset.current || requests.length === 0) return;
    if (preset === "interactive" || preset === "uploading" || preset === "unsupportedImage") return;
    // A fetch can begin before Lexical persists the attachment. Wait for that
    // draft before restoring the Composer, so its real import marks it interrupted.
    if (preset === "interrupted" && draft === draftBeforeSample.current) return;
    completedPreset.current = true;
    switch (preset) {
      case "interrupted":
        queueMicrotask(() => {
          setComposerGeneration((value) => value + 1);
        });
        break;
      case "ready":
        requests[0]?.complete();
        break;
      case "size":
        requests[0]?.fail(413);
        break;
      case "authorization":
        requests[0]?.fail(403);
        break;
      case "upload":
        requests[0]?.fail();
        break;
      default: {
        const unhandled: never = preset;
        throw new Error(`Unhandled attachment preset: ${String(unhandled)}`);
      }
    }
  }, [draft, preset, requests]);

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
          key={composerGeneration}
          scenario={scenario}
          authorizationToken={scenario.uploads.token}
          showSimulationControls={false}
        />
      ) : null}
      <DevOnly className="grid gap-3">
        <Button
          variant="secondary"
          onPress={() => {
            addSample();
          }}
          isDisabled={!connected}
        >
          <Trans comment="Insert a fictional local file through the Composer file input">
            Add sample file
          </Trans>
        </Button>
        {requests.map(({ id, name, removed, complete, fail }) => (
          <div key={id} className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onPress={complete}>
              <Trans comment="Resolve the simulated upload for the named file, including a response arriving after removal">
                Complete upload {name}
              </Trans>
            </Button>
            <Button
              variant="secondary"
              onPress={() => {
                fail();
              }}
            >
              <Trans comment="Return a simulated upload failure for the named file">
                Fail upload {name}
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
