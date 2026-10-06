import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import packageJson from "./package.json" with { type: "json" };
import { defineBrowserConfig } from "./vitest.browser.shared.config.js";
import { localNetworkLaunchOptions } from "./scripts/testRun/network.ts";

export default defineBrowserConfig({
  name: `${packageJson.name}-browser-sequential`,
  fileParallelism: false,
  include: [
    "src/__tests__/sequential/**/*.browser.test.ts",
    "src/__tests__/sequential/**/*.browser.test.tsx",
  ],
  typecheck: {
    enabled: true,
    tsconfig: path.join(import.meta.dirname, "tsconfig.vitest.browser.json"),
  },
  browser: {
    enabled: true,
    instances: [
      {
        browser: "chromium",
        provider: playwright({
          launchOptions: localNetworkLaunchOptions("chromium"),
          contextOptions: { permissions: ["clipboard-write"] },
        }),
      },
      { browser: "firefox" },
      { browser: "webkit" },
    ],
  },
});
