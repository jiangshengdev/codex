import { Outlet } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ActiveThreadSession } from "./features/activeThreadSession/activeThreadSession";
import { type AppCapabilities, useActiveThreadSession } from "./features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "./features/appShell/AppCapabilitiesContext";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import { type GuiRouteTarget } from "./features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";

function App({ routeTarget }: Readonly<{ routeTarget: GuiRouteTarget }>) {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);
  const [authorizationToken, setAuthorizationToken] = useState<string | null>(null);
  const [activeThreadSession, setActiveThreadSession] = useState<ActiveThreadSession | null>(null);
  const capabilities = useMemo<AppCapabilities>(
    () => ({
      status,
      authorizationToken,
      commands,
      routeTarget,
      activeThreadSession,
    }),
    [activeThreadSession, authorizationToken, commands, routeTarget, status],
  );

  return (
    <>
      <GuiHostConnectionBridge
        setStatus={setStatus}
        setCommands={setCommands}
        setAuthorizationToken={setAuthorizationToken}
        setActiveThreadSession={setActiveThreadSession}
        startupTarget={routeTarget}
      />
      <AppCapabilitiesProvider capabilities={capabilities}>
        <ActiveThreadRouteSync routeTarget={routeTarget} />
        <AppShell>
          <Outlet />
        </AppShell>
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
