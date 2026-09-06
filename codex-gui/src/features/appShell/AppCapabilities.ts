import { createContext, use, useCallback, useSyncExternalStore } from "react";
import type {
  ActiveThreadSession,
  ActiveThreadSessionSnapshot,
} from "@/features/activeThreadSession/activeThreadSession";
import type { ActiveThreadCollectionSnapshot } from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";

export type AppCapabilities = Readonly<{
  status: GuiHostStatus;
  authorizationToken: string | null;
  commands: GuiHostCommands | null;
  routeTarget: GuiRouteTarget;
  activeThreadSession: ActiveThreadSession | null;
  activeThreadStartupError: string | null;
}>;

export const AppCapabilitiesContext = createContext<AppCapabilities | null>(null);

export function useAppCapabilities(): AppCapabilities {
  const capabilities = use(AppCapabilitiesContext);
  if (capabilities == null) {
    throw new Error("useAppCapabilities must be used within AppCapabilitiesProvider");
  }
  return capabilities;
}

export function useActiveThreadSession(): ActiveThreadSession | null {
  return useAppCapabilities().activeThreadSession;
}

export function useActiveThreadSessionSnapshot(): ActiveThreadSessionSnapshot {
  const session = useActiveThreadSession();
  return useSyncExternalStore(
    session?.subscribe ?? subscribeToUnavailableSession,
    session?.getSnapshot ?? getUnavailableSessionSnapshot,
    session?.getSnapshot ?? getUnavailableSessionSnapshot,
  );
}

export function useActiveThreadId(): string | null {
  const session = useActiveThreadSession();
  const getActiveThreadId = useCallback(
    () => session?.getCollectionSnapshot().viewedThreadId ?? null,
    [session],
  );
  return useSyncExternalStore(
    session?.subscribe ?? subscribeToUnavailableSession,
    getActiveThreadId,
    getActiveThreadId,
  );
}

export function useActiveThreadSessionPhase(): ActiveThreadSessionSnapshot["phase"] {
  const session = useActiveThreadSession();
  const getPhase = useCallback(
    () => session?.getSnapshot().phase ?? unavailableSessionSnapshot.phase,
    [session],
  );
  return useSyncExternalStore(
    session?.subscribe ?? subscribeToUnavailableSession,
    getPhase,
    getPhase,
  );
}

export function useActiveThreadCollectionSnapshot(): ActiveThreadCollectionSnapshot {
  const session = useActiveThreadSession();
  return useSyncExternalStore(
    session?.subscribe ?? subscribeToUnavailableSession,
    session?.getCollectionSnapshot ?? getUnavailableCollectionSnapshot,
    session?.getCollectionSnapshot ?? getUnavailableCollectionSnapshot,
  );
}

const unavailableCollectionSnapshot: ActiveThreadCollectionSnapshot = {
  viewedThreadId: null,
  members: [],
  error: null,
};
const getUnavailableCollectionSnapshot = (): ActiveThreadCollectionSnapshot =>
  unavailableCollectionSnapshot;
const unavailableSessionSnapshot = { phase: "empty", revision: 0 } as const;
const subscribeToUnavailableSession = (): (() => void) => () => undefined;
const getUnavailableSessionSnapshot = (): ActiveThreadSessionSnapshot => unavailableSessionSnapshot;
