import { Button, ButtonGroup, Chip, Spinner, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  type NodeKey,
} from "lexical";
import { use, useEffect } from "react";
import { RotateCw, X } from "lucide-react";
import { UploadedImagePreview } from "@/features/fileUpload/UploadedImagePreview";
import { AttachmentSummary } from "@/features/fileUpload/AttachmentSummary";
import { AttachmentAuthorizationContext } from "./attachmentEnvironment";
import { RETRY_ATTACHMENT_COMMAND, type AttachmentState } from "./AttachmentNode";

export function SelectedAttachmentToken({
  nodeKey,
  attachment,
}: {
  nodeKey: NodeKey;
  attachment: AttachmentState;
}) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const [selected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const { t } = useLingui();
  const authorizationToken = use(AttachmentAuthorizationContext);
  const name = attachment.name;
  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          const element = editor.getElementByKey(nodeKey);
          // Attachment controls own their keys, including Enter while pending.
          // Leave browser/React Aria handling intact without dispatching editor shortcuts.
          return (
            event.target instanceof Element &&
            event.target.closest("button") != null &&
            element?.contains(event.target) === true
          );
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, nodeKey],
  );
  useEffect(
    () =>
      editor.registerCommand(
        CLICK_COMMAND,
        (event) => {
          const element = editor.getElementByKey(nodeKey);
          if (
            !editor.isEditable() ||
            !(event.target instanceof Node) ||
            !element?.contains(event.target) ||
            (event.target instanceof Element && event.target.closest("button"))
          )
            return false;
          if (!event.shiftKey) clearSelection();
          setSelected(event.shiftKey ? !selected : true);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [clearSelection, editor, nodeKey, selected, setSelected],
  );
  const status = (
    <Chip
      role="status"
      size="sm"
      color={attachment.failure != null ? "danger" : "accent"}
      variant="soft"
      className="h-auto max-w-full whitespace-normal"
    >
      <Chip.Label className="whitespace-normal wrap-anywhere">
        {attachment.status === "uploading" ? (
          <>
            {attachment.failure === "upload" ? (
              <>
                <Trans>File upload failed.</Trans>{" "}
              </>
            ) : null}
            <Trans comment="Attachment is being transferred to the Codex machine">Uploading</Trans>
          </>
        ) : attachment.status === "ready" ? (
          <Trans comment="Attachment transfer completed; image preview may still be loading or failed">
            Uploaded
          </Trans>
        ) : attachment.failure === "size" ? (
          <Trans>The file exceeds the 50 MiB limit.</Trans>
        ) : attachment.failure === "authorization" ? (
          <Trans>File upload is not authorized. Open the current GUI launch link.</Trans>
        ) : attachment.failure === "unsupportedImage" ? (
          <Trans>Unsupported image format. Use PNG, JPEG, GIF, or WebP.</Trans>
        ) : attachment.failure === "interrupted" ? (
          <Trans>Upload interrupted. Remove and add the file again.</Trans>
        ) : (
          <Trans>File upload failed.</Trans>
        )}
      </Chip.Label>
    </Chip>
  );
  const removeLabel = t({
    comment: "Remove the named attachment from the draft",
    message: `Remove ${name}`,
  });
  const retryLabel = t({
    comment: "Retry uploading the named attachment",
    message: `Retry upload ${name}`,
  });
  return (
    <ButtonGroup
      className={`relative m-1 max-w-[calc(100%-0.5rem)] items-stretch rounded-xl bg-default align-bottom focus-within:z-10 [&_.button]:rounded-none [&_.button:first-child]:rounded-s-xl [&_.button:last-child]:rounded-e-xl ${selected ? "outline-2 outline-accent" : ""}`}
      aria-label={name}
      onPointerDown={(event) => {
        if (!(event.target instanceof Element && event.target.closest("button"))) {
          event.preventDefault();
          editor.getRootElement()?.focus({ preventScroll: true });
        }
      }}
    >
      {attachment.mediaType === "image" && attachment.status === "ready" ? (
        <UploadedImagePreview
          path={attachment.path}
          name={name}
          authorizationToken={authorizationToken}
          draft={{ status, isDisabled: !editable }}
        />
      ) : (
        <AttachmentSummary name={name}>{status}</AttachmentSummary>
      )}
      {attachment.failure === "upload" ? (
        <Tooltip>
          <Button
            isDisabled={!editable}
            isPending={attachment.status === "uploading"}
            isIconOnly
            size="sm"
            variant="tertiary"
            className="h-auto shrink-0 md:h-auto"
            aria-label={retryLabel}
            onPress={() => editor.dispatchCommand(RETRY_ATTACHMENT_COMMAND, nodeKey)}
          >
            {attachment.status === "uploading" ? (
              <Spinner size="sm" aria-hidden="true" />
            ) : (
              <RotateCw size={16} aria-hidden="true" />
            )}
          </Button>
          <Tooltip.Content>{retryLabel}</Tooltip.Content>
        </Tooltip>
      ) : null}
      <Tooltip>
        <Button
          isDisabled={!editable}
          isIconOnly
          size="sm"
          variant="tertiary"
          className="h-auto shrink-0 md:h-auto"
          aria-label={removeLabel}
          onPress={() => {
            editor.update(() => {
              $getNodeByKey(nodeKey)?.remove();
            });
            editor.focus(() => editor.getRootElement()?.focus({ preventScroll: true }));
          }}
        >
          <ButtonGroup.Separator />
          <X size={16} aria-hidden="true" />
        </Button>
        <Tooltip.Content>{removeLabel}</Tooltip.Content>
      </Tooltip>
    </ButtonGroup>
  );
}
