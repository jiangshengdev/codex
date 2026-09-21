import { defineConfig } from "@playwright/test";
import shared from "./playwright.shared.config";
import { storybookOrigin, storybookPort } from "./storybook-tests/servers";

export default defineConfig(shared, {
  testDir: "./storybook-tests",
  outputDir: "test-results/storybook",
  reporter: [["html", { outputFolder: "playwright-report/storybook" }]],
  use: { baseURL: storybookOrigin },
  webServer: {
    command: `pnpm run storybook --port ${String(storybookPort)} --ci --no-open --disable-telemetry --no-version-updates`,
    url: storybookOrigin,
    reuseExistingServer: false,
  },
});
