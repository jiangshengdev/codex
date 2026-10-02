import { createServer, preview } from "vite";
import { currentRunContext } from "./resources.ts";

const run = currentRunContext();
const listener = { host: "127.0.0.1", port: run.port, strictPort: true };
if (process.env.CI) {
  await preview({ preview: listener });
} else {
  const server = await createServer({
    server: { ...listener, hmr: { port: run.port, clientPort: run.port } },
  });
  await server.listen();
}
// Vite's own listen must succeed; a competitor responding on this port is not readiness.
process.send?.({ ready: true });
