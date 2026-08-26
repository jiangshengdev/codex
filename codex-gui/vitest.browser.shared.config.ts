import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig, type TestUserConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

type BrowserOptions = NonNullable<TestUserConfig["browser"]>;

type BrowserTestConfig = Omit<TestUserConfig, "browser" | "root" | "watch"> & {
  browser: Omit<BrowserOptions, "headless" | "instances" | "provider"> & {
    instances: NonNullable<BrowserOptions["instances"]>;
  };
};

const browserViteConfig = { ...viteConfig, server: {} };

export function defineBrowserConfig({ browser, ...test }: BrowserTestConfig) {
  return mergeConfig(
    browserViteConfig,
    defineConfig({
      test: {
        root: import.meta.dirname,
        ...test,
        watch: false,
        browser: {
          ...browser,
          headless: true,
          provider: playwright(),
        },
      },
    }),
  );
}
