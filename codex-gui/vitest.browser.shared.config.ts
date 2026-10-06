import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig, type TestUserConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
import { sharedTestConfig } from "./vitest.shared.config.ts";
import { isolatedBrowserInstances, isolatedVitestConfig } from "./scripts/testRun/vitestConfig.ts";
import { localNetworkLaunchOptions } from "./scripts/testRun/network.ts";

type BrowserOptions = NonNullable<TestUserConfig["browser"]>;

type BrowserTestConfig = Omit<TestUserConfig, "browser" | "root" | "watch"> & {
  browser: Omit<BrowserOptions, "headless" | "instances" | "provider"> & {
    instances: NonNullable<BrowserOptions["instances"]>;
  };
};

const browserViteConfig = { ...viteConfig, server: {} };

export function defineBrowserConfig({ browser, ...test }: BrowserTestConfig) {
  return mergeConfig(
    mergeConfig(
      browserViteConfig,
      defineConfig({
        test: {
          ...sharedTestConfig,
          root: import.meta.dirname,
          ...test,
          setupFiles: [
            "./src/__tests__/browserSetup.ts",
            ...(test.setupFiles ? [test.setupFiles].flat() : []),
          ],
          watch: false,
          browser: {
            ...browser,
            instances: isolatedBrowserInstances(browser.instances).map((instance) => ({
              ...instance,
              provider:
                instance.provider ??
                playwright({
                  launchOptions: localNetworkLaunchOptions(instance.browser),
                }),
            })),
            headless: true,
            provider: playwright(),
          },
        },
      }),
    ),
    isolatedVitestConfig(),
  );
}
