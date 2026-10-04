import path from "node:path";
import { defineConfig, configDefaults, mergeConfig } from "vitest/config";
import packageJson from "./package.json" with { type: "json" };
import viteConfig from "./vite.config.ts";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { sharedTestConfig } from "./vitest.shared.config.ts";
import { isolatedVitestConfig } from "./scripts/testRun/vitestConfig.ts";

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default mergeConfig(
  mergeConfig(
    viteConfig,
    defineConfig({
      test: {
        ...sharedTestConfig,
        watch: false,
        projects: [
          {
            extends: true,
            test: {
              root: import.meta.dirname,
              name: packageJson.name,
              environment: "node",
              exclude: [
                ...configDefaults.exclude,
                "e2e/**",
                "storybook-tests/**",
                "src/**/*.browser.test.ts",
                "src/**/*.browser.test.tsx",
              ],
              typecheck: {
                enabled: true,
                tsconfig: path.join(import.meta.dirname, "tsconfig.vitest.json"),
              },
            },
          },
          ...(process.env.CODEX_GUI_TEST_RUN_DIR
            ? [
                {
                  extends: true as const,
                  plugins: [
                    // The plugin will run tests for the stories defined in your Storybook config
                    // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
                    storybookTest({
                      configDir: path.join(import.meta.dirname, ".storybook"),
                    }),
                  ],
                  test: {
                    name: "storybook",
                    browser: {
                      enabled: true,
                      headless: true,
                      provider: playwright({}),
                      instances: [
                        {
                          browser: "chromium" as const,
                        },
                      ],
                    },
                  },
                },
              ]
            : []),
        ],
      },
    }),
  ),
  process.env.CODEX_GUI_TEST_RUN_DIR ? isolatedVitestConfig() : {},
);
