import { Button } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { userEvent, within, waitFor } from "storybook/test";
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
    let cancelled = false;
    const isCurrent = () => !cancelled;
    // The real file input registers after the page mounts.
    void (async () => {
      const { input } = scenario.options;
      if (input === "file" || input === "image" || input === "mixed") {
        await waitFor(() => {
          if (!root.current?.querySelector('input[type="file"]'))
            throw new Error("Waiting for Composer file input");
        });
        if (!isCurrent()) return;
        const files: File[] = [];
        if (input !== "image")
          files.push(
            new File(["Fictional review notes."], "review-notes.txt", { type: "text/plain" }),
          );
        if (input !== "file") files.push(createSampleImage());
        insertSampleFiles(root.current, files);
      }
      initialized.current = true;
    })().catch((error: unknown) => {
      if (!cancelled) setInitializationError({ error });
    });
    return () => {
      cancelled = true;
    };
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
    let cancelled = false;
    const isCurrent = () => !cancelled;
    void (async () => {
      await waitFor(() => {
        if (!initialized.current || root.current == null)
          throw new Error("Waiting for initial attachments");
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
          throw new Error("Waiting for uploaded attachments");
        const send = within(root.current).getByRole("button", {
          name: t({ message: "Send", comment: "Submit the first input on the new-session page" }),
        });
        if (send.hasAttribute("disabled")) throw new Error("Waiting for uploads");
      });
      if (!isCurrent() || root.current == null) return;
      submitted.current = true;
      await userEvent.click(
        within(root.current).getByRole("button", {
          name: t({ message: "Send", comment: "Submit the first input on the new-session page" }),
        }),
      );
    })().catch((error: unknown) => {
      if (!cancelled) setInitializationError({ error });
    });
    return () => {
      cancelled = true;
    };
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
