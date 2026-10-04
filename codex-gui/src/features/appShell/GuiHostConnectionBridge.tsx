import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/app/hooks";
import {
  startGuiHostConnectionLifecycle,
  type GuiHostConnectionLifecycleInput,
} from "./guiHostConnectionLifecycle";

export type GuiHostConnectionBridgeProps = Omit<
  GuiHostConnectionLifecycleInput,
  "dispatch" | "getRouteTarget"
> & { routeTarget: ReturnType<GuiHostConnectionLifecycleInput["getRouteTarget"]> };

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  routeTarget,
  setAuthorizationToken,
  setActiveThreadSession,
  newSessionOwner,
  setConnectionRecovery,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();
  const currentTarget = useRef(routeTarget);
  useEffect(() => {
    currentTarget.current = routeTarget;
  }, [routeTarget]);
  useEffect(() => {
    const lifecycle = startGuiHostConnectionLifecycle({
      dispatch,
      getRouteTarget: () => currentTarget.current,
      newSessionOwner,
      setStatus,
      setCommands,
      setAuthorizationToken,
      setActiveThreadSession,
      setConnectionRecovery,
    });
    return lifecycle.dispose;
  }, [
    dispatch,
    newSessionOwner,
    setActiveThreadSession,
    setAuthorizationToken,
    setCommands,
    setConnectionRecovery,
    setStatus,
  ]);

  return null;
}
