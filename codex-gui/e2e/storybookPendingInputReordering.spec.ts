import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("moves queued messages immediately with all four actions and preserves boundaries", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-reordering--interactive",
  );
  const trigger = page
    .getByRole("group", { name: "Pending: Queued 3", exact: true })
    .getByRole("button", { name: "Queued 3", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const rows = dialog.getByRole("listitem");
  await expect(
    dialog.getByRole("button", {
      name: "Move up pending message: Ordinary message 1",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Ordinary message 1",
      exact: true,
    })
    .click();
  await expect(page.getByRole("menuitem", { name: "Move to first", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: "More move options for pending message: Ordinary message 1",
      exact: true,
    }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: "Move up pending message: Ordinary message 2", exact: true })
    .click();
  await expect(rows.nth(0)).toContainText("Ordinary message 2");
  await expect(
    dialog.getByRole("group", { name: "Ordinary message 2", exact: true }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: "Move down pending message: Ordinary message 2", exact: true })
    .click();
  await expect(rows.nth(0)).toContainText("Ordinary message 1");
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Ordinary message 3",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Move to first", exact: true }).click();
  await expect(rows.nth(0)).toContainText("Ordinary message 3");
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Ordinary message 3",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Move to last", exact: true }).click();
  await expect(rows.nth(2)).toContainText("Ordinary message 3");
  await expect(rows).toHaveCount(3);
  await expect(
    dialog.getByRole("button", {
      name: "Move down pending message: Ordinary message 3",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Ordinary message 3",
      exact: true,
    })
    .click();
  await expect(page.getByRole("menuitem", { name: "Move to last", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", {
      name: "More move options for pending message: Ordinary message 3",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("preserves lane membership and loaded pages when moving across a page boundary, then resets", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-reordering--paged-lanes",
  );
  const trigger = page
    .getByRole("group", { name: "Pending: Guide 3, Queued 23", exact: true })
    .getByRole("button", { name: "Guide 3", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const queued = dialog.getByRole("group", { name: /^Ordinary message / });
  await expect(queued).toHaveCount(20);
  await dialog.getByRole("button", { name: "Show more queued messages", exact: true }).click();
  await expect(queued).toHaveCount(23);
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Ordinary message 23",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Move to first", exact: true }).click();
  await expect(queued.first()).toHaveAccessibleName("Ordinary message 23");
  await expect(queued).toHaveCount(23);
  await expect(dialog.getByRole("group", { name: /^Guide message / })).toHaveCount(3);
  await expect(
    dialog
      .getByRole("group", { name: "Guide message 1", exact: true })
      .getByRole("button", { name: /^Move / }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Move up pending message: Guide message 3", exact: true })
    .click();
  await expect(dialog.getByRole("group", { name: /^Guide message / }).nth(1)).toHaveAccessibleName(
    "Guide message 3",
  );
  await expect(queued.first()).toHaveAccessibleName("Ordinary message 23");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await trigger.click();
  await expect(queued.first()).toHaveAccessibleName("Ordinary message 1");
  await expect(queued).toHaveCount(20);
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-reordering--read-only",
  );
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: /^Ordinary message / })).toHaveCount(3);
  await expect(dialog.getByRole("button", { name: /^Move |^More move options/ })).toHaveCount(0);
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-reordering--interactive",
  );
  await page
    .getByRole("group", { name: "Pending: Queued 3", exact: true })
    .getByRole("button", { name: "Queued 3", exact: true })
    .click();
  await expect(queued.first()).toHaveAccessibleName("Ordinary message 1");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});

test("distinguishes a rejected move from a completed move whose refreshed list could not load", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-reordering--not-applied",
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Pending message was not reordered");
  await expect(dialog.getByText(/^Injected feedback:/)).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(
    "The pending-message order did not change. Refresh complete; try again.",
  );
  await expect(dialog.getByRole("heading", { name: "Pending details", exact: true })).toBeFocused();
  await expect(dialog.getByRole("listitem").first()).toContainText("Ordinary message 1");
  await dialog
    .getByRole("button", { name: "Move up pending message: Ordinary message 2", exact: true })
    .click();
  await expect(dialog.getByRole("listitem").first()).toContainText("Ordinary message 2");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-reordering--refresh-failed",
  );
  await expect(dialog.getByRole("alert")).toContainText(
    "Updated pending order could not be loaded",
  );
  await expect(dialog.getByText(/^Injected feedback:/)).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText(
    "The message was moved, but repeated queue changes prevented the updated order from loading.",
  );
  await expect(dialog.getByRole("heading", { name: "Pending details", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await page
    .getByRole("group", { name: "Pending: Queued 3", exact: true })
    .getByRole("button", { name: "Queued 3", exact: true })
    .click();
  await expect(dialog.getByRole("listitem").first()).toContainText("Ordinary message 2");
  await expect(dialog.getByRole("listitem")).toHaveCount(3);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Restart simulation", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Updated pending order could not be loaded",
  );
});
