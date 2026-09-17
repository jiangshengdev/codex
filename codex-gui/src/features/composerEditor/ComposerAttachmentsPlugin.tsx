import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLingui } from "@lingui/react/macro";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  mergeRegister,
  type NodeKey,
} from "lexical";
import { useEffect, useRef } from "react";
import { uploadFile } from "@/features/fileUpload/uploadFile";
import {
  $createAttachmentNode,
  $isAttachmentNode,
  RETRY_ATTACHMENT_COMMAND,
} from "./AttachmentNode";

export function ComposerAttachmentsPlugin({
  authorizationToken,
  disabled,
}: {
  authorizationToken: string;
  disabled: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const { t } = useLingui();
  const uploads = useRef(new Map<NodeKey, { file: File; request: AbortController | null }>());
  useEffect(() => {
    const entries = uploads.current;
    const unregister = mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          for (const [key, entry] of entries) {
            if ($getNodeByKey(key) == null) {
              entry.request?.abort();
              entries.delete(key);
            }
          }
        });
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
  return (
    <input
      aria-label={t({
        comment: "Choose local files to attach to the current message",
        message: "Attach files",
      })}
      className="mx-3 max-w-full text-sm"
      type="file"
      multiple
      disabled={disabled}
      onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (files.length === 0 || !editor.isEditable()) return;
        editor.update(
          () => {
            const nodes = files.map((file) => {
              const node = $createAttachmentNode({
                id: crypto.randomUUID(),
                name: file.name,
                status: "uploading",
                path: "",
                failure: null,
              });
              uploads.current.set(node.getKey(), { file, request: null });
              return node;
            });
            const selection = $getSelection();
            if ($isRangeSelection(selection) || $isNodeSelection(selection))
              selection.insertNodes(nodes);
            else $getRoot().selectEnd().insertNodes(nodes);
            for (const node of nodes)
              editor.dispatchCommand(RETRY_ATTACHMENT_COMMAND, node.getKey());
          },
          { discrete: true },
        );
        editor.focus();
      }}
    />
  );
}
