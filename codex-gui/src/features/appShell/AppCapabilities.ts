import { createContext, use } from "react";
import type { GuiRouteTarget } from "@/features/browserLaunch/guiRouteTarget";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import type { RouteConnectionStartupOutcome } from "@/features/appShell/routeConnectionStartupCoordinator";
import type { ThreadSwitchCoordinator } from "@/features/projectionCoordination/threadSwitchCoordinator";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";

export type ContinueThread = ThreadSwitchCoordinator["continueThread"];

export type AppCapabilities = Readonly<{
  status: GuiHostStatus;
  authorizationToken: string | null;
  commands: GuiHostCommands | null;
  routeTarget: GuiRouteTarget;
  startupOutcome: RouteConnectionStartupOutcome | null;
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
