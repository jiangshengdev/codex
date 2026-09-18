import { FILE_PREVIEW_PATH, type GuiFilePreviewParams } from "@codex-gui-host-contract";
import { Button, Modal } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState, type ReactNode } from "react";

type UploadedImagePreviewProps = {
  path: string;
  name: string;
  authorizationToken: string | null;
  status?: ReactNode;
};

type ImagePreviewOutcome =
  | { type: "ready"; url: string; width: number; height: number }
  | { type: "failed"; reason: "read" | "decode" };

export function UploadedImagePreview(props: UploadedImagePreviewProps) {
  return <ImagePreview key={JSON.stringify([props.path, props.authorizationToken])} {...props} />;
}

function ImagePreview({ path, name, authorizationToken, status }: UploadedImagePreviewProps) {
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
        controller.signal.throwIfAborted();
        objectUrl = URL.createObjectURL(blob);
        reason = "decode";
        const image = new Image();
        image.src = objectUrl;
        await image.decode();
        controller.signal.throwIfAborted();
        setOutcome({
          type: "ready",
          url: objectUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
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
      <span role="alert" className="min-w-0 wrap-anywhere text-sm text-danger">
        <span>{name}</span>{" "}
        <Trans>Image preview is not authorized. Open the current GUI launch link.</Trans>
        {status}
      </span>
    );
  }

  if (outcome == null) {
    return (
      <span role="status" className="min-w-0 wrap-anywhere text-sm text-muted">
        <Trans comment="Loading an uploaded image preview; name is the original file name">
          Loading preview of {name}…
        </Trans>
        {status}
      </span>
    );
  }
  if (outcome.type === "failed") {
    return (
      <span role="alert" className="min-w-0 wrap-anywhere text-sm text-danger">
        {outcome.reason === "read" ? (
          <Trans comment="Uploaded image could not be retrieved; name is its file name">
            Could not load the preview of {name}. The file may no longer be available.
          </Trans>
        ) : (
          <Trans comment="Browser could not decode the uploaded image; name is its file name">
            The browser could not display {name} as an image.
          </Trans>
        )}
        {status}
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
        className="h-auto max-w-full min-w-0 gap-2 rounded-xl p-1 align-bottom md:h-auto"
        aria-label={t({
          comment: "Open the uploaded image at a larger size; name is its file name",
          message: `Preview ${name}`,
        })}
      >
        <img
          src={outcome.url}
          alt=""
          className="size-10 shrink-0 rounded-lg object-cover"
          onError={reportDecodeFailure}
        />
        <span className="truncate">{name}</span>
        {status}
      </Button>
      <Modal.Backdrop>
        <Modal.Container scroll="inside" placement="center" className="p-4 sm:p-4">
          <Modal.Dialog
            className="max-w-full"
            style={{
              width: `max(16rem, min(${String(outcome.width + 48)}px, calc(100vw - 32px), calc((100dvh - 160px) * ${String(outcome.width / outcome.height)} + 48px)))`,
            }}
          >
            <Modal.CloseTrigger aria-label={t`Close image preview`} />
            <Modal.Header className="min-h-8 shrink-0 pr-10">
              <Modal.Heading className="line-clamp-2 break-all" title={name}>
                {name}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex items-center justify-center overflow-hidden">
              <img
                src={outcome.url}
                alt={name}
                className="h-auto max-h-[calc(100dvh-160px)] w-auto max-w-full object-contain"
                onError={reportDecodeFailure}
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
