import { createServer, preview } from "vite";
import { currentRunContext } from "./resources.ts";
import { notificationClickDriver } from "./notificationClickDriver.ts";

const run = currentRunContext();
const listener = { host: "127.0.0.1", port: run.port, strictPort: true };
const plugins = [await notificationClickDriver(Boolean(process.env.CI))];
if (process.env.CI) {
  await preview({ preview: listener, plugins });
} else {
  const server = await createServer({
    plugins,
    server: { ...listener, ws: { port: run.port, clientPort: run.port } },
  });
  await server.listen();
}
// Vite's own listen must succeed; a competitor responding on this port is not readiness.
process.send?.({ ready: true });
