import packageJson from "./package.json" with { type: "json" };
import { defineBrowserConfig } from "./vitest.browser.shared.config.js";

export default defineBrowserConfig({
  name: `${packageJson.name}-browser-smoke`,
  include: [
    "src/__tests__/smoke/**/*.browser.test.ts",
    "src/__tests__/smoke/**/*.browser.test.tsx",
  ],
  browser: {
    enabled: true,
    instances: [{ browser: "chromium" }],
  },
});
