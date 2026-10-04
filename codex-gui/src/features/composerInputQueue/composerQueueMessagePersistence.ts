import { validateV2TurnStartParams } from "@/generated/appServerProtocol/appServerPayloadValidators";
import {
  exportComposerDraft,
  importComposerDraft,
  type PersistedComposerDraft,
} from "@/features/composerEditor/composerDraft";
import { copyComposerInputPayload } from "@/features/composerInput/composerInputPayload";
import type { ComposerQueueMessage } from "./composerInputQueueContracts";
import {
  persistedRecord as persistenceObject,
  persistedString as persistenceIdentity,
} from "./composerLanePersistenceValidation";

export {
  persistedRecord as persistenceObject,
  persistedString as persistenceIdentity,
  persistedArray as persistenceArray,
} from "./composerLanePersistenceValidation";

export type PersistedComposerQueueMessage = Omit<ComposerQueueMessage, "draft"> &
  Readonly<{
    draft: PersistedComposerDraft;
  }>;

export function decodeComposerQueueInput(value: unknown): ComposerQueueMessage["input"] {
  const params = { threadId: "composer-persistence-validation", input: value };
  if (!validateV2TurnStartParams(params)) throw new Error("Invalid persisted composer input");
  return copyComposerInputPayload(params.input);
}

export function exportComposerQueueMessage(
  message: ComposerQueueMessage,
): PersistedComposerQueueMessage {
  return {
    ...message,
    input: copyComposerInputPayload(message.input),
    draft: exportComposerDraft(message.draft),
  };
}

export function importComposerQueueMessage(value: unknown): ComposerQueueMessage {
  const record = persistenceObject(value);
  if (record.type !== "recoverable") throw new Error("Invalid persisted composer message");
  const imported = importComposerDraft(record.draft);
  if (imported.type !== "imported") throw new Error("Invalid persisted composer draft");
  return {
    type: "recoverable",
    id: persistenceIdentity(record.id),
    input: decodeComposerQueueInput(record.input),
    draft: imported.draft,
  };
}
