import { expect, test } from "@playwright/test";
import {
  continueSecondTask,
  createMultiSessionHarness,
  firstThreadId,
  secondThreadId,
  selectTask,
} from "./multiSessionHarness";
import { composer, settledRender, submit } from "./persistenceHarness";

test("one reconnect restores all tasks independently while preserving navigation during recovery", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page);
  await host.open();
  host.finish(firstThreadId, "First preserved answer");
  await composer(page).fill("First preserved draft");
  await continueSecondTask(page);
  host.finish(secondThreadId, "Second preserved answer");
  await composer(page).fill("Second preserved draft");
  await host.closeNormally();
  await expect(page.getByText("Connection closed", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/task/${secondThreadId}$`));
  host.setAttachMode(firstThreadId, "hold");
  host.setAttachMode(secondThreadId, "hold");
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect.poll(() => host.attachments(firstThreadId).length).toBe(2);
  await expect.poll(() => host.attachments(secondThreadId).length).toBe(2);
  await expect(page).toHaveURL(new RegExp(`/task/${secondThreadId}$`));
  await selectTask(page, firstThreadId);
  await expect(composer(page)).toHaveText("First preserved draft");
  host.releaseAttachment(secondThreadId, "Second retained task unavailable");
  host.releaseAttachment(firstThreadId);
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
  await expect(page.getByText("First preserved answer", { exact: true })).toBeVisible();
  await selectTask(page, secondThreadId);
  await expect(composer(page)).toHaveText("Second preserved draft");
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");
  await expect(page.getByText("Second preserved answer", { exact: true })).toBeVisible();
  host.setAttachMode(secondThreadId, null);
  await page.getByRole("button", { name: "Restore task", exact: true }).click();
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  expect(host.initializations()).toHaveLength(2);
  expect(host.attachments(firstThreadId)).toHaveLength(2);
  expect(host.attachments(secondThreadId)).toHaveLength(3);
  expect(host.sends(firstThreadId)).toHaveLength(0);
  expect(host.sends(secondThreadId)).toHaveLength(0);
});

test("normal close preserves input through keyboard reconnect, shared failure and task retry", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page);
  await host.open();
  host.finish(firstThreadId, "Retained connection recovery answer");
  await expect(
    page.getByText("Retained connection recovery answer", { exact: true }),
  ).toBeVisible();
  await composer(page).fill("Draft survives connection recovery");
  await host.closeNormally();
  const closed = page.getByText("Connection closed", { exact: true });
  const reconnect = page.getByRole("button", { name: "Reconnect", exact: true });
  await expect(closed).toBeVisible();
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");
  expect(host.initializations()).toHaveLength(1);
  const notice = page.getByRole("status").filter({ has: closed });
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await settledRender(page);
    await expect(reconnect).toBeVisible();
    expect(
      await notice.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.right <= window.innerWidth &&
          element.scrollWidth <= element.clientWidth
        );
      }),
    ).toBe(true);
  }
  host.setInitializeHold(true);
  await reconnect.focus();
  await page.keyboard.press("Enter");
  const reconnecting = page.getByRole("button", { name: "Reconnecting…", exact: true });
  await expect(reconnecting).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect.poll(() => host.initializations().length).toBe(2);
  host.releaseInitialize("Handshake temporarily unavailable");
  const sharedFailure = page.getByText("The connection could not be restored. You can try again.", {
    exact: true,
  });
  await expect(sharedFailure).toBeVisible();
  await reconnect.click();
  await expect(reconnecting).toBeDisabled();
  await expect(sharedFailure).toBeVisible();
  await page.getByRole("button", { name: "View diagnostic information", exact: true }).click();
  const diagnostics = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
  await expect(diagnostics).toContainText("Handshake temporarily unavailable");
  await diagnostics.getByRole("button", { name: "Close diagnostics", exact: true }).click();
  await expect.poll(() => host.initializations().length).toBe(3);
  host.setAttachMode(firstThreadId, "error");
  host.releaseInitialize();
  await expect(
    page.getByText("This task could not be restored. You can try again.", { exact: true }),
  ).toBeVisible();
  await expect(closed).toHaveCount(0);
  await expect(composer(page)).toHaveAttribute("contenteditable", "false");
  await expect(composer(page)).toHaveText("Draft survives connection recovery");
  host.setAttachMode(firstThreadId, "hold");
  await page.getByRole("button", { name: "Restore task", exact: true }).click();
  await expect(page.getByRole("button", { name: "Restoring task…", exact: true })).toBeDisabled();
  await expect.poll(() => host.attachments(firstThreadId).length).toBe(3);
  host.releaseAttachment(firstThreadId);
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(composer(page)).toHaveText("Draft survives connection recovery");
  await expect(
    page.getByText("Retained connection recovery answer", { exact: true }),
  ).toBeVisible();
  expect(host.initializations()).toHaveLength(3);
  expect(host.resumes(firstThreadId)).toHaveLength(1);
  expect(host.sends(firstThreadId)).toHaveLength(0);
  await composer(page).fill("Fresh input after reconnect");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => host.sends(firstThreadId).length).toBe(1);
});

test("an uncertain send is not repeated by reconnecting", async ({ page }) => {
  const host = await createMultiSessionHarness(page, true, false);
  await host.open();
  await submit(page, "Delivery remains unknown", "Guide");
  await expect.poll(() => host.sends(firstThreadId).length).toBe(1);
  await host.closeNormally();
  await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
  expect(host.sends(firstThreadId)).toHaveLength(1);
  expect(host.attachments(firstThreadId)).toHaveLength(2);
});

test("dirty pending edits remain available after closing and reconnecting", async ({ page }) => {
  const host = await createMultiSessionHarness(page);
  await host.open();
  await submit(page, "Original queued message");
  await page.getByRole("button", { name: "Pending: Queued 1", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Pending details", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Unsaved pending edit survives");
  await host.closeNormally();
  const retained = page.getByRole("textbox", { name: "Unsaved pending message", exact: true });
  await expect(retained).toHaveValue("Unsaved pending edit survives");
  const editorDialog = page.getByRole("dialog").filter({ has: retained });
  host.setAttachMode(firstThreadId, "error");
  await editorDialog.getByRole("button", { name: "Reconnect", exact: true }).click();
  await expect(
    editorDialog.getByText("This task could not be restored. You can try again.", { exact: true }),
  ).toBeVisible();
  await expect(retained).toHaveValue("Unsaved pending edit survives");
  await editorDialog
    .getByRole("button", { name: "View diagnostic information", exact: true })
    .click();
  const diagnostics = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
  await expect(diagnostics).toContainText("New session attach unavailable");
  await diagnostics.getByRole("button", { name: "Close diagnostics", exact: true }).click();
  host.setAttachMode(firstThreadId, null);
  await editorDialog.getByRole("button", { name: "Restore task", exact: true }).click();
  await expect(composer(page)).toHaveAttribute("contenteditable", "true");
  await expect(retained).toHaveValue("Unsaved pending edit survives");
  expect(host.initializations()).toHaveLength(2);
  expect(host.attachments(firstThreadId)).toHaveLength(3);
  expect(host.sends(firstThreadId)).toHaveLength(0);
});
