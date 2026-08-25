import { Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ActiveThreadSession } from "./features/activeThreadSession/activeThreadSession";
import {
  type AppCapabilities,
  useActiveThreadId,
} from "./features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "./features/appShell/AppCapabilitiesContext";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import {
  CURRENT_TASK_ROUTE_PATH,
  type GuiRouteTarget,
} from "./features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";

function App({ routeTarget }: Readonly<{ routeTarget: GuiRouteTarget }>) {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);
  const [authorizationToken, setAuthorizationToken] = useState<string | null>(null);
  const [activeThreadSession, setActiveThreadSession] = useState<ActiveThreadSession | null>(null);
  const [activeThreadStartupError, setActiveThreadStartupError] = useState<string | null>(null);
  const capabilities = useMemo<AppCapabilities>(
    () => ({
      status,
      authorizationToken,
      commands,
      routeTarget,
      activeThreadSession,
      activeThreadStartupError,
    }),
    [
      activeThreadSession,
      activeThreadStartupError,
      authorizationToken,
      commands,
      routeTarget,
      status,
    ],
  );

  return (
    <>
      <GuiHostConnectionBridge
        setStatus={setStatus}
        setCommands={setCommands}
        setAuthorizationToken={setAuthorizationToken}
        setActiveThreadSession={setActiveThreadSession}
        setActiveThreadStartupError={setActiveThreadStartupError}
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
  const navigate = useNavigate();
  const activeThreadId = useActiveThreadId();

  useEffect(() => {
    if (
      activeThreadId != null &&
      routeTarget.type === "currentTask" &&
      routeTarget.threadId !== activeThreadId
    ) {
      void navigate({
        to: CURRENT_TASK_ROUTE_PATH,
        params: { threadId: activeThreadId },
        replace: true,
      });
    }
  }, [activeThreadId, navigate, routeTarget]);

  return null;
}

export default App;
