import { expect, test } from "@playwright/test";
import {
  composer,
  createPersistenceHarness,
  persistenceThreadId,
  ready,
  settledRender,
  submit,
} from "./persistenceHarness";

test("restores an ordinary draft after a real reload without sending it", async ({ page }) => {
  const host = await createPersistenceHarness(page);
  await host.open();
  await composer(page).fill("Draft survives a real reload");
  await settledRender(page);
  await page.reload();
  await ready(page);
  await expect(composer(page)).toHaveText("Draft survives a real reload");
  expect(host.sends()).toHaveLength(0);
});

test("restored queues stay paused across terminal events and send only after review", async ({
  page,
}) => {
  const host = await createPersistenceHarness(page, true);
  await host.open();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await submit(page, "Queued before reload");
  expect(host.sends()).toHaveLength(0);
  await page.reload();
  await ready(page);
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  host.finishActiveTurn();
  await expect(page.getByRole("status", { name: "Current task is idle" })).toBeVisible();
  await settledRender(page);
  expect(host.sends()).toHaveLength(0);
  await page.getByRole("button", { name: "Review and continue", exact: true }).click();
  await expect.poll(() => host.sends().length).toBe(1);
  expect(host.sends()[0]?.params).toMatchObject({
    input: [{ type: "text", text: "Queued before reload" }],
  });
});

test("review permission does not survive another reload", async ({ page }) => {
  const host = await createPersistenceHarness(page, true);
  await host.open();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await submit(page, "Still queued behind the active turn");
  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: "Review and continue", exact: true }).click();
  await expect(page.getByText("Restored messages are paused", { exact: true })).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  host.finishActiveTurn();
  await settledRender(page);
  expect(host.sends()).toHaveLength(0);
});

test("a sessionStorage write failure preserves input and blocks RPC until retry", async ({
  page,
}) => {
  const host = await createPersistenceHarness(page);
  await host.open();
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, "setItem");
    const original: unknown = descriptor?.value;
    if (descriptor == null || typeof original !== "function") {
      throw new Error("Missing native storage setter");
    }
    Storage.prototype.setItem = function (key, value) {
      if (this === window.sessionStorage)
        throw new DOMException("Test storage full", "QuotaExceededError");
      Reflect.apply(original, this, [key, value]);
    };
    Object.defineProperty(window, "restorePersistenceTestStorage", {
      value: () => {
        Object.defineProperty(Storage.prototype, "setItem", descriptor);
      },
      configurable: true,
    });
  });
  await composer(page).fill("Keep this unsaved input");
  await expect(page.getByRole("alert")).toContainText("Changes could not be saved");
  await composer(page).press("Enter");
  await expect(composer(page)).toHaveText("Keep this unsaved input");
  await settledRender(page);
  expect(host.sends()).toHaveLength(0);
  await page.evaluate(() => {
    const restore: unknown = Reflect.get(window, "restorePersistenceTestStorage");
    if (typeof restore !== "function") throw new Error("Missing test storage restoration");
    Reflect.apply(restore, window, []);
  });
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(composer(page)).toHaveText("Keep this unsaved input");
  expect(host.sends()).toHaveLength(0);
});

for (const action of ["Send", "Guide"] as const) {
  test(`an unknown ${action === "Send" ? "start" : "steer"} is not resent by reload or review`, async ({
    page,
  }) => {
    const host = await createPersistenceHarness(page, action === "Guide");
    await host.open();
    await submit(page, `Unknown ${action} result`, action);
    await expect.poll(() => host.sends().length).toBe(1);
    const originalRequest = host.sends()[0];
    await page.reload();
    await ready(page);
    await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Review and continue", exact: true }).click();
    await settledRender(page);
    expect(host.sends()).toEqual([originalRequest]);
    await page.reload();
    await ready(page);
    await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
    await settledRender(page);
    expect(host.sends()).toEqual([originalRequest]);
  });
}

test("an opener's old sessionStorage copy remains paused after the original page sends and closes", async ({
  page,
}) => {
  const original = await createPersistenceHarness(page, true);
  await original.open();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await submit(page, "Copied while still queued");
  // The browser performs the initial copy when the opener creates this page.
  // Keep it outside the task route until the original has sent and closed.
  const openedPage = page.waitForEvent("popup");
  await page.evaluate(() => {
    window.open("about:blank", "_blank");
  });
  const copiedPage = await openedPage;
  await copiedPage.goto("/");
  const copied = await createPersistenceHarness(copiedPage);
  original.finishActiveTurn();
  await expect.poll(() => original.sends().length).toBe(1);
  await page.close();

  await copiedPage.goto(`/task/${persistenceThreadId}`);
  await ready(copiedPage);
  await expect(copiedPage.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  await settledRender(copiedPage);
  expect(copied.sends()).toHaveLength(0);
});

test("page lifecycle restoration invalidates review permission before reconnecting", async ({
  page,
}) => {
  const host = await createPersistenceHarness(page, true);
  await host.open();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeEnabled();
  await submit(page, "Await lifecycle restoration");
  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: "Review and continue", exact: true }).click();
  await expect(page.getByText("Restored messages are paused", { exact: true })).toHaveCount(0);
  const attachments = host.requests.filter(
    ({ method }) => method === "thread/projection/attach",
  ).length;
  // This verifies the production lifecycle event handlers, not a browser's
  // eligibility for or actual navigation through BFCache.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect
    .poll(() => host.requests.filter(({ method }) => method === "thread/projection/attach").length)
    .toBeGreaterThan(attachments);
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  host.finishActiveTurn();
  await settledRender(page);
  expect(host.sends()).toHaveLength(0);
});
