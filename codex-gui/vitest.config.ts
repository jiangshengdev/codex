import path from "node:path";
import { defineConfig, configDefaults, mergeConfig } from "vitest/config";
import packageJson from "./package.json" with { type: "json" };
import viteConfig from "./vite.config.ts";
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default mergeConfig(viteConfig, defineConfig({
  test: {
    watch: false,
    projects: [{
      extends: true,
      test: {
        root: import.meta.dirname,
        name: packageJson.name,
        environment: "node",
        exclude: [...configDefaults.exclude, "e2e/**", "src/**/*.browser.test.ts", "src/**/*.browser.test.tsx"],
        typecheck: {
          enabled: true,
          tsconfig: path.join(import.meta.dirname, "tsconfig.vitest.json")
        }
      }
    }, {
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
}));