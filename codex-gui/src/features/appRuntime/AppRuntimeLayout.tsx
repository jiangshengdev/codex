import { Toast } from "@heroui/react";
import { Outlet } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GuiHostConnectionBridge } from "@/features/appShell/GuiHostConnectionBridge";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import { ChatUiSessionProvider } from "@/features/chatUiSession/ChatUiSessionProvider";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import { AppRuntimeContext } from "./AppRuntimeContext";

export function AppRuntimeLayout() {
  const [status, setStatus] = useState<GuiHostStatus>({
    label: "connecting",
  });
  const [commands, setCommands] = useState<GuiHostCommands | null>(null);
  const [launchParams, setLaunchParams] = useState<BrowserLaunchParams | null>(null);
  const runtime = useMemo(
    () => ({ status, commands, launchParams }),
    [commands, launchParams, status],
  );

  return (
    <AppRuntimeContext value={runtime}>
      <GuiHostConnectionBridge
        setStatus={setStatus}
        setCommands={setCommands}
        setLaunchParams={setLaunchParams}
      />
      <Toast.Provider placement="top" />
      <ChatUiSessionProvider>
        <Outlet />
      </ChatUiSessionProvider>
    </AppRuntimeContext>
  );
}
