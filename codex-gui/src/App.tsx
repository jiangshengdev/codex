import { Outlet } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import type { AppCapabilities } from "./features/appShell/AppCapabilities";
import { AppCapabilitiesProvider } from "./features/appShell/AppCapabilitiesContext";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import type { BrowserLaunchParams } from "./features/browserLaunch/browserLaunchParams";
import type { ComposerInputQueueCoordinator } from "./features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";

function App() {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);
  const [launchParams, setLaunchParams] = useState<BrowserLaunchParams | null>(null);
  const [composerInputQueueController, setComposerInputQueueController] =
    useState<ComposerInputQueueCoordinator | null>(null);
  const capabilities = useMemo<AppCapabilities>(
    () => ({ status, commands, launchParams, composerInputQueueController }),
    [commands, composerInputQueueController, launchParams, status],
  );

  return (
    <>
      <GuiHostConnectionBridge
        setStatus={setStatus}
        setCommands={setCommands}
        setLaunchParams={setLaunchParams}
        setComposerInputQueueController={setComposerInputQueueController}
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
