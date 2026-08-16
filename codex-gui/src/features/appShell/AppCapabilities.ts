import { createContext, use } from "react";
import type { BrowserLaunchParams } from "@/features/browserLaunch/browserLaunchParams";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type {
  ActiveThreadOwnerHandle,
  ThreadSwitchCoordinator,
} from "@/features/projectionCoordination/threadSwitchCoordinator";

export type ContinueThread = ThreadSwitchCoordinator["continueThread"];

export type AppCapabilities = Readonly<{
  status: GuiHostStatus;
  commands: GuiHostCommands | null;
  launchParams: BrowserLaunchParams | null;
  activeOwner: ActiveThreadOwnerHandle | null;
  continueThread: ContinueThread | null;
}>;

export const AppCapabilitiesContext = createContext<AppCapabilities | null>(null);

export function useAppCapabilities(): AppCapabilities {
  const capabilities = use(AppCapabilitiesContext);
  if (capabilities == null) {
    throw new Error("useAppCapabilities must be used within AppCapabilitiesProvider");
  }
  return capabilities;
}
