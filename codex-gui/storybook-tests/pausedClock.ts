import type { Page } from "@playwright/test";

export async function installPausedClock(page: Page): Promise<void> {
  // Leave room for clock setup and command delivery before pausing.
  // Sampling the host's current time can produce a target the browser has already passed.
  await page.clock.install({ time: new Date("2024-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2024-01-01T01:00:00Z"));
}
