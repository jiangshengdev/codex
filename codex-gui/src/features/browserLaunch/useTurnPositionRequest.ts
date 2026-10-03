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
  const edge = position?.position;
  const itemId = position?.position === "start" ? position.itemId : undefined;
  return useMemo(
    () =>
      turnId == null
        ? null
        : edge === "start" && itemId != null
          ? { turnId, itemId, position: "start", visit: location }
          : { turnId, position: "end", visit: location },
    [location, turnId, edge, itemId],
  );
}
