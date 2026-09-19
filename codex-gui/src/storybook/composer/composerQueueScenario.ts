import { createComposerScenario, type ComposerScenario } from "./composerScenario";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import { mixedMessageText } from "../mixedMessageText";

export function createComposerQueueScenario(longList = false) {
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
  let session: ComposerScenario | null = null;
  return {
    createSession() {
      if (session == null) {
        session = createComposerScenario(persistence, "preview-active");
        if (longList)
          for (let index = 1; index <= 23; index++)
            session.coordinator.submit(
              composerDraftCapture(mixedMessageText("Ordinary message", index)),
            );
      }
      return session;
    },
    restore(activeTurnId: string | null) {
      session?.dispose();
      session = createComposerScenario(persistence, activeTurnId);
      return session;
    },
    dispose() {
      session?.dispose();
      session = null;
      records.clear();
    },
  };
}
