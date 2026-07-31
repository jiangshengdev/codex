import path from "node:path";
import { defineConfig, configDefaults, mergeConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import packageJson from "./package.json" with { type: "json" };
import viteConfig from "./vite.config";

const browserViteConfig = { ...viteConfig, server: {} };

export default mergeConfig(
  browserViteConfig,
  defineConfig({
    test: {
      root: import.meta.dirname,
      name: `${packageJson.name}-browser`,
      include: ["src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
      exclude: [...configDefaults.exclude, "e2e/**"],
      typecheck: {
        enabled: true,
        tsconfig: path.join(import.meta.dirname, "tsconfig.vitest.browser.json"),
      },
      watch: false,
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        // https://vitest.dev/config/browser/playwright
        instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
      },
    },
  }),
);
