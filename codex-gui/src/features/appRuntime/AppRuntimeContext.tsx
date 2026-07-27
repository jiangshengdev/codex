import { createContext, use } from "react";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";

export type AppRuntimeContextValue = {
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
  launchParams: BrowserLaunchParams | null;
};

export const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(null);

export function useAppRuntime(): AppRuntimeContextValue {
  const runtime = use(AppRuntimeContext);

  if (runtime == null) {
    throw new Error("useAppRuntime must be used within AppRuntimeLayout");
  }

  return runtime;
}
