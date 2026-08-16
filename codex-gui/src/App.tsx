import { Outlet } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { AppCapabilities, ContinueThread } from "./features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "./features/appShell/AppCapabilitiesContext";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import type { BrowserLaunchParams } from "./features/browserLaunch/browserLaunchParams";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";
import type { ActiveThreadOwnerHandle } from "./features/projectionCoordination/threadSwitchCoordinator";

function App() {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);
  const [launchParams, setLaunchParams] = useState<BrowserLaunchParams | null>(null);
  const [activeOwner, setActiveOwner] = useState<ActiveThreadOwnerHandle | null>(null);
  const [continueThread, setContinueThread] = useState<ContinueThread | null>(null);
  const capabilities = useMemo<AppCapabilities>(
    () => ({ status, commands, launchParams, activeOwner, continueThread }),
    [activeOwner, commands, continueThread, launchParams, status],
  );

  return (
    <>
      <GuiHostConnectionBridge
        setStatus={setStatus}
        setCommands={setCommands}
        setLaunchParams={setLaunchParams}
        setActiveOwner={setActiveOwner}
        setContinueThread={setContinueThread}
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
