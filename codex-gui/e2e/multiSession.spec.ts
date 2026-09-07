import { expect, test } from "@playwright/test";
import {
  activeRow,
  continueSecondTask,
  createMultiSessionHarness,
  firstThreadId,
  firstTitle,
  openMenu,
  openTaskActions,
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

test("reload restores the collection, selected task and drafts while each queue needs its own Continue sending", async ({
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
  await expect(page.locator('[data-menu-error-indicator="true"]')).toHaveCount(0);
  await openMenu(page);
  await expect(activeRow(page, firstThreadId)).toBeVisible();
  await expect(
    activeRow(page, secondThreadId).getByRole("button", { name: secondTitle, exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.locator('[data-task-error-indicator="true"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  host.finish(firstThreadId);
  host.finish(secondThreadId);
  await selectTask(page, firstThreadId);
  await expect(composer(page)).toHaveText("First retained draft");
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  expect(host.sends(firstThreadId)).toHaveLength(0);
  expect(host.sends(secondThreadId)).toHaveLength(0);
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect.poll(() => host.sends(firstThreadId).length).toBe(1);
  await selectTask(page, secondThreadId);
  await expect(page.getByText("Restored messages are paused", { exact: true })).toBeVisible();
  expect(host.sends(secondThreadId)).toHaveLength(0);
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect.poll(() => host.sends(secondThreadId).length).toBe(1);
});

test("an unknown send stays isolated and is not resent by Continue sending in another task or its own", async ({
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
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect.poll(() => host.sends(secondThreadId).length).toBe(1);
  expect(host.sends(firstThreadId)).toEqual([original]);
  await selectTask(page, firstThreadId);
  await expect(page.getByText("Sending result unknown", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
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
  await openTaskActions(page, firstThreadId);
  await expect(
    page.getByRole("menuitem", { name: "Remove from list", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    activeRow(page, firstThreadId).getByRole("button", {
      name: `More options for ${firstTitle}`,
      exact: true,
    }),
  ).toBeFocused();
  await openTaskActions(page, secondThreadId);
  await expect(
    page.getByRole("menuitem", { name: "Remove from list", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    activeRow(page, secondThreadId).getByRole("button", {
      name: `More options for ${secondTitle}`,
      exact: true,
    }),
  ).toBeFocused();
  await expect(page.getByRole("heading", { name: "Active tasks", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeFocused();
  host.finish(firstThreadId, "History remains after removal");
  await selectTask(page, firstThreadId);
  await expect(page.getByRole("status", { name: "Current task is idle" })).toBeVisible();
  await openMenu(page);
  await openTaskActions(page, firstThreadId);
  await page.getByRole("menuitem", { name: "Remove from list", exact: true }).click();
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

test("a background resume failure stays in its task and viewing it does not retry or clear its dot", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page, false);
  await host.open();
  await continueSecondTask(page);
  const failure = "Background task resume unavailable";
  const errorMessage =
    /^JSON-RPC error \(id=\d+, code=-32000\): Background task resume unavailable$/;
  host.setResumeError(firstThreadId, failure);
  await page.reload();
  await ready(page);
  await expect.poll(() => host.resumes(firstThreadId).length).toBe(2);
  await expect(page).toHaveURL(new RegExp(`/task/${secondThreadId}$`));
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  await expect(page.locator('[data-menu-error-indicator="true"]')).toBeVisible();
  await openMenu(page);
  await expect(
    activeRow(page, firstThreadId).locator('[data-task-error-indicator="true"]'),
  ).toBeVisible();
  await expect(
    activeRow(page, secondThreadId).locator('[data-task-error-indicator="true"]'),
  ).toHaveCount(0);
  // A failed resume supplies no runtime title; its switch button exposes the UUID.
  await activeRow(page, firstThreadId)
    .getByRole("button", { name: firstThreadId, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/task/${firstThreadId}$`));
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  await page.locator("main").getByRole("button", { name: "View diagnostic information" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Diagnostic information" });
  await expect(diagnostics.getByText(errorMessage)).toHaveCount(1);
  await expect(diagnostics).toContainText(failure);
  await diagnostics.getByRole("button", { name: "Close diagnostics" }).click();
  await expect(diagnostics).toHaveCount(0);
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  await expect(page.getByText("Unable to start Codex GUI", { exact: true })).toHaveCount(0);
  expect(host.resumes(firstThreadId)).toHaveLength(2);
  await expect(page.locator('[data-menu-error-indicator="true"]')).toBeVisible();
  await openMenu(page);
  await expect(activeRow(page, firstThreadId)).not.toContainText(failure);
  await expect(
    activeRow(page, firstThreadId).getByRole("button", { name: "Retry", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  host.setResumeError(firstThreadId, null);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await ready(page);
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  await expect(page.locator('[data-menu-error-indicator="true"]')).toHaveCount(0);
  expect(host.resumes(firstThreadId)).toHaveLength(3);
  expect(host.sends(firstThreadId)).toHaveLength(0);
  expect(host.sends(secondThreadId)).toHaveLength(0);
});

test("recovering one of two tasks with identical errors preserves the other's details and dot", async ({
  page,
}) => {
  const host = await createMultiSessionHarness(page, false);
  await host.open();
  await continueSecondTask(page);
  const failure = "Task resume temporarily unavailable";
  const errorMessage =
    /^JSON-RPC error \(id=\d+, code=-32000\): Task resume temporarily unavailable$/;
  host.setResumeError(firstThreadId, failure);
  host.setResumeError(secondThreadId, failure);
  await page.reload();
  await expect.poll(() => host.resumes(firstThreadId).length).toBe(2);
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  await page.locator("main").getByRole("button", { name: "View diagnostic information" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Diagnostic information" });
  await expect(diagnostics.getByText(errorMessage)).toHaveCount(1);
  await expect(diagnostics).toContainText(failure);
  await diagnostics.getByRole("button", { name: "Close diagnostics" }).click();
  await expect(diagnostics).toHaveCount(0);
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  await openMenu(page);
  for (const id of [firstThreadId, secondThreadId]) {
    await expect(activeRow(page, id).locator('[data-task-error-indicator="true"]')).toBeVisible();
    await expect(activeRow(page, id)).not.toContainText(failure);
  }
  await page.keyboard.press("Escape");
  host.setResumeError(secondThreadId, null);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await ready(page);
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  await expect(page.locator('[data-menu-error-indicator="true"]')).toBeVisible();
  await openMenu(page);
  await expect(
    activeRow(page, firstThreadId).locator('[data-task-error-indicator="true"]'),
  ).toBeVisible();
  await expect(
    activeRow(page, secondThreadId).locator('[data-task-error-indicator="true"]'),
  ).toHaveCount(0);
  await activeRow(page, firstThreadId)
    .getByRole("button", { name: firstThreadId, exact: true })
    .click();
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  await page.locator("main").getByRole("button", { name: "View diagnostic information" }).click();
  await expect(diagnostics.getByText(errorMessage)).toHaveCount(1);
  await diagnostics.getByRole("button", { name: "Close diagnostics" }).click();
  await expect(diagnostics).toHaveCount(0);
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  expect(host.resumes(firstThreadId)).toHaveLength(2);
  host.setResumeError(firstThreadId, null);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await ready(page);
  await expect(page.locator('[data-menu-error-indicator="true"]')).toHaveCount(0);
  await expect(page.getByText(errorMessage)).toHaveCount(0);
  expect(host.resumes(firstThreadId)).toHaveLength(3);
  expect(host.resumes(secondThreadId)).toHaveLength(3);
});
