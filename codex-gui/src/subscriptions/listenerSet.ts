/**
 * Synchronous notifications over a live set: changes during notification affect
 * the current pass, and listener errors propagate immediately. State, scheduling,
 * and disposal belong to the caller; clearing does not prevent new subscriptions.
 */
export function createListenerSet() {
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify(): void {
      for (const listener of listeners) listener();
    },
    clear(): void {
      listeners.clear();
    },
  };
}
