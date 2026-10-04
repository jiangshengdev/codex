import { useMemo } from "react";
import { useLocation } from "@tanstack/react-router";
import type { GuiRouteTarget, TurnPosition } from "./guiRouteTarget";

export type TurnPositionRequest = TurnPosition & Readonly<{ visit: object }>;

export function useTurnPositionRequest(target: GuiRouteTarget): TurnPositionRequest | null {
  const location = useLocation();
  const position =
    target.type === "currentTask" || target.type === "historyDetail"
      ? target.turnPosition
      : undefined;
  const turnId = position?.turnId;
  return useMemo(
    () => (turnId == null ? null : { turnId, position: "end", visit: location }),
    [location, turnId],
  );
}
