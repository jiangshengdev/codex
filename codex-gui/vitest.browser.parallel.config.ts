import path from "node:path";
import { configDefaults } from "vitest/config";
import packageJson from "./package.json" with { type: "json" };
import { defineBrowserConfig } from "./vitest.browser.shared.config.js";

export default defineBrowserConfig({
  name: `${packageJson.name}-browser-parallel`,
  include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
  exclude: [...configDefaults.exclude, "e2e/**", "src/__tests__/sequential/**"],
  typecheck: {
    enabled: true,
    tsconfig: path.join(import.meta.dirname, "tsconfig.vitest.browser.json"),
  },
  browser: {
    enabled: true,
    // https://vitest.dev/config/browser/playwright
    instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
  },
});
