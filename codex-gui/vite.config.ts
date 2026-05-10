import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";

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
      "@codex-protocol": fileURLToPath(
        new URL("../codex-rs/app-server-protocol/schema/typescript", import.meta.url),
      ),
    },
  },
});
