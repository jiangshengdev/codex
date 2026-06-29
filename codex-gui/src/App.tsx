import { useState } from "react";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import type {
  GuiHostCommands,
  GuiHostStatus,
  LaunchParams,
} from "./features/guiHost/guiHostClient";

function App() {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);
  const [launchParams, setLaunchParams] = useState<LaunchParams | null>(null);

  return (
    <>
      <GuiHostConnectionBridge
        setStatus={setStatus}
        setCommands={setCommands}
        setLaunchParams={setLaunchParams}
      />
      <AppShell status={status} commands={commands} launchParams={launchParams} />
    </>
  );
}

export default App;
