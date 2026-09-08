import { Outlet, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ActiveThreadSession } from "./features/activeThreadSession/activeThreadSession";
import { type AppCapabilities, useActiveThreadSession } from "./features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "./features/appShell/AppCapabilitiesContext";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import { selectGuiRouteTarget, type GuiRouteTarget } from "./features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";
import { NewSessionOwner } from "./features/newSession/newSessionOwner";
import { ComposerPendingInputProvider } from "./features/composerTurnControl/ComposerPendingInputProvider";

function App({ routeTarget }: Readonly<{ routeTarget: GuiRouteTarget }>) {
  const router = useRouter();
  const [newSessionOwner] = useState(() => new NewSessionOwner());
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
      newSessionOwner,
    }),
    [activeThreadSession, authorizationToken, commands, newSessionOwner, routeTarget, status],
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
        startupTarget={routeTarget}
        newSessionOwner={newSessionOwner}
      />
      <AppCapabilitiesProvider capabilities={capabilities}>
        <ActiveThreadRouteSync routeTarget={routeTarget} />
        <ComposerPendingInputProvider>
          <AppShell>
            <Outlet />
          </AppShell>
        </ComposerPendingInputProvider>
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
