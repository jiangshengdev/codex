import { FILE_PREVIEW_PATH, type GuiFilePreviewParams } from "@codex-gui-host-contract";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

type UploadedImagePreviewProps = {
  path: string;
  name: string;
  authorizationToken: string | null;
};

type ImagePreviewOutcome =
  | { type: "ready"; url: string }
  | { type: "failed"; reason: "read" | "decode" };

export function UploadedImagePreview(props: UploadedImagePreviewProps) {
  return <ImagePreview key={JSON.stringify([props.path, props.authorizationToken])} {...props} />;
}

function ImagePreview({ path, name, authorizationToken }: UploadedImagePreviewProps) {
  const { t } = useLingui();
  const [outcome, setOutcome] = useState<ImagePreviewOutcome | null>(null);

  useEffect(() => {
    if (authorizationToken == null) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    const load = async () => {
      let reason: "read" | "decode" = "read";
      try {
        const query = new URLSearchParams({ path } satisfies GuiFilePreviewParams);
        const response = await fetch(`${FILE_PREVIEW_PATH}?${query}`, {
          headers: { Authorization: `Bearer ${authorizationToken}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Image preview request failed");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        reason = "decode";
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        if (controller.signal.aborted) return;
        setOutcome({ type: "ready", url: objectUrl });
      } catch {
        if (objectUrl != null) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
        if (!controller.signal.aborted) {
          setOutcome({ type: "failed", reason });
        }
      }
    };
    void load();
    return () => {
      controller.abort();
      if (objectUrl != null) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };
  }, [path, authorizationToken]);

  if (authorizationToken == null) {
    return (
      <span role="alert" className="text-sm text-danger">
        <Trans>Image preview is not authorized. Open the current GUI launch link.</Trans>
      </span>
    );
  }

  if (outcome == null) {
    return (
      <span role="status" className="text-sm text-muted">
        <Trans comment="Loading an uploaded image preview; name is the original file name">
          Loading preview of {name}…
        </Trans>
      </span>
    );
  }
  if (outcome.type === "failed") {
    return (
      <span role="alert" className="text-sm text-danger">
        {outcome.reason === "read" ? (
          <Trans comment="Uploaded image could not be retrieved; name is its file name">
            Could not load the preview of {name}. The file may no longer be available.
          </Trans>
        ) : (
          <Trans comment="Browser could not decode the uploaded image; name is its file name">
            The browser could not display {name} as an image.
          </Trans>
        )}
      </span>
    );
  }

  const reportDecodeFailure = () => {
    setOutcome({ type: "failed", reason: "decode" });
  };
  return (
    <Modal>
      <Button
        variant="secondary"
        className="h-auto max-w-full gap-2 p-1"
        aria-label={t({
          comment: "Open the uploaded image at a larger size; name is its file name",
          message: `Preview ${name}`,
        })}
      >
        <img
          src={outcome.url}
          alt=""
          className="size-10 shrink-0 rounded object-cover"
          onError={reportDecodeFailure}
        />
        <span className="truncate">{name}</span>
      </Button>
      <Modal.Backdrop>
        <Modal.Container scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger aria-label={t`Close image preview`} />
            <Modal.Header>
              <Modal.Heading className="break-all">{name}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <img
                src={outcome.url}
                alt={name}
                className="max-h-[70vh] max-w-full object-contain"
                onError={reportDecodeFailure}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
