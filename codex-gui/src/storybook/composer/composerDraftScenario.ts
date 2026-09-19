import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";
import { captureComposerDraft } from "@/features/composerEditor/composerDraft";
import { $createSkillNode, SkillNode } from "@/features/composerEditor/SkillNode";
import { createComposerScenario, previewSkill, type ComposerScenario } from "./composerScenario";

export function createComposerDraftScenario() {
  const records = new Map<string, string>();
  let failWrites = false;
  const persistence = {
    authorizationContext: crypto.randomUUID(),
    storage: {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) throw new Error("Simulated draft storage failure");
        records.set(key, value);
      },
    },
  };
  const editor = createEditor({
    namespace: "storybook-composer-draft",
    nodes: [SkillNode],
    onError(error) {
      throw error;
    },
  });
  editor.update(
    () => {
      $getRoot().append(
        $createParagraphNode().append($createTextNode("Review this fictional change.")),
        $createParagraphNode().append(
          $createTextNode("Keep the draft paragraphs and selected skill."),
          $createSkillNode({
            name: previewSkill.name,
            path: previewSkill.path,
            displayName: previewSkill.name,
            sourceLabel: "Repository",
          }),
        ),
      );
    },
    { discrete: true },
  );
  // Seed through the same serializer and storage transaction as a live draft.
  const seed = createComposerScenario(persistence);
  seed.coordinator.saveDraft(captureComposerDraft(editor.getEditorState()).draft);
  seed.dispose();
  let session: ComposerScenario | null = null;
  return {
    createSession() {
      session ??= createComposerScenario(persistence);
      return session;
    },
    leave() {
      session?.dispose();
      session = null;
    },
    setWriteFailure(value: boolean) {
      failWrites = value;
    },
    dispose() {
      session?.dispose();
      session = null;
      records.clear();
    },
  };
}
