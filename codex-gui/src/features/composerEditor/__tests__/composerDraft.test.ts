import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor,
} from "lexical";
import { describe, expect, it, vi } from "vitest";

import { captureComposerDraft, restoreComposerDraft, type ComposerDraft } from "../composerDraft";
import { $createSkillNode, $isSkillNode, SkillNode, type SkillNodeState } from "../SkillNode";

describe("composerDraft", () => {
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

    expect(captureComposerDraft(editor.getEditorState()).input).toEqual([
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

    expect(captureComposerDraft(editor.getEditorState()).input).toEqual([
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

    expect(captureComposerDraft(editor.getEditorState()).input).toEqual([
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

    expect(captureComposerDraft(editor.getEditorState()).input).toEqual([
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

    expect(captureComposerDraft(editor.getEditorState()).input).toEqual([
      { type: "text", text: "$only-skill", text_elements: [] },
      {
        type: "skill",
        name: "only-skill",
        path: "/example/skills/only/SKILL.md",
      },
    ]);
  });

  it("round-trips literal skill text, paragraphs, duplicate paths, and distinct same-name skills", () => {
    const editor = createTestEditor();
    const first = skill("shared", "/skills/first/SKILL.md", "First display", "User");
    const duplicate = skill("renamed", first.path, "Duplicate display", "Repository");
    const second = skill("shared", "/skills/second/SKILL.md", "Second display", "System");
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createTextNode("literal $shared then "),
            $createSkillNode(first),
            $createTextNode(" and "),
            $createSkillNode(duplicate),
          ),
          $createParagraphNode().append($createSkillNode(second), $createTextNode(" done")),
        );
      },
      { discrete: true },
    );
    const capture = captureComposerDraft(editor.getEditorState());

    editor.update(
      () => {
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode("replacement")));
      },
      { discrete: true },
    );

    expect(restoreComposerDraft(editor, capture.draft)).toEqual({ type: "restored" });
    const restoredCapture = captureComposerDraft(editor.getEditorState());
    expect(restoredCapture).toMatchObject({
      input: [
        {
          type: "text",
          text: "literal $shared then $shared and $renamed\n\n$shared done",
          text_elements: [],
        },
        { type: "skill", name: "shared", path: first.path },
        { type: "skill", name: "shared", path: second.path },
      ],
      selectedSkillPaths: [first.path, first.path, second.path],
      textContent:
        "literal $shared then $First display and $Duplicate display\n\n$Second display done",
    });
    expect(readSkills(editor)).toEqual([first, duplicate, second]);
  });

  it("rejects an invalid opaque draft without changing the editor", () => {
    const editor = createEditorWithText("current draft");
    const invalidDraft = {} as ComposerDraft;

    expect(restoreComposerDraft(editor, invalidDraft)).toEqual({ type: "invalidDraft" });
    expect(captureComposerDraft(editor.getEditorState()).textContent).toBe("current draft");
  });

  it("keeps the editor unchanged when Lexical parsing fails", () => {
    const source = createEditorWithText("saved draft");
    const capture = captureComposerDraft(source.getEditorState());
    const target = createEditorWithText("current draft");
    vi.spyOn(target, "parseEditorState").mockImplementation(() => {
      throw new Error("parse failed");
    });

    expect(restoreComposerDraft(target, capture.draft)).toEqual({ type: "invalidDraft" });
    expect(captureComposerDraft(target.getEditorState()).textContent).toBe("current draft");
  });
});

function skill(name: string, path: string, displayName: string, sourceLabel = ""): SkillNodeState {
  return { name, path, displayName, sourceLabel };
}

function createEditorWithText(text: string): LexicalEditor {
  const editor = createTestEditor();
  editor.update(
    () => {
      $getRoot().append($createParagraphNode().append($createTextNode(text)));
    },
    { discrete: true },
  );
  return editor;
}

function readSkills(editor: LexicalEditor): SkillNodeState[] {
  return editor.getEditorState().read(() =>
    $getRoot()
      .getAllTextNodes()
      .filter($isSkillNode)
      .map((node) => node.getSkill()),
  );
}

function createTestEditor(): LexicalEditor {
  return createEditor({
    namespace: "composer-draft-test",
    nodes: [SkillNode],
    onError(error) {
      throw error;
    },
  });
}
