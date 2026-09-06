import { expect, test } from "@playwright/test";
import {
  activeRow,
  continueSecondTask,
  createMultiSessionHarness,
  firstThreadId,
  firstTitle,
  openMenu,
  secondThreadId,
  secondTitle,
  selectTask,
} from "./multiSessionHarness";
import { composer, ready, settledRender, submit } from "./persistenceHarness";

test("history continuation keeps background queues advancing and output owned by each task", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page);
  await host.open();
  await submit(page, "First task queued one");
  await submit(page, "First task queued two");
  await continueSecondTask(page);
  await submit(page, "Second task queued one");
  host.finish(firstThreadId, "First task initial answer");
  await expect.poll(() => host.sends(firstThreadId).length).toBe(1);
  await expect(page.getByRole("heading", { name: secondTitle, exact: true })).toBeVisible();
  await expect(page.getByText("First task initial answer", { exact: true })).toHaveCount(0);
  host.finish(firstThreadId, "First task background answer");
  await expect.poll(() => host.sends(firstThreadId).length).toBe(2);
  host.finish(secondThreadId, "Second task foreground answer");
  await expect.poll(() => host.sends(secondThreadId).length).toBe(1);
  await expect(page.getByText("Second task foreground answer", { exact: true })).toBeVisible();
  await selectTask(page, firstThreadId);
  await expect(page.getByText("First task background answer", { exact: true })).toBeVisible();
  await expect(page.getByText("Second task foreground answer", { exact: true })).toHaveCount(0);
  await selectTask(page, secondThreadId);
  expect(host.attachments(firstThreadId)).toHaveLength(1);
  expect(host.attachments(secondThreadId)).toHaveLength(1);
  expect(host.detaches()).toHaveLength(0);
  expect(host.sends(firstThreadId).map(({ params }) => params)).toMatchObject([
    { input: [{ type: "text", text: "First task queued one" }] },
    { input: [{ type: "text", text: "First task queued two" }] },
  ]);
});

test("reload restores the collection, selected task and drafts while each queue needs its own review", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page);
  await host.open();
  await submit(page, "First restored queue");
  await composer(page).fill("First retained draft");
  await continueSecondTask(page);
  await submit(page, "Second restored queue");
  await composer(page).fill("Second retained draft");
  await settledRender(page);
  await page.reload();
  await ready(page);
  await expect(page).toHaveURL(new RegExp(`/task/${secondThreadId}$`));
  await expect(composer(page)).toHaveText("Second retained draft");
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  await expect.poll(() => host.attachments(firstThreadId).length).toBe(2);
  await openMenu(page);
  await expect(activeRow(page, firstThreadId)).toBeVisible();
  await expect(
    activeRow(page, secondThreadId).getByRole("button", { name: new RegExp(secondTitle) }),
  ).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("Escape");
  host.finish(firstThreadId);
  host.finish(secondThreadId);
  await selectTask(page, firstThreadId);
  await expect(composer(page)).toHaveText("First retained draft");
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  expect(host.sends(firstThreadId)).toHaveLength(0);
  expect(host.sends(secondThreadId)).toHaveLength(0);
  await page.getByRole("button", { name: "Review and continue", exact: true }).click();
  await expect.poll(() => host.sends(firstThreadId).length).toBe(1);
  await selectTask(page, secondThreadId);
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  expect(host.sends(secondThreadId)).toHaveLength(0);
  await page.getByRole("button", { name: "Review and continue", exact: true }).click();
  await expect.poll(() => host.sends(secondThreadId).length).toBe(1);
});

test("an unknown send stays isolated and is not resent by another task's review or its own", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page, true, false);
  await host.open();
  await submit(page, "Unknown first task guide", "Guide");
  await expect.poll(() => host.sends(firstThreadId).length).toBe(1);
  const original = host.sends(firstThreadId)[0];
  await continueSecondTask(page);
  await submit(page, "Second task awaits review");
  await page.reload();
  await ready(page);
  await expect.poll(() => host.attachments(firstThreadId).length).toBe(2);
  host.finish(secondThreadId);
  await page.getByRole("button", { name: "Review and continue", exact: true }).click();
  await expect.poll(() => host.sends(secondThreadId).length).toBe(1);
  expect(host.sends(firstThreadId)).toEqual([original]);
  await selectTask(page, firstThreadId);
  await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review and continue", exact: true }).click();
  await settledRender(page);
  expect(host.sends(firstThreadId)).toEqual([original]);
  await page.reload();
  await ready(page);
  await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
  expect(host.sends(firstThreadId)).toEqual([original]);
});

test("running tasks cannot be removed and removing an idle viewed task preserves history and draft", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page);
  await host.open();
  await composer(page).fill("Draft kept after removal");
  await continueSecondTask(page);
  await openMenu(page);
  await expect(
    activeRow(page, firstThreadId).getByRole("button", { name: "Remove from list", exact: true }),
  ).toBeDisabled();
  await expect(
    activeRow(page, secondThreadId).getByRole("button", { name: "Remove from list", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  host.finish(firstThreadId, "History remains after removal");
  await selectTask(page, firstThreadId);
  await expect(page.getByRole("status", { name: "Current task is idle" })).toBeVisible();
  await openMenu(page);
  await activeRow(page, firstThreadId)
    .getByRole("button", { name: "Remove from list", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/history/${firstThreadId}$`));
  await expect(page.getByText("History remains after removal", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: firstTitle, exact: true })).toBeVisible();
  await openMenu(page);
  await expect(activeRow(page, firstThreadId)).toHaveCount(0);
  await expect(activeRow(page, secondThreadId)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Continue this task", exact: true }).click();
  await ready(page);
  await expect(composer(page)).toHaveText("Draft kept after removal");
  expect(host.detaches()).toHaveLength(1);
  expect(host.attachments(firstThreadId)).toHaveLength(2);
  expect(host.sends(firstThreadId)).toHaveLength(0);
});
