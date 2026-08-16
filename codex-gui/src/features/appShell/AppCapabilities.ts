import { createContext, use } from "react";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import type { ComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";

export type AppCapabilities = Readonly<{
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
  launchParams: BrowserLaunchParams | null;
  composerInputQueueController: ComposerInputQueueCoordinator | null;
}>;

export const AppCapabilitiesContext = createContext<AppCapabilities | null>(null);

export function useAppCapabilities(): AppCapabilities {
  const capabilities = use(AppCapabilitiesContext);
  if (capabilities == null) {
    throw new Error("useAppCapabilities must be used within AppCapabilitiesProvider");
  }
  return capabilities;
}
