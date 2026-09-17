import { MAX_UPLOAD_BYTES } from "@codex-gui-host-contract";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useId, useRef, useState } from "react";
import { uploadFile } from "./uploadFile";

export function FileUploadDialog({ authorizationToken }: { authorizationToken: string | null }) {
  const { t } = useLingui();
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [path, setPath] = useState<string | null>(null);
  const [failure, setFailure] = useState<"size" | "authorization" | "upload" | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );

  const upload = async (): Promise<void> => {
    if (file == null || authorizationToken == null || request.current != null) return;
    setPath(null);
    setFailure(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setFailure("size");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      const result = await uploadFile(file, authorizationToken, controller.signal);
      if (controller.signal.aborted) return;
      if (result.type === "failed") {
        setFailure(result.reason);
        return;
      }
      if (request.current === controller) setPath(result.path);
    } catch {
      if (!controller.signal.aborted) setFailure("upload");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  };

  return (
    <Modal>
      <Button isDisabled={authorizationToken == null} variant="secondary">
        <Trans>Upload file</Trans>
      </Button>
      <Modal.Backdrop>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger aria-label={t`Close file upload`} />
            <Modal.Header>
              <Modal.Heading>
                <Trans>Upload file</Trans>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="grid gap-3">
              <p className="text-sm text-muted">
                <Trans>
                  Save a file on the machine running Codex. Maximum size: 50 MiB. Uploading does not
                  send a message.
                </Trans>
              </p>
              <label htmlFor={inputId}>
                <Trans>Choose a file</Trans>
              </label>
              <input
                id={inputId}
                type="file"
                disabled={pending}
                onChange={(event) => {
                  const selected = event.currentTarget.files?.[0];
                  if (selected == null) return;
                  setFile(selected);
                  setPath(null);
                  setFailure(selected.size > MAX_UPLOAD_BYTES ? "size" : null);
                }}
              />
              {file != null ? <p className="break-all text-sm">{file.name}</p> : null}
              {failure != null ? (
                <p role="alert" className="text-sm text-danger">
                  {failure === "size" ? (
                    <Trans>The file exceeds the 50 MiB limit.</Trans>
                  ) : failure === "authorization" ? (
                    <Trans>File upload is not authorized. Open the current GUI launch link.</Trans>
                  ) : (
                    <Trans>File upload failed.</Trans>
                  )}
                </p>
              ) : null}
              {failure === "upload" ? (
                <p className="text-sm text-muted">
                  <Trans>
                    The file may already have been saved. Retrying uploads the entire file again and
                    may create another copy.
                  </Trans>
                </p>
              ) : null}
              {path != null ? (
                <div role="status" className="grid gap-1">
                  <p>
                    <Trans>File saved on the Codex machine</Trans>
                  </p>
                  <code className="break-all text-sm">{path}</code>
                </div>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button
                variant="primary"
                isPending={pending}
                isDisabled={
                  file == null ||
                  authorizationToken == null ||
                  pending ||
                  failure === "size" ||
                  failure === "authorization" ||
                  path != null
                }
                onPress={() => {
                  void upload();
                }}
              >
                {failure === "upload" ? (
                  <Trans comment="Manually resend the entire selected file after an upload failure">
                    Retry upload
                  </Trans>
                ) : (
                  <Trans comment="Send the selected local file to the machine running Codex">
                    Upload
                  </Trans>
                )}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
