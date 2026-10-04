import { defineConfig } from "@playwright/test";
import shared from "./playwright.shared.config";
import { guiOrigin } from "./e2e/servers";
import { currentRunContext } from "./scripts/testRun/resources.ts";

const run = currentRunContext();

export default defineConfig(shared, {
  testDir: "./e2e",
  outputDir: `${run.artifactsDirectory}/test-results`,
  reporter: [
    ["dot"],
    ["html", { outputFolder: `${run.artifactsDirectory}/report`, open: "never" }],
  ],
  use: { baseURL: guiOrigin },
});
