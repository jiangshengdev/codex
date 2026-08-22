import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";

import {
  captureComposerDraft,
  type ComposerDraftCapture,
} from "@/features/composerEditor/composerDraft";
import {
  $createSkillNode,
  SkillNode,
  type SkillNodeState,
} from "@/features/composerEditor/SkillNode";

import type { ComposerQueueMessage } from "../composerInputQueue";
import type { EnqueueSteerInput } from "../composerSteerQueueState";

type CaptureOptions = Readonly<{
  skill?: SkillNodeState | null;
}>;

const messageCaptures = new Map<string, ComposerDraftCapture>();

export function composerDraftCapture(
  text: string,
  options: CaptureOptions = {},
): ComposerDraftCapture {
  const editor = createEditor({
    namespace: "composer-input-queue-test",
    nodes: [SkillNode],
    onError(error) {
      throw error;
    },
  });
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      if (text !== "") {
        paragraph.append($createTextNode(text));
      }
      if (options.skill != null) {
        paragraph.append($createSkillNode(options.skill));
      }
      $getRoot().append(paragraph);
    },
    { discrete: true },
  );
  return captureComposerDraft(editor.getEditorState());
}

export function composerCapture(text: string): ComposerDraftCapture {
  return composerDraftCapture(text);
}

export function composerQueueMessage(id: string): ComposerQueueMessage {
  let capture = messageCaptures.get(id);
  if (capture == null) {
    capture = composerDraftCapture(`message ${id}`);
    messageCaptures.set(id, capture);
  }
  return {
    type: "recoverable",
    id,
    draft: capture.draft,
    input: capture.input,
  };
}

export function composerSteerInput(
  messageId: string,
  expectedTurnId = "turn-a",
): EnqueueSteerInput {
  return {
    message: composerQueueMessage(messageId),
    threadId: "thread-a",
    expectedTurnId,
    source: "direct",
  };
}
