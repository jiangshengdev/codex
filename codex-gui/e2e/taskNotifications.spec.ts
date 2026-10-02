import { expect, test, type Page } from "@playwright/test";
import { createMultiSessionHarness, firstThreadId } from "./multiSessionHarness";
import { ready } from "./persistenceHarness";
import {
  dispatchNotificationClick,
  installNotificationClickDriver,
  notificationIdentity,
  capturedTarget,
  capturedNotifications,
  goToHistory,
  historyReady,
} from "./taskNotificationsHarness";

const reloadCases: { name: string; runReload: (page: Page) => Promise<unknown> }[] = [
  { name: "none", runReload: () => Promise.resolve() },
  { name: "browser", runReload: (page) => page.reload() },
  {
    name: "script",
    runReload: (page) =>
      Promise.all([
        page.waitForEvent("load"),
        page.evaluate(() => {
          location.reload();
        }),
      ]),
  },
];

for (const { name, runReload } of reloadCases) {
  test(`a live question notification returns to its task after ${name} reload`, async ({
    page,
    context,
  }) => {
    await installNotificationClickDriver(context);
    const host = await createMultiSessionHarness(page);
    await host.open();
    await notificationIdentity(page);
    await goToHistory(page);
    host.question(firstThreadId, "Where next?");
    const target = await capturedTarget(page);
    await runReload(page);
    await historyReady(page);
    expect(await page.evaluate(() => window.name)).toBe(target.tabId);
    await dispatchNotificationClick(page, target);
    await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
    await ready(page);
    expect(await capturedNotifications(page)).toHaveLength(1);
    expect(host.sends(firstThreadId)).toHaveLength(0);
    expect(context.pages()).toEqual([page]);
  });
}

test("a second authenticated tab does not accept another tab's notification", async ({
  page,
  context,
}) => {
  await installNotificationClickDriver(context);
  const host = await createMultiSessionHarness(page);
  await host.open();
  await goToHistory(page);
  host.question(firstThreadId, "Where next?");
  const target = await capturedTarget(page);
  const other = await context.newPage();
  const otherHost = await createMultiSessionHarness(other);
  await otherHost.open();
  await goToHistory(other);
  expect(await notificationIdentity(other)).not.toBe(target.tabId);
  await page.reload();
  await historyReady(page);
  await dispatchNotificationClick(other, target, [page, other]);
  await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
  await ready(page);
  await expect(other).toHaveURL(/\/history$/);
  expect(context.pages()).toHaveLength(2);
});

test("an opener storage copy gets a new identity and a closed source does not reopen", async ({
  page,
  context,
}) => {
  await installNotificationClickDriver(context);
  const host = await createMultiSessionHarness(page);
  await host.open();
  await goToHistory(page);
  host.question(firstThreadId, "Where next?");
  const target = await capturedTarget(page);
  const opened = page.waitForEvent("popup");
  await page.evaluate(() => {
    window.open("about:blank", "_blank");
  });
  const copy = await opened;
  await createMultiSessionHarness(copy);
  // No token: this exercises the browser's actual sessionStorage copy.
  await copy.goto(new URL("/history", page.url()).href);
  await historyReady(copy);
  expect(await notificationIdentity(copy)).not.toBe(target.tabId);
  await dispatchNotificationClick(copy, target, [page, copy]);
  await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
  await expect(copy).toHaveURL(/\/history$/);
  await page.close();
  await dispatchNotificationClick(copy, target);
  await expect(copy).toHaveURL(/\/history$/);
  expect(context.pages()).toEqual([copy]);
});
