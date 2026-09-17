import { $isElementNode, type LexicalNode } from "lexical";

import { $isSkillNode } from "./SkillNode";
import { $isAttachmentNode } from "./AttachmentNode";

export function $getComposerText(
  nodes: readonly LexicalNode[],
  skillText: "canonical" | "display",
): string {
  let text = "";
  let previous: LexicalNode | undefined;
  for (const node of nodes) {
    if (previous != null && (!previous.isInline() || !node.isInline())) text += "\n";
    if ($isSkillNode(node)) {
      const skill = node.getSkill();
      text += `$${skillText === "canonical" ? skill.name : skill.displayName}`;
    } else if ($isAttachmentNode(node)) {
      text += skillText === "canonical" ? node.getAttachment().path : node.getAttachment().name;
    } else {
      text += $isElementNode(node)
        ? $getComposerText(node.getChildren(), skillText)
        : node.getTextContent();
    }
    previous = node;
  }
  return text;
}
