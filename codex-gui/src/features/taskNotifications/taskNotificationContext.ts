import { createContext, use } from "react";

export const TaskNotificationContext = createContext<ReadonlySet<string>>(new Set());

export function useTaskWaitingMarker(threadId: string): boolean {
  return use(TaskNotificationContext).has(threadId);
}
