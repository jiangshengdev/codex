import { $createParagraphNode, $getRoot, createEditor, DecoratorNode } from "lexical";
import { describe, expect, it } from "vitest";

import { $createSkillNode, SkillNode, type SerializedSkillNode } from "../SkillNode";

const skill = {
  name: "canonical-skill",
  path: "/private/skills/canonical-skill/SKILL.md",
  displayName: "Friendly Skill",
  sourceLabel: "User",
} as const;

describe("SkillNode", () => {
  it("keeps canonical fields while exposing visible display text as an inline atomic decorator", () => {
    const editor = createTestEditor();

    editor.update(
      () => {
        const node = $createSkillNode(skill);
        $getRoot().append($createParagraphNode().append(node));

        expect(node.getSkill()).toEqual(skill);
        expect(node.getTextContent()).toBe("$Friendly Skill");
        expect(node).toBeInstanceOf(DecoratorNode);
        expect(node.isInline()).toBe(true);
        expect(node.isKeyboardSelectable()).toBe(true);
        expect(node.canInsertTextBefore()).toBe(false);
        expect(node.canInsertTextAfter()).toBe(false);
      },
      { discrete: true },
    );
  });

  it("round-trips the explicit version 1 JSON shape", () => {
    const editor = createTestEditor();

    editor.update(
      () => {
        const serialized = $createSkillNode(skill).exportJSON();
        const restored = SkillNode.importJSON(serialized);
        $getRoot().append($createParagraphNode().append(restored));

        expect(serialized).toEqual({
          detail: 0,
          format: 0,
          mode: "token",
          style: "",
          text: "$Friendly Skill",
          ...skill,
          type: "skill",
          version: 1,
        });
        expect(restored.getSkill()).toEqual(skill);
        expect(restored.getTextContent()).toBe("$Friendly Skill");
        expect(restored).toBeInstanceOf(DecoratorNode);
        expect(restored.isInline()).toBe(true);
        expect(restored.isKeyboardSelectable()).toBe(true);
      },
      { discrete: true },
    );
  });

  it("does not expose canonical identity or presentation details through visible text", () => {
    const editor = createTestEditor();

    editor.update(
      () => {
        const node = $createSkillNode(skill);
        $getRoot().append($createParagraphNode().append(node));

        expect(node.getTextContent()).toBe("$Friendly Skill");
        expect(node.getTextContent()).not.toContain("canonical-skill");
        expect(node.getTextContent()).not.toContain(skill.path);
        expect(node.exportJSON()).not.toHaveProperty("description");
        expect(node.exportJSON()).not.toHaveProperty("scope");
      },
      { discrete: true },
    );
  });

  it("rejects unknown JSON versions before restoring a skill identity", () => {
    const serialized = {
      detail: 0,
      format: 0,
      mode: "token",
      style: "",
      text: "$Friendly Skill",
      ...skill,
      type: "skill",
      version: 2,
    } as unknown as SerializedSkillNode;

    expect(() => SkillNode.importJSON(serialized)).toThrow("Unsupported SkillNode version: 2");
  });
});

function createTestEditor() {
  return createEditor({
    namespace: "skill-node-test",
    nodes: [SkillNode],
    onError(error) {
      throw error;
    },
  });
}
