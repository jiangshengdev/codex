import type { TurnStartParams } from "@codex-protocol/v2";
import { $getRoot, $isElementNode, type EditorState, type LexicalNode } from "lexical";
import { $isSkillNode, type SkillNodeState } from "./SkillNode";

export function compileComposerDraft(editorState: EditorState): TurnStartParams["input"] {
  return editorState.read(() => {
    const skills: SkillNodeState[] = [];
    const seenPaths = new Set<string>();
    const text = compileNode($getRoot(), skills, seenPaths);
    const input: TurnStartParams["input"] = [{ type: "text", text, text_elements: [] }];

    for (const { name, path } of skills) {
      input.push({ type: "skill", name, path });
    }
    return input;
  });
}

function compileNode(node: LexicalNode, skills: SkillNodeState[], seenPaths: Set<string>): string {
  if ($isSkillNode(node)) {
    const skill = node.getSkill();
    if (!seenPaths.has(skill.path)) {
      seenPaths.add(skill.path);
      skills.push(skill);
    }
    return `$${skill.name}`;
  }

  if (!$isElementNode(node)) {
    return node.getTextContent();
  }

  const children = node.getChildren();
  let text = "";
  for (const [index, child] of children.entries()) {
    text += compileNode(child, skills, seenPaths);
    if ($isElementNode(child) && index !== children.length - 1 && !child.isInline()) {
      text += "\n\n";
    }
  }
  return text;
}
