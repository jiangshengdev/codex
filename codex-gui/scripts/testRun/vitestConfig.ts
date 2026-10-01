import path from "node:path";
import type { TestUserConfig, ViteUserConfig } from "vitest/config";
import { currentRunContext } from "./resources.ts";

type BrowserInstances = NonNullable<NonNullable<TestUserConfig["browser"]>["instances"]>;

export function isolatedBrowserInstances(instances: BrowserInstances): BrowserInstances {
  const run = currentRunContext();
  return instances.map((instance) => ({
    ...instance,
    screenshotDirectory: path.join(
      run.artifactsDirectory,
      "screenshots",
      instance.name ?? instance.browser,
    ),
  }));
}

export function isolatedVitestConfig(): ViteUserConfig {
  const run = currentRunContext();
  return {
    cacheDir: path.join(run.cacheDirectory, "vitest"),
    server: {
      fs: { allow: [process.cwd(), run.directory] },
    },
    test: {
      reporters: [["json", { outputFile: path.join(run.artifactsDirectory, "vitest.json") }]],
      attachmentsDir: path.join(run.artifactsDirectory, "attachments"),
      coverage: { reportsDirectory: path.join(run.artifactsDirectory, "coverage") },
      browser: {
        api: { host: "127.0.0.1", port: run.port, strictPort: true },
        screenshotDirectory: path.join(run.artifactsDirectory, "screenshots"),
        trace: { mode: "off", tracesDir: path.join(run.artifactsDirectory, "traces") },
      },
    },
  };
}
