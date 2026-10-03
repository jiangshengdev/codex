import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

// Only the event and its lifetime completion are synthetic. Production worker
// listeners, clients lookup and MessageChannels remain real. This driver is
// served only by the isolated test runner, never by the production Vite config.
const clickDriver = `
self.addEventListener("message", (message) => {
  if (message.data?.type !== "test-notification-click") return;
  const completion = [];
  const click = new Event("notificationclick");
  Object.defineProperties(click, {
    notification: { value: { data: message.data.target, close() {} } },
    waitUntil: { value: (promise) => completion.push(promise) },
  });
  self.dispatchEvent(click);
  message.waitUntil(Promise.all(completion).then(
    () => message.ports[0].postMessage({ completed: true }),
    (error) => message.ports[0].postMessage({ error: String(error) }),
  ));
});
`;

export async function notificationClickDriver(previewBuild: boolean): Promise<Plugin> {
  const source = new URL(
    previewBuild ? "../../dist/task-notifications.js" : "../../public/task-notifications.js",
    import.meta.url,
  );
  const body = `${await readFile(source, "utf8")}\n${clickDriver}`;
  const serve = (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    if (request.url?.split("?")[0] !== "/task-notifications.js") {
      next();
      return;
    }
    response.setHeader("Content-Type", "text/javascript");
    response.setHeader("Cache-Control", "no-store");
    response.end(body);
  };
  return {
    name: "test-notification-click-driver",
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}
