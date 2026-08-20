import {
  $applyNodeReplacement,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";

export type SkillNodeState = Readonly<{
  name: string;
  path: string;
  displayName: string;
  sourceLabel: string;
}>;

export type SerializedSkillNode = Spread<
  SkillNodeState & {
    type: "skill";
    version: 1;
  },
  SerializedTextNode
>;

export class SkillNode extends TextNode {
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
    super(`$${state.displayName}`, key);
    this.__name = state.name;
    this.__path = state.path;
    this.__displayName = state.displayName;
    this.__sourceLabel = state.sourceLabel;
  }

  $config() {
    return this.config("skill", { extends: TextNode });
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
    return $createSkillNode(serializedNode)
      .updateFromJSON(serializedNode)
      .setTextContent(`$${serializedNode.displayName}`)
      .setMode("token");
  }

  exportJSON(): SerializedSkillNode {
    return {
      ...super.exportJSON(),
      ...this.getSkill(),
      type: "skill",
      version: 1,
    };
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

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): false {
    return false;
  }

  canInsertTextAfter(): false {
    return false;
  }
}

export function $createSkillNode(state: SkillNodeState): SkillNode {
  return $applyNodeReplacement(new SkillNode(state).setMode("token"));
}

export function $isSkillNode(node: LexicalNode | null | undefined): node is SkillNode {
  return node instanceof SkillNode;
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
