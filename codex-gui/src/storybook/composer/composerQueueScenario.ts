import { createComposerScenario, type ComposerScenario } from "./composerScenario";

export function createComposerQueueScenario() {
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
      session ??= createComposerScenario(persistence, "preview-active");
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
