import { createContext, use } from "react";
import type {
  TaskNotificationMarker,
  TaskNotificationMarkerSnapshot,
} from "./taskNotificationMarkers";

export const TaskNotificationContext = createContext<TaskNotificationMarkerSnapshot>(new Map());

export function useTaskNotificationMarker(threadId: string, kind: TaskNotificationMarker): boolean {
  return use(TaskNotificationContext).get(threadId)?.has(kind) ?? false;
}
