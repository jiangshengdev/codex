import { useState } from "react";
import { AppShell } from "./features/appShell/AppShell";
import { GuiHostConnectionBridge } from "./features/appShell/GuiHostConnectionBridge";
import type { GuiHostCommands, GuiHostStatus } from "./features/guiHost/guiHostClient";

function App() {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
    eventCount: 0,
    lastEventType: null,
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);

  return (
    <>
      <GuiHostConnectionBridge setStatus={setStatus} setCommands={setCommands} />
      <AppShell status={status} commands={commands} />
    </>
  );
}

export default App;
