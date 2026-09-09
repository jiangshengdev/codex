import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  continueSecondTask,
  createMultiSessionHarness,
  firstThreadId,
  secondThreadId,
  selectTask,
} from "./multiSessionHarness";
import { composer, settledRender, submit } from "./persistenceHarness";

async function measureRecoveryLayout(page: Page, notice: Locator, restore: Locator, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await settledRender(page);
  await expect(notice).toBeVisible();
  const contentBox = await notice.locator(".failure-layout__content").boundingBox();
  const buttonBox = await restore.boundingBox();
  if (contentBox == null || buttonBox == null) throw new Error("Recovery notice must be laid out");
  const fitsViewport = await notice.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return (
      bounds.left >= 0 &&
      bounds.right <= window.innerWidth &&
      element.scrollWidth <= element.clientWidth
    );
  });
  return { contentBox, buttonBox, fitsViewport };
}

test("manual sync restoration retains data and diagnostics while replacing only the affected subscription", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page);
  await host.open();
  host.finish(firstThreadId, "First task retained answer");
  await expect(page.getByText("First task retained answer", { exact: true })).toBeVisible();
  await composer(page).fill("First task retained draft");
  await continueSecondTask(page);
  await submit(page, "Second task queued message");
  await composer(page).fill("Second task retained draft");
  const oldSubscription = host.subscription(firstThreadId);
  await selectTask(page, firstThreadId);
  host.closeProjection(firstThreadId);
  const paused = page.getByText("Message synchronization paused", { exact: true });
  const restore = page.getByRole("button", { name: "Restore sync", exact: true });
  const restoring = page.getByRole("button", { name: "Restoring sync…", exact: true });
  const failure = page.getByText("Synchronization could not be restored. You can try again.", {
    exact: true,
  });
  await expect(paused).toHaveCount(1);
  await expect(restore).toBeEnabled();
  await expect(composer(page)).toHaveText("First task retained draft");
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");
  expect(host.attachments(firstThreadId)).toHaveLength(1);

  host.setAttachMode(firstThreadId, "error");
  await restore.click();
  await expect(failure).toBeVisible();
  await expect(restore).toBeEnabled();
  const notice = page.getByRole("alert").filter({ has: paused });
  const wideLayout = await measureRecoveryLayout(page, notice, restore, 1280);
  expect(wideLayout.buttonBox.x).toBeGreaterThanOrEqual(
    wideLayout.contentBox.x + wideLayout.contentBox.width,
  );
  expect(wideLayout.fitsViewport).toBe(true);
  const narrowLayout = await measureRecoveryLayout(page, notice, restore, 390);
  expect(narrowLayout.buttonBox.y).toBeGreaterThanOrEqual(
    narrowLayout.contentBox.y + narrowLayout.contentBox.height,
  );
  expect(narrowLayout.fitsViewport).toBe(true);
  host.setAttachMode(firstThreadId, "hold");
  await restore.focus();
  await expect(restore).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(restoring).toBeDisabled();
  await page.keyboard.press("Enter");
  await settledRender(page);
  expect(host.attachments(firstThreadId)).toHaveLength(3);
  await expect(failure).toBeVisible();
  await expect(page.getByText("First task retained answer", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View diagnostic information", exact: true }).click();
  const diagnostics = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
  await expect(diagnostics).toContainText("New session attach unavailable");
  await expect.poll(() => host.attachments(firstThreadId).length).toBe(3);
  host.releaseAttachment(firstThreadId, "Recovery still unavailable");
  await expect(diagnostics).toContainText("Recovery still unavailable");
  await diagnostics.getByRole("button", { name: "Close diagnostics", exact: true }).click();
  await expect(restore).toBeEnabled();

  await restore.click();
  await expect(restoring).toBeDisabled();
  await expect.poll(() => host.attachments(firstThreadId).length).toBe(4);
  host.releaseAttachment(firstThreadId);
  await expect(paused).toHaveCount(0);
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(composer(page)).toHaveText("First task retained draft");
  await expect(page.getByText("First task retained answer", { exact: true })).toBeVisible();
  expect(host.subscription(firstThreadId)).not.toBe(oldSubscription);
  host.closeProjection(firstThreadId, oldSubscription);
  await settledRender(page);
  await expect(paused).toHaveCount(0);
  expect(host.attachments(secondThreadId)).toHaveLength(1);
  expect(host.detaches()).toHaveLength(0);
  expect(host.sends(firstThreadId)).toHaveLength(0);
  await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
  await page.setViewportSize({ width: 1280, height: 900 });

  await submit(page, "First task fresh input");
  await expect.poll(() => host.sends(firstThreadId).length).toBe(1);
  host.finish(firstThreadId, "First task fresh response");
  await expect(page.getByText("First task fresh response", { exact: true })).toBeVisible();
  host.finish(secondThreadId, "Second task independent response");
  await expect.poll(() => host.sends(secondThreadId).length).toBe(1);
  await selectTask(page, secondThreadId);
  await expect(composer(page)).toHaveText("Second task retained draft");
  await expect(page.getByText("Second task independent response", { exact: true })).toBeVisible();
  expect(host.attachments(secondThreadId)).toHaveLength(1);
  expect(host.detaches()).toHaveLength(0);
});
