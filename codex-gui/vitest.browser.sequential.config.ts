import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import packageJson from "./package.json" with { type: "json" };
import { defineBrowserConfig } from "./vitest.browser.shared.config.js";

const sequentialTests = [
  "src/__tests__/sequential/**/*.browser.test.ts",
  "src/__tests__/sequential/**/*.browser.test.tsx",
];

export default defineBrowserConfig({
  name: `${packageJson.name}-browser-sequential`,
  fileParallelism: false,
  include: sequentialTests,
  typecheck: {
    enabled: true,
    tsconfig: path.join(import.meta.dirname, "tsconfig.vitest.browser.json"),
  },
  browser: {
    enabled: true,
    instances: [
      {
        browser: "chromium",
        provider: playwright({ contextOptions: { permissions: ["clipboard-write"] } }),
      },
      {
        browser: "firefox",
        include: [
          ...sequentialTests,
          "src/features/committedTranscriptSurface/__tests__/MarkdownScopedStyles.browser.test.tsx",
        ],
      },
      { browser: "webkit" },
    ],
  },
});
