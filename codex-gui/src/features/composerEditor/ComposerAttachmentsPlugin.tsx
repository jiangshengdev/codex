import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLingui } from "@lingui/react/macro";
import { Button } from "@heroui/react";
import { Paperclip } from "lucide-react";
import { createPortal } from "react-dom";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $nodesOfType,
  COMMAND_PRIORITY_HIGH,
  HISTORY_MERGE_TAG,
  mergeRegister,
  type NodeKey,
} from "lexical";
import { useEffect, useRef } from "react";
import { uploadFile } from "@/features/fileUpload/uploadFile";
import { randomUuid } from "@/identity/randomUuid";
import { attachmentMedia } from "./attachmentMedia";
import {
  $createAttachmentNode,
  $isAttachmentNode,
  ADD_ATTACHMENTS_COMMAND,
  AttachmentNode,
  RETRY_ATTACHMENT_COMMAND,
} from "./AttachmentNode";

export function ComposerAttachmentsPlugin({
  authorizationToken,
  disabled,
  controlsParent,
}: {
  authorizationToken: string;
  disabled: boolean;
  controlsParent?: HTMLElement | null;
}) {
  const [editor] = useLexicalComposerContext();
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploads = useRef(new Map<NodeKey, { file: File; request: AbortController | null }>());
  useEffect(() => {
    const entries = uploads.current;
    const unregister = mergeRegister(
      editor.registerCommand(
        ADD_ATTACHMENTS_COMMAND,
        (files) => {
          if (files.length === 0 || !editor.isEditable()) return false;
          const nodes = files.map((file) => {
            const node = $createAttachmentNode({
              id: randomUuid(),
              name: file.name,
              mediaType: attachmentMedia(file) === "file" ? "file" : "image",
              status: "uploading",
              path: "",
              failure: null,
            });
            entries.set(node.getKey(), { file, request: null });
            return node;
          });
          const selection = $getSelection();
          if ($isRangeSelection(selection) || $isNodeSelection(selection))
            selection.insertNodes(nodes);
          else $getRoot().selectEnd().insertNodes(nodes);
          for (const node of nodes) void startUpload(node.getKey());
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerUpdateListener(({ editorState }) => {
        const interrupted = editorState.read(() => {
          for (const [key, entry] of entries) {
            if ($getNodeByKey(key) == null) {
              entry.request?.abort();
              entries.delete(key);
            }
          }
          return $nodesOfType(AttachmentNode)
            .filter((node) => {
              const attachment = node.getAttachment();
              return (
                !entries.has(node.getKey()) &&
                (attachment.status === "uploading" || attachment.failure === "upload")
              );
            })
            .map((node) => node.getKey());
        });
        if (interrupted.length > 0)
          editor.update(
            () => {
              for (const key of interrupted) {
                const node = $getNodeByKey(key);
                if ($isAttachmentNode(node))
                  node.setAttachment({
                    ...node.getAttachment(),
                    status: "failed",
                    failure: "interrupted",
                  });
              }
            },
            { tag: HISTORY_MERGE_TAG },
          );
      }),
      editor.registerCommand(
        RETRY_ATTACHMENT_COMMAND,
        (key) => {
          if (!editor.isEditable()) return false;
          void startUpload(key);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
    return () => {
      unregister();
      for (const entry of entries.values()) entry.request?.abort();
      entries.clear();
    };

    async function startUpload(key: NodeKey): Promise<void> {
      const entry = entries.get(key);
      if (entry == null || entry.request != null) return;
      if (attachmentMedia(entry.file) === "unsupportedImage") {
        editor.update(() => {
          const node = $getNodeByKey(key);
          if ($isAttachmentNode(node))
            node.setAttachment({
              ...node.getAttachment(),
              status: "failed",
              failure: "unsupportedImage",
            });
        });
        return;
      }
      const request = new AbortController();
      entry.request = request;
      editor.update(() => {
        const node = $getNodeByKey(key);
        if ($isAttachmentNode(node))
          node.setAttachment({ ...node.getAttachment(), status: "uploading", failure: null });
      });
      const result = await uploadFile(entry.file, authorizationToken, request.signal);
      if (request.signal.aborted || entries.get(key) !== entry) return;
      entry.request = null;
      editor.update(() => {
        const node = $getNodeByKey(key);
        if (!$isAttachmentNode(node)) return;
        node.setAttachment(
          result.type === "uploaded"
            ? { ...node.getAttachment(), status: "ready", path: result.path, failure: null }
            : { ...node.getAttachment(), status: "failed", failure: result.reason },
        );
      });
    }
  }, [authorizationToken, editor]);
  const picker = (
    <>
      <Button
        isIconOnly
        size="sm"
        variant="tertiary"
        isDisabled={disabled}
        aria-label={t({
          comment: "Choose local files to attach to the current message",
          message: "Attach files",
        })}
        onPress={() => inputRef.current?.click()}
      >
        <Paperclip aria-hidden="true" size={18} />
      </Button>
      <input
        ref={inputRef}
        hidden
        type="file"
        multiple
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          editor.dispatchCommand(ADD_ATTACHMENTS_COMMAND, files);
          editor.focus();
        }}
      />
    </>
  );
  return controlsParent == null ? picker : createPortal(picker, controlsParent);
}
