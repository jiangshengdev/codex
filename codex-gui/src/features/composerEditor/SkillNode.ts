import {
  $applyNodeReplacement,
  $createNodeSelection,
  $getNodeByKey,
  $setSelection,
  DecoratorNode,
  type DOMExportOutput,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
} from "lexical";
import { createElement, type JSX } from "react";

import { SelectedSkillToken } from "./SelectedSkillToken";

export type SkillNodeState = Readonly<{
  name: string;
  path: string;
  displayName: string;
  sourceLabel: string;
}>;

export type ActivateSkillNodeResult = "activated" | "unavailable";

export type SerializedSkillNode = Spread<
  SkillNodeState & {
    type: "skill";
    version: 1;
  },
  SerializedTextNode
>;

export class SkillNode extends DecoratorNode<JSX.Element> {
  __name: string;
  __path: string;
  __displayName: string;
  __sourceLabel: string;

  constructor(
    state: SkillNodeState = {
      name: "",
      path: "",
      displayName: "",
      sourceLabel: "",
    },
    key?: NodeKey,
  ) {
    super(key);
    this.__name = state.name;
    this.__path = state.path;
    this.__displayName = state.displayName;
    this.__sourceLabel = state.sourceLabel;
  }

  $config() {
    return this.config("skill", {});
  }

  static clone(node: SkillNode): SkillNode {
    return new SkillNode(
      {
        name: node.__name,
        path: node.__path,
        displayName: node.__displayName,
        sourceLabel: node.__sourceLabel,
      },
      node.__key,
    );
  }

  afterCloneFrom(previousNode: this): void {
    super.afterCloneFrom(previousNode);
    this.__name = previousNode.__name;
    this.__path = previousNode.__path;
    this.__displayName = previousNode.__displayName;
    this.__sourceLabel = previousNode.__sourceLabel;
  }

  static importJSON(serializedNode: SerializedSkillNode): SkillNode {
    assertSerializedSkillNode(serializedNode);
    return $createSkillNode(serializedNode);
  }

  exportJSON(): SerializedSkillNode {
    return {
      detail: 0,
      format: 0,
      mode: "token",
      style: "",
      text: this.getTextContent(),
      ...this.getSkill(),
      type: "skill",
      version: 1,
    };
  }

  createDOM(): HTMLElement {
    return document.createElement("span");
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return createElement(SelectedSkillToken, {
      nodeKey: this.getKey(),
      skill: this.getSkill(),
    });
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createTextNode(this.getTextContent()) };
  }

  getTextContent(): string {
    return `$${this.getSkill().displayName}`;
  }

  getSkill(): SkillNodeState {
    const self = this.getLatest();
    return {
      name: self.__name,
      path: self.__path,
      displayName: self.__displayName,
      sourceLabel: self.__sourceLabel,
    };
  }

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }
}

export function $createSkillNode(state: SkillNodeState): SkillNode {
  return $applyNodeReplacement(new SkillNode(state));
}

export function $isSkillNode(node: LexicalNode | null | undefined): node is SkillNode {
  return node instanceof SkillNode;
}

export function activateSkillNode(
  editor: LexicalEditor,
  nodeKey: NodeKey,
): ActivateSkillNodeResult {
  const root = editor.getRootElement();
  if (root?.isConnected !== true) return "unavailable";

  const activation = { completed: false };
  const isCurrentRootAvailable = () => editor.getRootElement() === root && root.isConnected;
  editor.update(
    () => {
      if (!isCurrentRootAvailable()) return;
      const node = $getNodeByKey(nodeKey);
      if (!$isSkillNode(node) || !node.isAttached()) return;

      const selection = $createNodeSelection();
      selection.add(nodeKey);
      $setSelection(selection);
      activation.completed = true;
    },
    { discrete: true },
  );

  if (!activation.completed || !isCurrentRootAvailable()) {
    return "unavailable";
  }
  root.focus({ preventScroll: true });
  return "activated";
}

function assertSerializedSkillNode(
  serializedNode: SerializedSkillNode,
): asserts serializedNode is SerializedSkillNode {
  const candidate = serializedNode as unknown as Record<string, unknown>;
  if (candidate.version !== 1) {
    throw new Error(`Unsupported SkillNode version: ${String(candidate.version)}`);
  }

  for (const field of ["name", "path", "displayName", "sourceLabel"] as const) {
    if (typeof candidate[field] !== "string") {
      throw new Error(`Invalid SkillNode ${field}`);
    }
  }
}
