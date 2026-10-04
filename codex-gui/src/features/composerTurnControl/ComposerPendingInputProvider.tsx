import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ComposerPendingInputDrawer } from "./ComposerPendingInputDrawer";
import { PendingInputContext, PendingInputHost } from "./composerPendingInputHost";
import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";

export function ComposerPendingInputProvider({
  children,
  renderConnectionRecovery,
}: Readonly<{
  children: ReactNode;
  renderConnectionRecovery?: (composerRole: ActiveThreadComposerRole) => ReactNode;
}>) {
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
            recoveryNotice={renderConnectionRecovery?.(connection.binding.composerRole)}
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
