import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";
import { describe, expect, it } from "vitest";
import { $createSkillNode, SkillNode, type SkillNodeState } from "../SkillNode";
import { compileComposerDraft } from "../compileComposerDraft";

describe("compileComposerDraft", () => {
  it("preserves ordinary text and paragraph line breaks", () => {
    const editor = createTestEditor();
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append($createTextNode("first paragraph")),
          $createParagraphNode().append($createTextNode("second paragraph")),
        );
      },
      { discrete: true },
    );

    expect(compileComposerDraft(editor.getEditorState())).toEqual([
      {
        type: "text",
        text: "first paragraph\n\nsecond paragraph",
        text_elements: [],
      },
    ]);
  });

  it("uses the canonical name in plain text and appends structured skills after text", () => {
    const editor = createTestEditor();
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createTextNode("Use "),
            $createSkillNode(
              skill("canonical-skill", "/example/skills/canonical/SKILL.md", "Friendly Skill"),
            ),
            $createTextNode(" now"),
          ),
        );
      },
      { discrete: true },
    );

    expect(compileComposerDraft(editor.getEditorState())).toEqual([
      { type: "text", text: "Use $canonical-skill now", text_elements: [] },
      {
        type: "skill",
        name: "canonical-skill",
        path: "/example/skills/canonical/SKILL.md",
      },
    ]);
  });

  it("deduplicates the same path and keeps the first structured identity", () => {
    const editor = createTestEditor();
    const path = "/example/skills/shared/SKILL.md";
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createSkillNode(skill("first-name", path, "First")),
            $createTextNode(" then "),
            $createSkillNode(skill("later-name", path, "Later")),
          ),
        );
      },
      { discrete: true },
    );

    expect(compileComposerDraft(editor.getEditorState())).toEqual([
      { type: "text", text: "$first-name then $later-name", text_elements: [] },
      { type: "skill", name: "first-name", path },
    ]);
  });

  it("keeps equal canonical names with different paths as separate ordered skills", () => {
    const editor = createTestEditor();
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createSkillNode(skill("shared-name", "/example/skills/first/SKILL.md", "First")),
            $createTextNode(" and "),
            $createSkillNode(skill("shared-name", "/example/skills/second/SKILL.md", "Second")),
          ),
        );
      },
      { discrete: true },
    );

    expect(compileComposerDraft(editor.getEditorState())).toEqual([
      { type: "text", text: "$shared-name and $shared-name", text_elements: [] },
      {
        type: "skill",
        name: "shared-name",
        path: "/example/skills/first/SKILL.md",
      },
      {
        type: "skill",
        name: "shared-name",
        path: "/example/skills/second/SKILL.md",
      },
    ]);
  });

  it("compiles a skill-only editor into a meaningful text and skill input", () => {
    const editor = createTestEditor();
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createSkillNode(skill("only-skill", "/example/skills/only/SKILL.md", "Only Skill")),
          ),
        );
      },
      { discrete: true },
    );

    expect(compileComposerDraft(editor.getEditorState())).toEqual([
      { type: "text", text: "$only-skill", text_elements: [] },
      {
        type: "skill",
        name: "only-skill",
        path: "/example/skills/only/SKILL.md",
      },
    ]);
  });
});

function skill(name: string, path: string, displayName: string): SkillNodeState {
  return { name, path, displayName, sourceLabel: "" };
}

function createTestEditor() {
  return createEditor({
    namespace: "compile-composer-draft-test",
    nodes: [SkillNode],
    onError(error) {
      throw error;
    },
  });
}
