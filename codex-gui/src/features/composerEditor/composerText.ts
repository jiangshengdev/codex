import { $isElementNode, type LexicalNode } from "lexical";

import { $isSkillNode } from "./SkillNode";
import { $isAttachmentNode, type AttachmentState } from "./AttachmentNode";

export function $getComposerText(
  nodes: readonly LexicalNode[],
  skillText: "canonical" | "display",
): string {
  let text = "";
  for (const fragment of $getComposerTextFragments(nodes, skillText)) text += fragment.text;
  return text;
}

export function* $getComposerTextFragments(
  nodes: readonly LexicalNode[],
  skillText: "canonical" | "display",
): Generator<Readonly<{ text: string; attachment?: AttachmentState }>> {
  let previous: LexicalNode | undefined;
  for (const node of nodes) {
    if (previous != null && (!previous.isInline() || !node.isInline())) yield { text: "\n" };
    else if (skillText === "canonical" && $isAttachmentNode(previous) && $isAttachmentNode(node))
      yield { text: " " };
    if ($isSkillNode(node)) {
      const skill = node.getSkill();
      yield { text: `$${skillText === "canonical" ? skill.name : skill.displayName}` };
    } else if ($isAttachmentNode(node)) {
      const attachment = node.getAttachment();
      yield { text: skillText === "canonical" ? attachment.path : attachment.name, attachment };
    } else if ($isElementNode(node)) {
      yield* $getComposerTextFragments(node.getChildren(), skillText);
    } else {
      yield { text: node.getTextContent() };
    }
    previous = node;
  }
}
