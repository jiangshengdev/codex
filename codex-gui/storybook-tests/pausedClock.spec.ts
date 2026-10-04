import { expect, test } from "@playwright/test";
import { installPausedClock } from "./pausedClock";

test("pauses despite time advancing before the pause command is applied", async ({ page }) => {
  const pauseAt = page.clock.pauseAt.bind(page.clock);
  page.clock.pauseAt = async (target) => {
    // Model a delayed command without a wall-clock sleep or private clock internals.
    await page.clock.runFor(250);
    await pauseAt(target);
  };

  await installPausedClock(page);
  await page.evaluate(() => {
    document.body.textContent = "waiting";
    setTimeout(() => {
      document.body.textContent = "finished";
    }, 500);
  });
  await page.clock.runFor(499);
  await expect(page.locator("body")).toHaveText("waiting");
  await page.clock.runFor(1);
  await expect(page.locator("body")).toHaveText("finished");
});
