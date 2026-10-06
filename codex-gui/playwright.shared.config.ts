import process from "node:process";
import { defineConfig, devices } from "@playwright/test";
import { localNetworkLaunchOptions } from "./scripts/testRun/network.ts";

export default defineConfig({
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    actionTimeout: 0,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: localNetworkLaunchOptions("chromium") },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], launchOptions: localNetworkLaunchOptions("firefox") },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], launchOptions: localNetworkLaunchOptions("webkit") },
    },
  ],
});
