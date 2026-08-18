import { Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { AppCapabilities, ContinueThread } from "./features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "./features/appShell/AppCapabilitiesContext";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import {
  CURRENT_TASK_ROUTE_PATH,
  type GuiRouteTarget,
} from "./features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";
import type { ActiveThreadOwnerHandle } from "./features/projectionCoordination/activeThreadOwner";
import type { RouteConnectionStartupOutcome } from "./features/appShell/routeConnectionStartupCoordinator";

function App({ routeTarget }: Readonly<{ routeTarget: GuiRouteTarget }>) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);
  const [authorizationToken, setAuthorizationToken] = useState<string | null>(null);
  const [startupOutcome, setStartupOutcome] = useState<RouteConnectionStartupOutcome | null>(null);
  const [activeOwner, setActiveOwner] = useState<ActiveThreadOwnerHandle | null>(null);
  const [continueThread, setContinueThread] = useState<ContinueThread | null>(null);
  const capabilities = useMemo<AppCapabilities>(
    () => ({
      status,
      authorizationToken,
      commands,
      routeTarget,
      startupOutcome,
      activeOwner,
      continueThread,
    }),
    [
      activeOwner,
      authorizationToken,
      commands,
      continueThread,
      routeTarget,
      startupOutcome,
      status,
    ],
  );

  useEffect(() => {
    if (
      activeOwner != null &&
      routeTarget.type === "currentTask" &&
      routeTarget.threadId !== activeOwner.threadId
    ) {
      void navigate({
        to: CURRENT_TASK_ROUTE_PATH,
        params: { threadId: activeOwner.threadId },
        replace: true,
      });
    }
  }, [activeOwner, navigate, routeTarget]);

  return (
    <>
      <GuiHostConnectionBridge
        setStatus={setStatus}
        setCommands={setCommands}
        setAuthorizationToken={setAuthorizationToken}
        setStartupOutcome={setStartupOutcome}
        setActiveOwner={setActiveOwner}
        setContinueThread={setContinueThread}
        startupTarget={routeTarget}
      />
      <AppCapabilitiesProvider capabilities={capabilities}>
        <AppShell>
          <Outlet />
        </AppShell>
      </AppCapabilitiesProvider>
    </>
  );
}

export default App;
