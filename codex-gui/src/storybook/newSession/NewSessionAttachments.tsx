import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { within } from "storybook/test";
import { initializeWhenReady } from "../environment/initializeWhenReady";
import { insertSampleFiles } from "../composer/insertSampleFiles";
import { createSampleImage } from "../composer/sampleImage";
import { DevOnly } from "../environment/DevOnly";
import type { createNewSessionScenario } from "./newSessionScenario";

export function NewSessionAttachments({
  scenario,
  children,
}: PropsWithChildren<{ scenario: ReturnType<typeof createNewSessionScenario> }>) {
  const { t } = useLingui();
  const root = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const submitted = useRef(false);
  const [initializationError, setInitializationError] = useState<{ error: unknown } | null>(null);
  const requests = useSyncExternalStore(scenario.uploads.subscribe, scenario.uploads.getSnapshot);
  const connected = useSyncExternalStore(scenario.uploads.subscribe, scenario.uploads.isConnected);
  useEffect(() => scenario.uploads.connect(), [scenario]);
  useEffect(() => {
    if (!connected || initialized.current) return;
    // The real file input registers after the page mounts.
    return initializeWhenReady(
      document.body,
      () => {
        const { input } = scenario.options;
        if (input === "file" || input === "image" || input === "mixed") {
          if (!root.current?.querySelector('input[type="file"]')) return false;
          const files: File[] = [];
          if (input !== "image")
            files.push(
              new File(["Fictional review notes."], "review-notes.txt", { type: "text/plain" }),
            );
          if (input !== "file") files.push(createSampleImage());
          insertSampleFiles(root.current, files);
        }
        initialized.current = true;
        return true;
      },
      setInitializationError,
      "Composer file input was not mounted",
    );
  }, [connected, scenario]);
  useEffect(() => {
    for (const request of requests) {
      if (!scenario.options.uploading || request.kind === "preview") request.complete();
    }
  }, [requests, scenario]);
  useEffect(() => {
    if (
      !connected ||
      scenario.options.input == null ||
      scenario.options.preset !== "failed" ||
      submitted.current
    )
      return;
    return initializeWhenReady(
      document.body,
      () => {
        if (!initialized.current || root.current == null) return false;
        const expectedUploads =
          scenario.options.input === "mixed" ? 2 : scenario.options.input === "skill" ? 0 : 1;
        if (
          within(root.current)
            .queryAllByRole("status")
            .filter(
              (status) =>
                status.textContent ===
                t({
                  message: "Uploaded",
                  comment:
                    "Attachment transfer completed; image preview may still be loading or failed",
                }),
            ).length !== expectedUploads
        )
          return false;
        const send = within(root.current).queryByRole("button", {
          name: t({ message: "Send", comment: "Submit the first input on the new-session page" }),
        });
        if (send == null || send.hasAttribute("disabled")) return false;
        submitted.current = true;
        send.click();
        return true;
      },
      setInitializationError,
      "Initial attachments were not ready to send",
    );
  }, [connected, scenario, t]);
  if (initializationError != null) throw initializationError.error;
  return (
    <div ref={root}>
      {connected ? children : null}
      <DevOnly className="flex flex-wrap gap-2">
        {requests
          .filter((request) => request.kind === "upload")
          .map(({ id, name, complete }) => (
            <Button key={id} variant="secondary" onPress={complete}>
              <Trans comment="Resolve the simulated upload for the named file, including a response arriving after removal">
                Complete upload {name}
              </Trans>
            </Button>
          ))}
      </DevOnly>
    </div>
  );
}
