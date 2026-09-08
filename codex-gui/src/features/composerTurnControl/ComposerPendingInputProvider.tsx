import { useLingui } from "@lingui/react/macro";
import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createListenerSet } from "@/subscriptions/listenerSet";
import {
  ComposerPendingInputDrawer,
  type ComposerPendingInputDrawerProps,
} from "./ComposerPendingInputDrawer";
import { createComposerPendingInputSession } from "./composerPendingInputSession";

type Binding = Omit<
  ComposerPendingInputDrawerProps,
  "pendingInputSession" | "pendingInputSnapshot"
>;
type Connection = Readonly<{ token: object; binding: Binding }>;

class PendingInputHost {
  readonly session = createComposerPendingInputSession();
  private readonly listeners = createListenerSet();
  private current: Connection | null = null;
  private displayed: Connection | null = null;
  private snapshot = { connection: this.displayed, pending: this.session.getSnapshot() };
  private readonly unsubscribe = this.session.subscribe(() => {
    this.publish();
  });

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => this.listeners.subscribe(listener);

  connect(token: object, binding: Binding): void {
    if (
      this.current?.token !== token &&
      this.displayed != null &&
      this.displayed.token !== token &&
      this.session.getSnapshot().phase === "open"
    ) {
      this.session.disconnect(this.displayed.binding);
    }
    this.current = { token, binding };
    if (
      this.displayed == null ||
      this.displayed.token === token ||
      (this.session.getSnapshot().phase === "closed" &&
        this.session.getSnapshot().effects.length === 0)
    ) {
      this.displayed = this.current;
      this.session.project(binding);
    }
    this.publish();
  }

  disconnect(token: object): void {
    if (this.current?.token !== token) return;
    this.current = null;
    if (this.displayed?.token === token) this.session.disconnect(this.displayed.binding);
    this.publish();
  }

  isConnected(connection: Connection): boolean {
    return this.current?.token === connection.token;
  }

  dispose(): void {
    this.unsubscribe();
    this.session.dispose();
    this.listeners.clear();
  }

  private publish(): void {
    if (
      this.session.getSnapshot().phase === "closed" &&
      this.session.getSnapshot().effects.length === 0
    )
      this.displayed = this.current;
    this.snapshot = { connection: this.displayed, pending: this.session.getSnapshot() };
    this.listeners.notify();
  }
}

const PendingInputContext = createContext<PendingInputHost | null>(null);

export function ComposerPendingInputProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { t } = useLingui();
  const [host] = useState(() => new PendingInputHost());
  const snapshot = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const fallbackRef = useRef<HTMLElement | null>(null);
  const lifecycle = useRef({ generation: 0 });
  useEffect(() => {
    const state = lifecycle.current;
    const generation = ++state.generation;
    return () => {
      queueMicrotask(() => {
        if (state.generation === generation) host.dispose();
      });
    };
  }, [host]);
  const connection = snapshot.connection;
  const focus = (target: "onFocusComposer" | "onFocusTrigger"): void => {
    if (connection != null && host.isConnected(connection)) connection.binding[target]();
    else fallbackRef.current?.focus();
  };
  return (
    <PendingInputContext value={host}>
      {children}
      <section ref={fallbackRef} tabIndex={-1} aria-label={t`Pending message editor`}>
        {connection == null ? null : (
          <ComposerPendingInputDrawer
            {...connection.binding}
            mutationsEnabled={host.isConnected(connection) && connection.binding.mutationsEnabled}
            pendingInputSession={host.session}
            pendingInputSnapshot={snapshot.pending}
            onFocusComposer={() => {
              focus("onFocusComposer");
            }}
            onFocusTrigger={() => {
              focus("onFocusTrigger");
            }}
          />
        )}
      </section>
    </PendingInputContext>
  );
}

export function useComposerPendingInput() {
  const host = use(PendingInputContext);
  if (host == null) throw new Error("ComposerPendingInputProvider is required");
  return host;
}

export function useComposerPendingInputBinding(binding: Binding): void {
  const host = useComposerPendingInput();
  const token = useMemo(() => ({ composerRole: binding.composerRole }), [binding.composerRole]);
  const lifecycle = useRef({ generation: 0 });
  const {
    composerRole,
    sessionRevision,
    snapshot,
    mutationsEnabled,
    guardCompositionEndEnter,
    skillCatalog,
    onRetrySkillCatalog,
    onFocusComposer,
    onFocusTrigger,
  } = binding;
  useLayoutEffect(() => {
    host.connect(token, {
      composerRole,
      sessionRevision,
      snapshot,
      mutationsEnabled,
      guardCompositionEndEnter,
      skillCatalog,
      onRetrySkillCatalog,
      onFocusComposer,
      onFocusTrigger,
    });
  }, [
    host,
    token,
    composerRole,
    sessionRevision,
    snapshot,
    mutationsEnabled,
    guardCompositionEndEnter,
    skillCatalog,
    onRetrySkillCatalog,
    onFocusComposer,
    onFocusTrigger,
  ]);
  useEffect(() => {
    const state = lifecycle.current;
    const generation = ++state.generation;
    const connectionToken = token;
    return () => {
      queueMicrotask(() => {
        if (state.generation === generation) host.disconnect(connectionToken);
      });
    };
  }, [host, token]);
}
