import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $nodesOfType,
  $isElementNode,
  createEditor,
  type LexicalNode,
  type LexicalEditor,
} from "lexical";
import { describe, expect, it, vi } from "vitest";

import {
  captureComposerDraft,
  exportComposerDraft,
  importComposerDraft,
  projectComposerDraft,
  restoreComposerDraft,
  type ComposerDraft,
} from "../composerDraft";
import { $createSkillNode, $isSkillNode, SkillNode, type SkillNodeState } from "../SkillNode";
import { $createAttachmentNode, AttachmentNode } from "../AttachmentNode";

describe("composerDraft", () => {
  it("round-trips mixed UTF-8 text, a skill, a file, and images in document rather than creation order", () => {
    const source = createTestEditor();
    const selected = skill("alpha", "/skills/alpha", "技能");
    source.update(
      () => {
        const secondImage = $createAttachmentNode({
          id: "image-2",
          name: "第二张.png",
          mediaType: "image",
          status: "ready",
          path: "/tmp/second.png",
          failure: null,
        });
        const firstImage = $createAttachmentNode({
          id: "image-1",
          name: "第一张.png",
          mediaType: "image",
          status: "ready",
          path: "/tmp/first.png",
          failure: null,
        });
        const file = $createAttachmentNode({
          id: "file",
          name: "报告.txt",
          mediaType: "file",
          status: "ready",
          path: "/tmp/a.txt",
          failure: null,
        });
        $getRoot().append(
          $createParagraphNode().append(
            $createTextNode("资料🙂 "),
            $createSkillNode(selected),
            $createTextNode(" "),
            file,
            $createTextNode(" "),
            firstImage,
            $createTextNode(" "),
            secondImage,
          ),
        );
      },
      { discrete: true },
    );
    const original = captureComposerDraft(source.getEditorState());
    const expected = {
      input: [
        {
          type: "text",
          text: "资料🙂 $alpha /tmp/a.txt /tmp/first.png /tmp/second.png",
          text_elements: [
            { byteRange: { start: 18, end: 28 }, placeholder: "报告.txt" },
            { byteRange: { start: 29, end: 43 }, placeholder: "第一张.png" },
            { byteRange: { start: 44, end: 59 }, placeholder: "第二张.png" },
          ],
        },
        { type: "localImage", path: "/tmp/first.png" },
        { type: "localImage", path: "/tmp/second.png" },
        { type: "skill", name: "alpha", path: "/skills/alpha" },
      ],
      textContent: "资料🙂 $技能 报告.txt 第一张.png 第二张.png",
      selectedSkillPaths: ["/skills/alpha"],
      attachmentsReady: true,
    };
    expect(original).toMatchObject(expected);
    const imported = importComposerDraft(
      JSON.parse(JSON.stringify(exportComposerDraft(original.draft))),
    );
    if (imported.type !== "imported") throw new Error("Expected mixed attachment draft to import");
    const target = createEditorWithText("replace me");
    expect(restoreComposerDraft(target, imported.draft)).toEqual({ type: "restored" });
    const restored = captureComposerDraft(target.getEditorState());
    expect(restored).toMatchObject(expected);
    expect(restored.input).toEqual(original.input);
    expect(readSkills(target)).toEqual([selected]);
    const restoredExport = exportComposerDraft(restored.draft);
    const originalExport = exportComposerDraft(original.draft);
    expect(restoredExport.version).toBe(originalExport.version);
    expect(JSON.parse(restoredExport.editorStateJson)).toEqual(
      JSON.parse(originalExport.editorStateJson),
    );
  });

  it("restores an unfinished upload as interrupted and keeps submission blocked", () => {
    const source = createTestEditor();
    source.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createTextNode("keep "),
            $createAttachmentNode({
              id: "uploading",
              name: "待上传.png",
              mediaType: "image",
              status: "uploading",
              path: "",
              failure: null,
            }),
          ),
        );
      },
      { discrete: true },
    );
    const original = captureComposerDraft(source.getEditorState());
    expect(original.attachmentsReady).toBe(false);
    const imported = importComposerDraft(exportComposerDraft(original.draft));
    if (imported.type !== "imported")
      throw new Error("Expected unfinished attachment draft to import");
    const target = createEditorWithText("replace me");
    expect(restoreComposerDraft(target, imported.draft)).toEqual({ type: "restored" });
    expect(captureComposerDraft(target.getEditorState())).toMatchObject({
      textContent: "keep 待上传.png",
      attachmentsReady: false,
      input: [{ type: "text", text: "keep ", text_elements: [] }],
    });
    expect(
      target
        .getEditorState()
        .read(() => $nodesOfType(AttachmentNode).map((node) => node.getAttachment())),
    ).toEqual([
      {
        id: "uploading",
        name: "待上传.png",
        mediaType: "image",
        status: "failed",
        path: "",
        failure: "interrupted",
      },
    ]);
  });

  it("migrates v1 soft breaks and double paragraph boundaries once without losing skills", () => {
    const source = createTestEditor();
    const selected = skill("alpha", "/skills/alpha", "Alpha");
    source.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createLineBreakNode(),
            $createSkillNode(selected),
            $createLineBreakNode(),
            $createLineBreakNode(),
            $createTextNode("tail"),
            $createLineBreakNode(),
          ),
          $createParagraphNode(),
          $createParagraphNode().append($createTextNode("last")),
        );
      },
      { discrete: true },
    );
    const imported = importComposerDraft({
      version: 1,
      editorStateJson: JSON.stringify(source.getEditorState().toJSON()),
    });
    if (imported.type !== "imported") throw new Error("Expected legacy import");
    const target = createEditorWithText("current");
    expect(restoreComposerDraft(target, imported.draft)).toEqual({ type: "restored" });
    const migrated = captureComposerDraft(target.getEditorState());
    expect(migrated.textContent).toBe("\n$Alpha\n\ntail\n\n\n\n\nlast");
    expect(migrated.input).toEqual([
      { type: "text", text: "\n$alpha\n\ntail\n\n\n\n\nlast", text_elements: [] },
      { type: "skill", name: "alpha", path: "/skills/alpha" },
    ]);
    const exported = exportComposerDraft(migrated.draft);
    expect(exported.version).toBe(2);
    expect(exported.editorStateJson).not.toContain('"type":"linebreak"');
    const again = importComposerDraft(exported);
    if (again.type !== "imported") throw new Error("Expected current import");
    expect(restoreComposerDraft(target, again.draft)).toEqual({ type: "restored" });
    expect(captureComposerDraft(target.getEditorState()).input).toEqual(migrated.input);
    expect(readSkills(target)).toEqual([selected]);
  });

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
        text: "first paragraph\nsecond paragraph",
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

  it("projects every skill in full document order without collapsing repeated paths", () => {
    const editor = createTestEditor();
    const repeatedPath = "/example/skills/repeated/SKILL.md";
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createTextNode("Before "),
            $createSkillNode(skill("first", repeatedPath, "First")),
            $createTextNode(" and "),
            $createSkillNode(skill("second", repeatedPath, "Second")),
          ),
          $createParagraphNode().append(
            $createSkillNode(skill("third", "/example/skills/third/SKILL.md", "Third")),
            $createTextNode(" after"),
          ),
        );
      },
      { discrete: true },
    );

    expect(projectComposerDraft(editor.getEditorState())).toEqual({
      textContent: "Before $First and $Second\n$Third after",
      attachmentsReady: true,
      selectedSkillPaths: [repeatedPath, repeatedPath, "/example/skills/third/SKILL.md"],
    });
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
          text: "literal $shared then $shared and $renamed\n$shared done",
          text_elements: [],
        },
        { type: "skill", name: "shared", path: first.path },
        { type: "skill", name: "shared", path: second.path },
      ],
      selectedSkillPaths: [first.path, first.path, second.path],
      textContent:
        "literal $shared then $First display and $Duplicate display\n$Second display done",
    });
    expect(readSkills(editor)).toEqual([first, duplicate, second]);
  });

  it("rejects an invalid opaque draft without changing the editor", () => {
    const editor = createEditorWithText("current draft");
    const invalidDraft = {} as ComposerDraft;

    expect(restoreComposerDraft(editor, invalidDraft)).toEqual({ type: "invalidDraft" });
    expect(captureComposerDraft(editor.getEditorState()).textContent).toBe("current draft");
  });

  it("restores JSON-persisted text and skill identity into a different editor", () => {
    const source = createTestEditor();
    const selectedSkill = skill("canonical", "/skills/example/SKILL.md", "Display", "User");
    source.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append($createTextNode("Use "), $createSkillNode(selectedSkill)),
          $createParagraphNode().append($createTextNode("second paragraph")),
        );
      },
      { discrete: true },
    );
    const capture = captureComposerDraft(source.getEditorState());
    const stored: unknown = JSON.parse(JSON.stringify(exportComposerDraft(capture.draft)));
    const imported = importComposerDraft(stored);
    expect(imported.type).toBe("imported");
    if (imported.type !== "imported") throw new Error("Expected an imported draft");

    const target = createEditorWithText("existing input");
    expect(imported.draft).not.toBe(capture.draft);
    expect(restoreComposerDraft(target, imported.draft)).toEqual({ type: "restored" });
    const restored = captureComposerDraft(target.getEditorState());
    expect(restored.input).toEqual(capture.input);
    expect(restored.textContent).toEqual(capture.textContent);
    expect(restored.selectedSkillPaths).toEqual(capture.selectedSkillPaths);
    expect(readSkills(target)).toEqual([selectedSkill]);
  });

  it("keeps an exported draft independent from later editor updates", () => {
    const source = createEditorWithText("saved input");
    const stored = exportComposerDraft(captureComposerDraft(source.getEditorState()).draft);
    source.update(
      () => {
        $getRoot()
          .clear()
          .append($createParagraphNode().append($createTextNode("later input")));
      },
      { discrete: true },
    );
    const imported = importComposerDraft(stored);
    if (imported.type !== "imported") throw new Error("Expected an imported draft");
    const target = createEditorWithText("current input");
    expect(restoreComposerDraft(target, imported.draft)).toEqual({ type: "restored" });
    expect(captureComposerDraft(target.getEditorState()).textContent).toBe("saved input");
    expect(captureComposerDraft(source.getEditorState()).textContent).toBe("later input");
  });

  it.each([
    null,
    {},
    { version: 2, editorStateJson: "{}" },
    { version: 1, editorStateJson: {} },
    { version: 1, editorStateJson: "{" },
    { version: 1, editorStateJson: "{}" },
    { version: 1, editorStateJson: '{"root":{"type":"unknown-node","version":1}}' },
  ])("rejects an invalid persisted draft: %j", (value) => {
    expect(importComposerDraft(value)).toEqual({ type: "invalidDraft" });
  });

  it("uses SkillNode validation when importing stored content", () => {
    const source = createTestEditor();
    source.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append(
            $createSkillNode(skill("example", "/skills/example", "Example")),
          ),
        );
      },
      { discrete: true },
    );
    const stored = exportComposerDraft(captureComposerDraft(source.getEditorState()).draft);
    const invalidSkill = stored.editorStateJson.replace('"path":"/skills/example"', '"path":42');
    expect(importComposerDraft({ ...stored, editorStateJson: invalidSkill })).toEqual({
      type: "invalidDraft",
    });
  });

  it("does not export an unregistered opaque draft", () => {
    expect(() => exportComposerDraft({} as ComposerDraft)).toThrow(
      "Cannot export an invalid composer draft",
    );
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
  return editor.getEditorState().read(() => collectSkills($getRoot()));
}

function collectSkills(node: LexicalNode): SkillNodeState[] {
  if ($isSkillNode(node)) {
    return [node.getSkill()];
  }
  if (!$isElementNode(node)) {
    return [];
  }
  return node.getChildren().flatMap(collectSkills);
}

function createTestEditor(): LexicalEditor {
  return createEditor({
    namespace: "composer-draft-test",
    nodes: [SkillNode, AttachmentNode],
    onError(error) {
      throw error;
    },
  });
}
