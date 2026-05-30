import path from "node:path";
import { defineConfig, configDefaults, mergeConfig } from "vitest/config";
import packageJson from "./package.json" with { type: "json" };
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      root: import.meta.dirname,
      name: packageJson.name,
      environment: "node",
      exclude: [
        ...configDefaults.exclude,
        "e2e/**",
        "src/**/*.browser.test.ts",
        "src/**/*.browser.test.tsx",
      ],
      typecheck: {
        enabled: true,
        tsconfig: path.join(import.meta.dirname, "tsconfig.vitest.json"),
      },
      watch: false,
    },
  }),
);
