import { randomUuid } from "@/identity/randomUuid";
import type { TaskNotificationClick, TaskNotificationTarget } from "./taskNotificationProtocol";

const workerPath = "/task-notifications.js";
const tabPrefix = "codex-notification-tab:";
let documentTabId: string | undefined;

function tabId(): string {
  if (documentTabId != null) return documentTabId;
  const navigation = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  // A new document in the same tab retains window.name across reloads. A new
  // navigation (including a duplicated tab) gets its own identity, even when
  // the browser copied sessionStorage or the window name from an opener.
  documentTabId =
    navigation?.type === "reload" && window.name.startsWith(tabPrefix)
      ? window.name
      : `${tabPrefix}${randomUuid()}`;
  window.name = documentTabId;
  return documentTabId;
}

export function connectBrowserTaskNotifications(select: (threadId: string) => boolean) {
  if (!("serviceWorker" in navigator) || typeof Notification === "undefined") return null;
  const container = navigator.serviceWorker as ServiceWorkerContainer | undefined;
  if (container == null) return null;
  const identity = tabId();
  let disposed = false;
  let visibleDocument = true;
  const registration = Promise.resolve()
    .then(() => container.register(workerPath))
    .then(async (registered) => (registered.active == null ? await container.ready : registered))
    .catch(() => null);
  const receive = (event: MessageEvent<Partial<TaskNotificationClick> | null>) => {
    if (
      disposed ||
      !visibleDocument ||
      event.source == null ||
      !("scriptURL" in event.source) ||
      event.source.scriptURL !== new URL(workerPath, location.origin).href ||
      event.data?.type !== "codex-task-notification-click" ||
      event.data.target?.tabId !== identity
    )
      return;
    const accepted = select(event.data.target.threadId);
    event.ports[0]?.postMessage(accepted);
  };
  const hide = () => {
    visibleDocument = false;
  };
  const show = () => {
    visibleDocument = true;
  };
  container.addEventListener("message", receive);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  return {
    async show(threadId: string, title: string, body: string) {
      const registered = await registration;
      if (disposed || registered == null || Notification.permission !== "granted") return;
      const data: TaskNotificationTarget = { tabId: identity, threadId };
      try {
        await registered.showNotification(title, { body, data });
      } catch {
        // Platform failures must not interrupt question delivery or task markers.
      }
    },
    dispose() {
      disposed = true;
      container.removeEventListener("message", receive);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      // Persistent notifications belong to the browser, not this document.
    },
  };
}
