import { expect, test } from "vitest";
import { runIsolated } from "./run.ts";

test.each(["chromium", "firefox", "webkit"])(
  "%s bypasses proxies for localhost and 127.0.0.1",
  async (browserName) => {
    const result = await runIsolated({
      name: `network-${browserName}`,
      service: {
        command: process.execPath,
        args: ["--import", "tsx", "scripts/testRun/fixtures/networkService.ts"],
      },
      test: {
        command: process.execPath,
        args: ["--import", "tsx", "scripts/testRun/fixtures/networkBrowser.ts", browserName],
      },
      signal: AbortSignal.timeout(30_000),
    });
    expect(result.code).toBe(0);
  },
  40_000,
);
