import { useRouter } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import {
  CURRENT_TASK_ROUTE_PATH,
  selectGuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import { ThreadForkContext } from "./ThreadForkContext";
import { ThreadForkOwner } from "./threadForkOwner";

export function ThreadForkProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const { commands, activeThreadSession, status, connectionRecovery } = useAppCapabilities();
  const [owner] = useState(
    () =>
      new ThreadForkOwner(async (threadId) => {
        await router.navigate({
          to: CURRENT_TASK_ROUTE_PATH,
          params: { threadId },
        });
        const target = selectGuiRouteTarget(router.state.matches);
        if (target?.type !== "currentTask" || target.threadId !== threadId) {
          throw new Error("Fork navigation did not reach the created conversation");
        }
      }),
  );
  const available =
    commands != null &&
    activeThreadSession != null &&
    status.label === "initialized" &&
    connectionRecovery == null;
  useLayoutEffect(() => {
    owner.setConnection(available ? { commands, session: activeThreadSession } : null);
  }, [owner, available, commands, activeThreadSession]);
  useEffect(() => {
    owner.setNavigation(router.state.location);
    const unsubscribe = router.subscribe("onBeforeNavigate", (event) => {
      owner.setNavigation(event.toLocation);
    });
    return () => {
      unsubscribe();
      owner.setNavigation(null);
      owner.setConnection(null);
    };
  }, [owner, router]);
  const value = useMemo(() => ({ owner, available }), [owner, available]);
  return <ThreadForkContext value={value}>{children}</ThreadForkContext>;
}
