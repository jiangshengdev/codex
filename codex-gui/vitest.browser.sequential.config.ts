import path from "node:path";
import packageJson from "./package.json" with { type: "json" };
import { defineBrowserConfig } from "./vitest.browser.shared.config.js";

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
    instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
  },
});
