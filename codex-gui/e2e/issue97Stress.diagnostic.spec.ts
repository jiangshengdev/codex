import process from "node:process";
import { expect, test } from "@playwright/test";
import { createNewSessionHarness } from "./newSessionHarness";
import { firstThreadId } from "./multiSessionHarness";
import {
  frameDelay,
  installScrollRecorder,
  markScrollProbe,
  scrollState,
  type ScrollProbeWindow,
} from "./issue97ScrollRecorder";

const rounds = Number(process.env.ISSUE97_ROUNDS ?? "100");
const initialSeed = Number(process.env.ISSUE97_SEED ?? "97");
const instrumentCalls = process.env.ISSUE97_INSTRUMENT !== "0";

test.use({ trace: "retain-on-failure" });

test("issue 97 batch: native navigation and wheel timing", async ({ page }, info) => {
  test.setTimeout(10 * 60 * 1000);
  expect(Number.isSafeInteger(rounds) && rounds > 0).toBe(true);
  let seed = (initialSeed + info.repeatEachIndex) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const results: unknown[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installScrollRecorder(page, instrumentCalls);
  const host = await createNewSessionHarness(page, true);
  await host.open();
  host.finish(
    firstThreadId,
    Array.from(
      { length: 120 },
      (_, index) =>
        `Batch scroll paragraph ${String(index + 1)}. This is a scroll diagnostic fixture.`,
    ).join("\n\n"),
  );
  await expect(page.getByText(/^Batch scroll paragraph 120\./)).toBeAttached();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const dialog = page.getByRole("dialog", { name: "Navigation", exact: true });
  try {
    for (let round = 0; round < rounds; round++) {
      const openingFrames = [0, 1, 2, 4, 8][random() % 5] ?? 0;
      const closingFrames = [0, 1, 2, 4, 8][random() % 5] ?? 0;
      const freshDocument = round % 20 === 0;
      await menu.click();
      await page.getByRole("button", { name: "New session", exact: true }).click();
      await expect(page).toHaveURL(/\/new$/);
      if (freshDocument) await page.reload();
      await expect(dialog).toBeHidden();
      await expect.poll(async () => (await scrollState(page)).maximum).toBeLessThanOrEqual(1);
      await markScrollProbe(page, "round-start", { round, openingFrames, closingFrames });
      await menu.click();
      await frameDelay(page, openingFrames);
      // Keep native mouse input, but do not wait for drawer animation stability.
      await page.getByRole("button", { name: "Current task", exact: true }).click({ force: true });
      await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
      await frameDelay(page, closingFrames);
      const transition = await scrollState(page);
      await page.mouse.move(800, 360);
      await page.mouse.wheel(0, transition.top > 400 ? -300 : 300);
      await expect(dialog).toBeHidden();
      await expect.poll(async () => (await scrollState(page)).overflow).not.toBe("hidden");
      await expect.poll(async () => (await scrollState(page)).maximum).toBeGreaterThan(1000);
      // Sample after unlock: input during a modal is allowed to be blocked.
      await frameDelay(page, 2);
      const before = await scrollState(page);
      const direction = before.top > 400 ? -1 : 1;
      await markScrollProbe(page, "wheel-probe", { round, direction });
      await page.mouse.wheel(0, direction * 300);
      await expect
        .poll(async () => direction * ((await scrollState(page)).top - before.top), {
          timeout: 2000,
        })
        .toBeGreaterThan(50);
      await frameDelay(page, 4);
      const after = await scrollState(page);
      expect(direction * (after.top - before.top)).toBeGreaterThan(50);
      results.push({
        round,
        openingFrames,
        closingFrames,
        freshDocument,
        transition,
        before,
        after,
      });
      if ((round + 1) % 20 === 0) {
        console.log(JSON.stringify({ batch: info.repeatEachIndex, completed: round + 1, rounds }));
      }
    }
    expect(errors).toEqual([]);
  } finally {
    const probe = await page.evaluate(() => ({
      events: (window as ScrollProbeWindow).issue97Probe.events,
      frameCount: (window as ScrollProbeWindow).issue97Probe.frameCount,
      longFrames: (window as ScrollProbeWindow).issue97Probe.longFrames,
    }));
    await info.attach("batch-diagnostics", {
      body: JSON.stringify({
        initialSeed,
        batch: info.repeatEachIndex,
        instrumentCalls,
        results,
        errors,
        probe,
      }),
      contentType: "application/json",
    });
    if (info.status !== info.expectedStatus) {
      await info.attach("failure-viewport", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
    console.log(
      JSON.stringify({
        batch: info.repeatEachIndex,
        completed: results.length,
        rounds,
        instrumentCalls,
      }),
    );
  }
});
