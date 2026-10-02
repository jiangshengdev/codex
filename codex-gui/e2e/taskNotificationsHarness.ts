import { expect, type BrowserContext, type Page, type Request } from "@playwright/test";
import type { TaskNotificationTarget } from "@/features/taskNotifications/taskNotificationProtocol";
import { activeRow, firstThreadId, firstTitle, openMenu } from "./multiSessionHarness";

type CapturedNotification = {
  title: string;
  options: Omit<NotificationOptions, "data"> & { data: TaskNotificationTarget };
};
const captureKey = "test-task-notifications";

export async function installNotificationClickDriver(context: BrowserContext) {
  // Capture only the platform display boundary; do not replace the worker or
  // install a document-bound onclick callback.
  await context.addInitScript(
    ({ key }) => {
      Object.defineProperty(Notification, "permission", {
        configurable: true,
        get: () => "granted",
      });
      ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? "[]") as unknown[];
        saved.push({ title, options });
        sessionStorage.setItem(key, JSON.stringify(saved));
        return Promise.resolve();
      };
    },
    { key: captureKey },
  );
}

export async function capturedNotifications(page: Page): Promise<CapturedNotification[]> {
  const serialized = await page.evaluate((key) => sessionStorage.getItem(key) ?? "[]", captureKey);
  return JSON.parse(serialized) as CapturedNotification[];
}

export async function capturedTarget(page: Page): Promise<TaskNotificationTarget> {
  await expect.poll(async () => (await capturedNotifications(page)).length).toBe(1);
  const captured = (await capturedNotifications(page))[0];
  if (captured == null) throw new Error("Missing captured notification");
  expect(captured.title).toBe(firstTitle);
  expect(captured.options.body).toContain("Where next?");
  expect(captured.options.data.threadId).toBe(firstThreadId);
  return captured.options.data;
}

export async function historyReady(page: Page) {
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("article", { name: firstTitle, exact: true })).toBeVisible();
  await openMenu(page);
  await expect(activeRow(page, firstThreadId)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Active tasks", exact: true })).toHaveCount(0);
}

export async function goToHistory(page: Page) {
  await openMenu(page);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History", exact: true })
    .click();
  await historyReady(page);
}

export async function notificationIdentity(page: Page): Promise<string> {
  await expect.poll(() => page.evaluate(() => window.name)).toMatch(/^codex-notification-tab:/);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  return page.evaluate(() => window.name);
}

export async function dispatchNotificationClick(
  page: Page,
  target: TaskNotificationTarget,
  observedPages: readonly Page[] = [page],
) {
  const documents = await Promise.all(
    observedPages.map(async (observed) => {
      let requests = 0;
      const onRequest = (request: Request) => {
        if (request.isNavigationRequest() && request.frame() === observed.mainFrame())
          requests += 1;
      };
      const timeOrigin = await observed.evaluate(() => performance.timeOrigin);
      observed.on("request", onRequest);
      return { observed, timeOrigin, onRequest, requests: () => requests };
    }),
  );
  const outcome = await page.evaluate(async (savedTarget) => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active == null) throw new Error("Notification worker is not active");
    return await new Promise<{ completed?: boolean; error?: string }>((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event: MessageEvent<{ completed?: boolean; error?: string }>) => {
        channel.port1.close();
        resolve(event.data);
      };
      registration.active?.postMessage({ type: "test-notification-click", target: savedTarget }, [
        channel.port2,
      ]);
    });
  }, target);
  expect(outcome).toEqual({ completed: true });
  for (const document of documents) {
    document.observed.off("request", document.onRequest);
    expect(document.requests()).toBe(0);
    expect(await document.observed.evaluate(() => performance.timeOrigin)).toBe(
      document.timeOrigin,
    );
  }
}
