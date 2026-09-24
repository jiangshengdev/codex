import type {
  ActiveThreadActivationOutcome,
  ActiveThreadActivationWarning,
} from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import { historyCurrentId, historyReturnedId, historySelectedId } from "./historyFixtures";

export const continuationFailures = {
  unresolved: {
    type: "unavailable",
    failure: {
      type: "currentThreadUnresolved",
      activeThreadId: historyCurrentId,
      blockers: [{ type: "recoveryPending", count: 1 }],
    },
  },
  switchInProgress: {
    type: "unavailable",
    failure: { type: "switchInProgress" },
  },
  currentChanged: {
    type: "unavailable",
    failure: {
      type: "currentThreadChanged",
      activeThreadId: historyCurrentId,
      expectedRevision: 1,
      actualRevision: 2,
    },
  },
  currentChangedEmpty: {
    type: "unavailable",
    failure: {
      type: "currentThreadChanged",
      activeThreadId: null,
      expectedRevision: 1,
      actualRevision: 2,
    },
  },
  disconnectedBeforeCommit: {
    type: "unavailable",
    failure: {
      type: "connectionLost",
      progress: "beforeCommit",
      threadId: historySelectedId,
      cleanupError: null,
    },
  },
  disconnectedAfterCommit: {
    type: "unavailable",
    failure: {
      type: "connectionLost",
      progress: "afterCommit",
      threadId: historyReturnedId,
      cleanupError: new Error("STORYBOOK_CONTINUE_FAILED: Connection cleanup was interrupted."),
    },
  },
  // loaded, attach, and prepare share the same product feedback and available actions.
  preparationFailed: {
    type: "unavailable",
    failure: {
      type: "operationFailed",
      phase: "attach",
      error: new Error("STORYBOOK_CONTINUE_FAILED: The task connection could not be prepared."),
      cleanupError: null,
    },
  },
  resumeFailed: {
    type: "unavailable",
    failure: {
      type: "operationFailed",
      phase: "resume",
      error: new Error("STORYBOOK_CONTINUE_FAILED: The task could not be resumed."),
      cleanupError: null,
    },
  },
  activationFailed: {
    type: "unavailable",
    failure: {
      type: "operationFailed",
      phase: "activate",
      error: new Error("STORYBOOK_CONTINUE_FAILED: The task could not be activated."),
      cleanupError: null,
    },
  },
  empty: { type: "empty" },
} satisfies Record<string, ActiveThreadActivationOutcome>;

export type ContinuationFailurePreset = keyof typeof continuationFailures;

export const continuationWarnings = {
  synchronization: {
    type: "authorizationPersistenceFailed",
    error: new Error("STORYBOOK_CONTINUE_FAILED: Task state synchronization did not finish."),
  },
  cleanup: {
    type: "previousOwnerCleanupFailed",
    error: new Error("STORYBOOK_CONTINUE_FAILED: The previous task connection was not cleaned up."),
  },
} satisfies Record<string, ActiveThreadActivationWarning>;

export type ContinuationWarningPreset = keyof typeof continuationWarnings;
