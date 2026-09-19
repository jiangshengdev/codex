import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";
import { captureComposerDraft } from "@/features/composerEditor/composerDraft";
import { createComposerScenario } from "./composerScenario";

export function createComposerTextScenario(text: string) {
  const scenario = createComposerScenario();
  const editor = createEditor({
    namespace: "storybook-composer-text",
    onError(error) {
      throw error;
    },
  });
  editor.update(
    () => {
      for (const paragraph of text.split("\n")) {
        $getRoot().append($createParagraphNode().append($createTextNode(paragraph)));
      }
    },
    { discrete: true },
  );
  scenario.coordinator.saveDraft(captureComposerDraft(editor.getEditorState()).draft);
  return scenario;
}
