import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import packageJson from "./package.json" with { type: "json" };
import viteConfig from "./vite.config";

const browserViteConfig = { ...viteConfig, server: {} };

export default mergeConfig(
  browserViteConfig,
  defineConfig({
    test: {
      root: import.meta.dirname,
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
      watch: false,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
      },
    },
  }),
);
