import { defineConfig } from "@playwright/test";
import shared from "./playwright.shared.config";
import { storybookOrigin } from "./storybook-tests/servers";
import { currentRunContext } from "./scripts/testRun/resources.ts";

const run = currentRunContext();

export default defineConfig(shared, {
  testDir: "./storybook-tests",
  outputDir: `${run.artifactsDirectory}/test-results`,
  reporter: [
    ["dot"],
    ["html", { outputFolder: `${run.artifactsDirectory}/report`, open: "never" }],
  ],
  use: { baseURL: storybookOrigin },
});
