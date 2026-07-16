import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";

const viteHost = process.env.CODEX_GUI_VITE_HOST ?? "0.0.0.0";
const vitePort = Number(process.env.CODEX_GUI_VITE_PORT ?? "5173");
const viteHmrHost = process.env.CODEX_GUI_VITE_HMR_HOST;
const viteHmrPort = Number(process.env.CODEX_GUI_VITE_HMR_PORT ?? vitePort);

// https://vite.dev/config/
export default defineConfig({
  plugins: [
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
