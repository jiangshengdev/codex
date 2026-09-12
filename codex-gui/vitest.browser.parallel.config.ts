import path from "node:path";
import { configDefaults } from "vitest/config";
import packageJson from "./package.json" with { type: "json" };
import { defineBrowserConfig } from "./vitest.browser.shared.config.js";

const excludedTests = [...configDefaults.exclude, "e2e/**", "src/__tests__/sequential/**"];

export default defineBrowserConfig({
  name: `${packageJson.name}-browser-parallel`,
  maxWorkers: "50%",
  include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
  exclude: excludedTests,
  typecheck: {
    enabled: true,
    tsconfig: path.join(import.meta.dirname, "tsconfig.vitest.browser.json"),
  },
  browser: {
    enabled: true,
    // https://vitest.dev/config/browser/playwright
    instances: [
      { browser: "chromium" },
      {
        browser: "firefox",
        // Parallel Firefox pages can blur the document during menu keyboard navigation.
        // This file's Firefox instance runs in the sequential suite instead.
        exclude: [
          ...excludedTests,
          "src/features/committedTranscriptSurface/__tests__/MarkdownScopedStyles.browser.test.tsx",
        ],
      },
      { browser: "webkit" },
    ],
  },
});
