import { useNavigate } from "@tanstack/react-router";
import { CURRENT_TASK_ROUTE_PATH } from "@/features/browserLaunch/guiRouteTarget";
import { useActiveThreadCollectionSnapshot, useAppCapabilities } from "./AppCapabilities";

export function useActiveTaskNavigation(close: () => void) {
  const navigate = useNavigate();
  const { activeThreadSession } = useAppCapabilities();
  const collection = useActiveThreadCollectionSnapshot();
  const select = (threadId: string): void => {
    close();
    void navigate({ to: CURRENT_TASK_ROUTE_PATH, params: { threadId } }).then(
      () => activeThreadSession?.setOperationError(threadId, "navigation", null),
      (error: unknown) => activeThreadSession?.setOperationError(threadId, "navigation", error),
    );
  };
  const index = collection.members.findIndex(
    (member) => member.threadId === collection.viewedThreadId,
  );
  const canCycle = index >= 0 && collection.members.length > 0;
  const cycle = (direction: -1 | 1): boolean => {
    if (!canCycle) return false;
    const target =
      collection.members[
        (index + direction + collection.members.length) % collection.members.length
      ];
    if (target == null) return false;
    select(target.threadId);
    return true;
  };
  return { select, cycle, canCycle };
}
