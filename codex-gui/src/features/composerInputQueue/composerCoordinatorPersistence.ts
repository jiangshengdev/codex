import { importComposerDraft } from "@/features/composerEditor/composerDraft";
import type { PersistedComposerDraft } from "@/features/composerEditor/composerEditorContracts";

import {
  createComposerInputQueue,
  upgradeComposerInputQueueState,
  type ComposerInputQueuePersistedState,
} from "./composerInputQueue";
import {
  decodePersistedComposerInterruptState,
  type PersistedComposerInterruptState,
} from "./composerInterruptState";

export type ComposerCoordinatorRecord = Readonly<{
  version: 1;
  queue: ComposerInputQueuePersistedState;
  draft: PersistedComposerDraft | null;
  interrupt: PersistedComposerInterruptState;
  failedInterruptTurnId: string | null;
}>;

export function decodeComposerCoordinatorRecord(
  value: unknown,
  threadId: string,
): ComposerCoordinatorRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid persisted composer record");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    throw new Error("Unsupported persisted composer record version");
  }
  if (
    record.failedInterruptTurnId !== null &&
    (typeof record.failedInterruptTurnId !== "string" || record.failedInterruptTurnId.length === 0)
  ) {
    throw new Error("Invalid persisted failed interrupt target");
  }
  if (record.draft !== null && importComposerDraft(record.draft).type !== "imported") {
    throw new Error("Invalid persisted composer draft");
  }

  const queue = createComposerInputQueue({ threadId, activeTurnId: null });
  const upgradedQueue = upgradeComposerInputQueueState(record.queue);
  queue.rehydrateState(upgradedQueue);
  const interrupt = decodePersistedComposerInterruptState(record.interrupt);
  if (
    (interrupt.pending !== null && interrupt.pending.params.threadId !== threadId) ||
    interrupt.recentTerminals.some((target) => target.threadId !== threadId)
  ) {
    throw new Error("Persisted interrupt belongs to a different thread");
  }

  return {
    version: 1,
    // The owner validated the stored data above. Keep its original phases here:
    // issuing becomes unknown only on live recovery, not during commit validation.
    queue: upgradedQueue as ComposerInputQueuePersistedState,
    draft: record.draft as PersistedComposerDraft | null,
    interrupt,
    failedInterruptTurnId: record.failedInterruptTurnId,
  };
}
