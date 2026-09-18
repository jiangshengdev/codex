import { Button, ButtonGroup, Chip, Tooltip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $getNodeByKey, CLICK_COMMAND, COMMAND_PRIORITY_LOW, type NodeKey } from "lexical";
import { use, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { UploadedImagePreview } from "@/features/fileUpload/UploadedImagePreview";
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
      color={attachment.status === "failed" ? "danger" : "accent"}
      variant="soft"
      className="h-auto max-w-full whitespace-normal"
    >
      <Chip.Label className="whitespace-normal wrap-anywhere">
        {attachment.status === "uploading" ? (
          <Trans comment="Attachment is being transferred to the Codex machine">Uploading</Trans>
        ) : attachment.status === "ready" ? (
          <Trans comment="Attachment upload completed and it can be sent">Ready</Trans>
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
  return (
    <ButtonGroup
      className={`relative m-1 max-w-[calc(100%-0.5rem)] items-stretch rounded-xl align-bottom focus-within:z-10 [&_.button]:rounded-none [&_.button:first-child]:rounded-s-xl [&_.button:last-child]:rounded-e-xl ${selected ? "outline-2 outline-accent" : ""}`}
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
          status={status}
        />
      ) : (
        <AttachmentSummary name={name} status={status} />
      )}
      {attachment.status === "failed" && attachment.failure === "upload" ? (
        <Button
          isDisabled={!editable}
          size="sm"
          variant="ghost"
          aria-label={t({
            comment: "Retry uploading the named attachment",
            message: `Retry upload ${name}`,
          })}
          onPress={() => editor.dispatchCommand(RETRY_ATTACHMENT_COMMAND, nodeKey)}
        >
          <Trans>Retry upload</Trans>
        </Button>
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

function AttachmentSummary({ name, status }: { name: string; status: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2 rounded-s-xl bg-default px-2 py-1 text-sm">
      <span className="min-w-0 max-w-48 truncate">{name}</span>
      {status}
    </span>
  );
}
