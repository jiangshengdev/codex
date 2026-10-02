// @ts-check
/// <reference lib="webworker" />

/** @type {ServiceWorkerGlobalScope} */
const worker = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

worker.addEventListener("notificationclick", (event) => {
  event.notification.close();
  /** @type {import("../src/features/taskNotifications/taskNotificationProtocol").TaskNotificationTarget} */
  const target = event.notification.data;
  event.waitUntil(deliverClick(target));
});

/** @param {import("../src/features/taskNotifications/taskNotificationProtocol").TaskNotificationTarget} target */
async function deliverClick(target) {
  const clients = await worker.clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(
    clients.map(async (client) => {
      if (client.frameType !== "top-level") return;
      const accepted = await new Promise((resolve) => {
        const channel = new MessageChannel();
        /** @param {boolean} value */
        const finish = (value) => {
          clearTimeout(deadline);
          channel.port1.close();
          resolve(value);
        };
        // Bound one live-document exchange. This never waits for page readiness,
        // retains a click, or retries delivery after a reload.
        const deadline = setTimeout(() => finish(false), 1000);
        channel.port1.onmessage = (event) => finish(event.data === true);
        /** @type {import("../src/features/taskNotifications/taskNotificationProtocol").TaskNotificationClick} */
        const message = { type: "codex-task-notification-click", target };
        client.postMessage(message, [channel.port2]);
      });
      if (accepted) {
        try {
          await client.focus();
        } catch {
          // The document may have closed, or the browser may decline focus.
        }
      }
    }),
  );
}
