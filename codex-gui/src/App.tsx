import { Outlet, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type {
  ActiveThreadSession,
  ActiveThreadComposerRole,
} from "./features/activeThreadSession/activeThreadSession";
import {
  type AppCapabilities,
  useActiveThreadSession,
  useActiveThreadCollectionSnapshot,
  useAppCapabilities,
} from "./features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "./features/appShell/AppCapabilitiesContext";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import { selectGuiRouteTarget, type GuiRouteTarget } from "./features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";
import { NewSessionOwner } from "./features/newSession/newSessionOwner";
import { ComposerPendingInputProvider } from "./features/composerTurnControl/ComposerPendingInputProvider";
import { ConnectionRecoveryNotice } from "./features/appShell/ConnectionRecoveryNotice";
import { ConnectionTaskRecoveryNotice } from "./features/currentTask/ConnectionTaskRecoveryNotice";
import { ThreadForkProvider } from "./features/threadFork/ThreadForkProvider";
import { ThreadForkNotice } from "./features/threadFork/ThreadForkNotice";

function App({ routeTarget }: Readonly<{ routeTarget: GuiRouteTarget }>) {
  const router = useRouter();
  const [newSessionOwner] = useState(() => new NewSessionOwner());
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);
  const [connectionRecovery, setConnectionRecovery] =
    useState<AppCapabilities["connectionRecovery"]>(null);
  const [authorizationToken, setAuthorizationToken] = useState<string | null>(null);
  const [activeThreadSession, setActiveThreadSession] = useState<ActiveThreadSession | null>(null);
  const capabilities = useMemo<AppCapabilities>(
    () => ({
      status,
      authorizationToken,
      commands,
      routeTarget,
      activeThreadSession,
      newSessionOwner,
      connectionRecovery,
    }),
    [
      activeThreadSession,
      authorizationToken,
      commands,
      newSessionOwner,
      routeTarget,
      status,
      connectionRecovery,
    ],
  );

  useEffect(() => {
    const resolved = (): void => {
      newSessionOwner.setNavigation(
        selectGuiRouteTarget(router.state.matches)?.type === "newTask",
        router.state.location,
      );
    };
    resolved();
    const before = router.subscribe("onBeforeNavigate", (event) => {
      newSessionOwner.setNavigation(false, event.toLocation);
    });
    const after = router.subscribe("onResolved", resolved);
    return () => {
      before();
      after();
      newSessionOwner.setNavigation(false, null);
    };
  }, [newSessionOwner, router]);

  return (
    <>
      <GuiHostConnectionBridge
        setStatus={setStatus}
        setCommands={setCommands}
        setAuthorizationToken={setAuthorizationToken}
        setActiveThreadSession={setActiveThreadSession}
        routeTarget={routeTarget}
        setConnectionRecovery={setConnectionRecovery}
        newSessionOwner={newSessionOwner}
      />
      <AppCapabilitiesProvider capabilities={capabilities}>
        <ThreadForkProvider>
          <ActiveThreadRouteSync routeTarget={routeTarget} />
          <ComposerPendingInputProvider
            renderConnectionRecovery={(composerRole) => (
              <PendingInputConnectionRecovery composerRole={composerRole} />
            )}
          >
            <AppShell>
              <ThreadForkNotice />
              <Outlet />
            </AppShell>
          </ComposerPendingInputProvider>
        </ThreadForkProvider>
      </AppCapabilitiesProvider>
    </>
  );
}

function ActiveThreadRouteSync({ routeTarget }: Readonly<{ routeTarget: GuiRouteTarget }>) {
  const session = useActiveThreadSession();

  useEffect(() => {
    if (
      session != null &&
      routeTarget.type === "currentTask" &&
      session.getCollectionSnapshot().viewedThreadId !== routeTarget.threadId
    ) {
      void session.view(routeTarget.threadId).catch((error: unknown) => {
        session.setOperationError(routeTarget.threadId, "navigation", error);
      });
    }
  }, [session, routeTarget]);

  return null;
}

export default App;

function PendingInputConnectionRecovery({
  composerRole,
}: Readonly<{ composerRole: ActiveThreadComposerRole }>) {
  const { activeThreadSession, connectionRecovery, status } = useAppCapabilities();
  const collection = useActiveThreadCollectionSnapshot();
  const snapshot = collection.members.find((member) => {
    const value = member.snapshot;
    return (
      (value?.phase === "active" || value?.phase === "projectionUnavailable") &&
      value.composerRole === composerRole
    );
  })?.snapshot;
  if (snapshot?.phase !== "active" && snapshot?.phase !== "projectionUnavailable") return null;
  return (
    <>
      {connectionRecovery != null ? (
        <ConnectionRecoveryNotice recovery={connectionRecovery} hasRetainedSession />
      ) : null}
      {snapshot.connection.phase === "unavailable" ? (
        <ConnectionTaskRecoveryNotice
          connection={snapshot.connection}
          canRecover={status.label === "initialized" && connectionRecovery == null}
          onRecover={() => {
            void activeThreadSession?.recoverConnection(snapshot.threadId, snapshot.identity);
          }}
        />
      ) : null}
    </>
  );
}
