import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/app/hooks";
import {
  startGuiHostConnectionLifecycle,
  type GuiHostConnectionLifecycleInput,
} from "./guiHostConnectionLifecycle";

export type GuiHostConnectionBridgeProps = Omit<GuiHostConnectionLifecycleInput, "dispatch">;

export function GuiHostConnectionBridge({
  setStatus,
  setCommands,
  startupTarget,
  setAuthorizationToken,
  setActiveThreadSession,
  newSessionOwner,
}: GuiHostConnectionBridgeProps) {
  const dispatch = useAppDispatch();
  const frozenStartupTarget = useRef(startupTarget);
  useEffect(() => {
    return startGuiHostConnectionLifecycle({
      dispatch,
      startupTarget: frozenStartupTarget.current,
      newSessionOwner,
      setStatus,
      setCommands,
      setAuthorizationToken,
      setActiveThreadSession,
    });
  }, [
    dispatch,
    newSessionOwner,
    setActiveThreadSession,
    setAuthorizationToken,
    setCommands,
    setStatus,
  ]);

  return null;
}
