import {
  $applyNodeReplacement,
  createCommand,
  DecoratorNode,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical";
import { createElement, type JSX } from "react";
import type { UploadFailure } from "@/features/fileUpload/uploadFile";
import { SelectedAttachmentToken } from "./SelectedAttachmentToken";

export type AttachmentState = Readonly<{
  id: string;
  name: string;
  mediaType: "file" | "image";
  status: "uploading" | "ready" | "failed";
  path: string;
  failure: UploadFailure | "interrupted" | null;
}>;
type SerializedAttachmentNode = Spread<
  { type: "attachment"; version: 1; attachment: AttachmentState },
  SerializedLexicalNode
>;
export const RETRY_ATTACHMENT_COMMAND = createCommand<NodeKey>("retry-attachment");
export const ADD_ATTACHMENTS_COMMAND = createCommand<readonly File[]>("add-attachments");

export class AttachmentNode extends DecoratorNode<JSX.Element> {
  __attachment: AttachmentState;
  constructor(
    attachment: AttachmentState = {
      id: "",
      name: "",
      mediaType: "file",
      status: "failed",
      path: "",
      failure: "interrupted",
    },
    key?: NodeKey,
  ) {
    super(key);
    this.__attachment = attachment;
  }
  $config() {
    return this.config("attachment", {});
  }
  static clone(node: AttachmentNode): AttachmentNode {
    return new AttachmentNode(node.__attachment, node.__key);
  }
  afterCloneFrom(previous: this): void {
    super.afterCloneFrom(previous);
    this.__attachment = previous.__attachment;
  }
  static importJSON(value: SerializedAttachmentNode): AttachmentNode {
    const candidate = value as unknown as {
      version: unknown;
      attachment?: Partial<AttachmentState>;
    };
    const state = candidate.attachment;
    if (
      candidate.version !== 1 ||
      state == null ||
      typeof state.id !== "string" ||
      typeof state.name !== "string" ||
      typeof state.path !== "string" ||
      (state.mediaType !== "file" && state.mediaType !== "image") ||
      (state.status !== "uploading" && state.status !== "ready" && state.status !== "failed") ||
      (state.status === "ready" && state.path.length === 0)
    )
      throw new Error("Invalid attachment draft");
    return $createAttachmentNode({
      id: state.id,
      name: state.name,
      mediaType: state.mediaType,
      path: state.path,
      status: state.status === "ready" ? "ready" : "failed",
      failure: state.status === "ready" ? null : "interrupted",
    });
  }
  exportJSON(): SerializedAttachmentNode {
    return {
      ...super.exportJSON(),
      type: "attachment",
      version: 1,
      attachment: this.getAttachment(),
    };
  }
  getAttachment(): AttachmentState {
    return this.getLatest().__attachment;
  }
  setAttachment(attachment: AttachmentState): void {
    this.getWritable().__attachment = attachment;
  }
  getTextContent(): string {
    return this.getAttachment().name;
  }
  createDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "inline-block max-w-full select-none align-middle";
    element.setAttribute("data-attachment-node", "true");
    return element;
  }
  updateDOM(): false {
    return false;
  }
  exportDOM(): DOMExportOutput {
    return { element: document.createTextNode(this.getAttachment().path || this.getTextContent()) };
  }
  decorate(): JSX.Element {
    return createElement(SelectedAttachmentToken, {
      nodeKey: this.getKey(),
      attachment: this.getAttachment(),
    });
  }
}
export function $createAttachmentNode(state: AttachmentState): AttachmentNode {
  return $applyNodeReplacement(new AttachmentNode(state));
}
export function $isAttachmentNode(node: LexicalNode | null | undefined): node is AttachmentNode {
  return node instanceof AttachmentNode;
}
