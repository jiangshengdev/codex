import type { ThreadForkSnapshot } from "@/features/threadFork/threadForkOwner";
import { historyEarlierId, historyReturnedId, historySelectedId } from "./historyFixtures";

const initialSnapshot: ThreadForkSnapshot = {
  pending: false,
  sourceThreadId: historySelectedId,
  lastTurnId: `turn-${historySelectedId}`,
  failure: null,
  recoveries: [],
};

export const creationFailure: ThreadForkSnapshot = {
  ...initialSnapshot,
  failure: {
    stage: "create",
    delivery: "definitelyNotAccepted",
    error: new Error("STORYBOOK_FORK_FAILED: The simulated fork request was not accepted."),
  },
};

export const resultUnknown: ThreadForkSnapshot = {
  ...initialSnapshot,
  failure: {
    stage: "create",
    delivery: "deliveryUnknown",
    error: new Error(
      "STORYBOOK_FORK_FAILED: The connection closed before the fork result arrived.",
    ),
  },
};

export const createdUnopened: ThreadForkSnapshot = {
  ...initialSnapshot,
  recoveries: [{ threadId: historyReturnedId, needsActivation: true, failure: null }],
};

export const openFailed: ThreadForkSnapshot = {
  ...initialSnapshot,
  recoveries: [
    {
      threadId: historyReturnedId,
      needsActivation: true,
      failure: {
        stage: "activate",
        delivery: "definitelyNotAccepted",
        error: new Error("STORYBOOK_FORK_FAILED: The saved fork could not be activated."),
      },
    },
  ],
};

export const pending: ThreadForkSnapshot = { ...createdUnopened, pending: true };

export const unavailable: ThreadForkSnapshot = createdUnopened;

export const forkSnapshots = {
  creationFailure,
  resultUnknown,
  createdUnopened,
  openFailed,
  pending,
  unavailable,
  navigationFailed: createdUnopened,
  completed: createdUnopened,
  pageCoexistence: {
    ...resultUnknown,
    recoveries: [
      ...openFailed.recoveries,
      { threadId: historyEarlierId, needsActivation: true, failure: null },
    ],
  },
};
export type ForkScenario = keyof typeof forkSnapshots;
