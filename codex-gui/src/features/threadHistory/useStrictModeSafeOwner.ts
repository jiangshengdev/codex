import { useEffect, useRef, useSyncExternalStore } from "react";

type ExternalStoreOwner<State> = Readonly<{
  getSnapshot: () => State;
  subscribe: (listener: () => void) => () => void;
  start: () => unknown;
  dispose: () => void;
}>;

export function useStrictModeSafeOwner<State>(owner: ExternalStoreOwner<State>): State {
  const pendingDisposal = useRef<{
    owner: ExternalStoreOwner<State>;
    cancel: () => void;
  } | null>(null);
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot, owner.getSnapshot);

  useEffect(() => {
    if (pendingDisposal.current?.owner === owner) {
      pendingDisposal.current.cancel();
      pendingDisposal.current = null;
    }

    owner.start();
    return () => {
      let cancelled = false;
      const disposal = {
        owner,
        cancel: () => {
          cancelled = true;
        },
      };
      pendingDisposal.current = disposal;
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }
        if (pendingDisposal.current === disposal) {
          pendingDisposal.current = null;
        }
        owner.dispose();
      });
    };
  }, [owner]);

  return state;
}
