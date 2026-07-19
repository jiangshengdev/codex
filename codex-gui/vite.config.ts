import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import compression from "@polka/compression";
import babel from "@rolldown/plugin-babel";

const viteHost = process.env.CODEX_GUI_VITE_HOST ?? "0.0.0.0";
const vitePort = Number(process.env.CODEX_GUI_VITE_PORT ?? "5173");
const viteHmrHost = process.env.CODEX_GUI_VITE_HMR_HOST;
const viteHmrPort = Number(process.env.CODEX_GUI_VITE_HMR_PORT ?? vitePort);

const viteDevCompression = (): Plugin => ({
  name: "codex-gui-vite-dev-compression",
  configureServer(server) {
    server.middlewares.use((_request, response, next) => {
      const vary = response.getHeader("Vary");
      const varyTokens = (Array.isArray(vary) ? vary : [vary ?? ""])
        .flatMap((value) => String(value).split(","))
        .map((value) => value.trim())
        .filter(Boolean);

      if (!varyTokens.some((value) => value.toLowerCase() === "accept-encoding")) {
        varyTokens.push("Accept-Encoding");
      }
      response.setHeader("Vary", varyTokens.join(", "));
      next();
    });
    server.middlewares.use(
      compression({
        brotli: false,
        gzip: true,
        threshold: 1024,
      }),
    );
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    viteDevCompression(),
    react(),
    lingui(),
    babel({
      presets: [linguiTransformerBabelPreset()],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@codex-gui-host-contract": fileURLToPath(
        new URL("../codex-rs/gui-host/schema/typescript/browserContract.ts", import.meta.url),
      ),
      "@codex-protocol": fileURLToPath(
        new URL("../codex-rs/app-server-protocol/schema/typescript", import.meta.url),
      ),
    },
  },
  server: {
    host: viteHost,
    port: vitePort,
    hmr: {
      ...(viteHmrHost ? { host: viteHmrHost } : {}),
      port: viteHmrPort,
      clientPort: viteHmrPort,
    },
  },
});
