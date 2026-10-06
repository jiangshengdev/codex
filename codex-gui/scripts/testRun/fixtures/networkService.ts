import { createServer, type WebSocketClient } from "vite";
import { currentRunContext } from "../resources.ts";

const run = currentRunContext();
const server = await createServer({
  configFile: false,
  root: run.directory,
  cacheDir: run.cacheDirectory,
  appType: "custom",
  server: {
    host: "127.0.0.1",
    port: run.port,
    strictPort: true,
    watch: null,
    fs: { allow: [run.directory, import.meta.dirname] },
  },
});
server.middlewares.use("/network-probe", (_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end(
    `<!doctype html><title>Local network probe</title><body><script type="module" src="/@fs/${import.meta.dirname}/networkPage.ts"></script></body>`,
  );
});
server.ws.on("network-probe", (data: unknown, client: WebSocketClient) => {
  client.send("network-reply", data);
});
await server.listen();
process.send?.({ ready: true });
