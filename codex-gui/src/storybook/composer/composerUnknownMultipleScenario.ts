import { BrowserPersistenceStore } from "@/features/browserPersistence/browserPersistenceStore";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import {
  decodeComposerCoordinatorRecord,
  type ComposerCoordinatorRecord,
} from "@/features/composerInputQueue/composerCoordinatorPersistence";
import { createComposerInputQueue } from "@/features/composerInputQueue/composerInputQueue";
import { createComposerInterruptState } from "@/features/composerInputQueue/composerInterruptState";
import { createComposerScenario } from "./composerScenario";
import { composerLongSendText } from "./composerLongSendText";
import { mixedMessageText } from "../mixedMessageText";

export function createComposerUnknownMultipleScenario(longText = false, longList = false) {
  const queue = createComposerInputQueue({ threadId: "thread-1", activeTurnId: "preview-history" });
  const texts = longList
    ? Array.from({ length: 23 }, (_, index) => mixedMessageText("Historical guide", index + 1))
    : [
        longText ? composerLongSendText : "Review the fictional implementation.",
        "Check the fictional tests and edge cases.",
        "Summarize the fictional changes and remaining questions.",
      ];
  for (const text of texts) {
    const capture = composerDraftCapture(text);
    const effect = queue.submitSteer({
      type: "recoverable",
      id: crypto.randomUUID(),
      draft: capture.draft,
      input: capture.input,
    }).effects[0];
    if (effect?.type !== "performSteer") throw new Error("Expected preview guide claim");
    queue.settleSteer({ type: "accepted", claim: effect.claim, turnId: "preview-history" });
  }
  const state = queue.exportState(null);
  const records = new Map<string, string>();
  const persistence = {
    authorizationContext: crypto.randomUUID(),
    storage: {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => {
        records.set(key, value);
      },
    },
  };
  const store = new BrowserPersistenceStore<ComposerCoordinatorRecord>({
    ...persistence,
    threadId: "thread-1",
    codec: {
      encode: (value) => value,
      decode: (value) => decodeComposerCoordinatorRecord(value, "thread-1"),
    },
  });
  // Display a supported recovery record with several unresolved historical guides.
  // Ordinary sends remain serial; this fixture does not simulate parallel starts.
  store.commit(
    {
      version: 1,
      queue: {
        ...state,
        steer: {
          ...state.steer,
          pending: state.steer.pending.map((entry) => ({ ...entry, phase: "deliveryUnknown" })),
        },
      },
      draft: null,
      interrupt: createComposerInterruptState().exportState(),
      failedInterruptTurnId: null,
    },
    null,
  );
  return createComposerScenario(persistence);
}
