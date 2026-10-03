/** Non-secret routing data shared by the document and notification worker. */
export type TaskNotificationTarget = {
  tabId: string;
  threadId: string;
  message?: Readonly<{ turnId: string; itemId: string }>;
};

export type TaskNotificationClick = {
  type: "codex-task-notification-click";
  target: TaskNotificationTarget;
};
