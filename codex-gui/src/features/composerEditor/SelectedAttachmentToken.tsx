import { Button, Chip } from "@heroui/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { $getNodeByKey, CLICK_COMMAND, COMMAND_PRIORITY_LOW, type NodeKey } from "lexical";
import { useEffect } from "react";
import { RETRY_ATTACHMENT_COMMAND, type AttachmentState } from "./AttachmentNode";

export function SelectedAttachmentToken({
  nodeKey,
  attachment,
}: {
  nodeKey: NodeKey;
  attachment: AttachmentState;
}) {
  const [editor] = useLexicalComposerContext();
  const [selected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey);
  const { t } = useLingui();
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
  return (
    <Chip
      className={selected ? "max-w-full outline-2 outline-accent" : "max-w-full"}
      color={attachment.status === "failed" ? "danger" : "default"}
    >
      <span
        className="inline-flex max-w-full items-center gap-1"
        role="group"
        aria-label={name}
        onPointerDown={(event) => {
          if (!(event.target instanceof Element && event.target.closest("button"))) {
            event.preventDefault();
            editor.getRootElement()?.focus({ preventScroll: true });
          }
        }}
      >
        <span className="max-w-48 truncate">{name}</span>
        <span role="status" className="text-xs">
          {attachment.status === "uploading" ? (
            <Trans comment="Attachment is being transferred to the Codex machine">Uploading</Trans>
          ) : attachment.status === "ready" ? (
            <Trans comment="Attachment upload completed and it can be sent">Ready</Trans>
          ) : attachment.failure === "size" ? (
            <Trans>The file exceeds the 50 MiB limit.</Trans>
          ) : attachment.failure === "authorization" ? (
            <Trans>File upload is not authorized. Open the current GUI launch link.</Trans>
          ) : attachment.failure === "interrupted" ? (
            <Trans>Upload interrupted. Remove and add the file again.</Trans>
          ) : (
            <Trans>File upload failed.</Trans>
          )}
        </span>
        {attachment.status === "failed" && attachment.failure === "upload" ? (
          <Button
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
        <Button
          size="sm"
          variant="ghost"
          aria-label={t({
            comment: "Remove the named attachment from the draft",
            message: `Remove ${name}`,
          })}
          onPress={() => {
            editor.update(() => {
              $getNodeByKey(nodeKey)?.remove();
            });
            editor.focus();
          }}
        >
          <Trans comment="Remove an attachment from the draft">Remove</Trans>
        </Button>
      </span>
    </Chip>
  );
}
