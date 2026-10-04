import type { ReactNode } from "react";
import { AppCapabilitiesContext, type AppCapabilities } from "./AppCapabilities";

export function AppCapabilitiesProvider({
  capabilities,
  children,
}: {
  capabilities: AppCapabilities;
  children: ReactNode;
}) {
  return <AppCapabilitiesContext value={capabilities}>{children}</AppCapabilitiesContext>;
}
