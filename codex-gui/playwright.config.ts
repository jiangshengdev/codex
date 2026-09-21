import process from "node:process";
import { defineConfig } from "@playwright/test";
import shared from "./playwright.shared.config";
import { guiOrigin, guiPort } from "./e2e/servers";

export default defineConfig(shared, {
  testDir: "./e2e",
  outputDir: "test-results/e2e",
  reporter: [["html", { outputFolder: "playwright-report/e2e" }]],
  use: { baseURL: guiOrigin },
  webServer: {
    /**
     * Use the dev server by default for faster feedback loop.
     * Use the preview server on CI for more realistic testing.
     * Both modes use the dedicated E2E port and own their server lifecycle.
     */
    command: process.env.CI
      ? `pnpm run preview --port ${String(guiPort)} --strictPort`
      : `pnpm run dev --port ${String(guiPort)} --strictPort`,
    env: {
      CODEX_GUI_VITE_PORT: String(guiPort),
      CODEX_GUI_VITE_HMR_PORT: String(guiPort),
    },
    url: guiOrigin,
    reuseExistingServer: false,
  },
});
