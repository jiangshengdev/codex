import { createContext, use } from "react";
import type { TaskNotificationMarker } from "./taskNotificationMarkers";

export const TaskNotificationContext = createContext<ReadonlyMap<string, TaskNotificationMarker>>(
  new Map(),
);

export function useTaskNotificationMarker(threadId: string): TaskNotificationMarker | undefined {
  return use(TaskNotificationContext).get(threadId);
}
