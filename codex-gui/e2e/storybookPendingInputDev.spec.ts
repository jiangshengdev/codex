import assert from "node:assert/strict";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

for (const scenario of [
  { story: "browsing--queued", control: "Simulate current turn completed" },
  { story: "recovery--guiding", control: "Simulate guide success" },
  { story: "recovery--recovering", control: "Release recovery display" },
]) {
  test(`${scenario.story} groups its simulation controls separately from product UI`, async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:6006/iframe.html?id=composer-pending-input-${scenario.story}`,
    );
    const boundary = page.getByRole("group", { name: "DEV", exact: true }).filter({
      has: page.getByRole("button", { name: scenario.control, exact: true }),
    });
    await expect(boundary).toHaveCount(1);
    await expect(boundary.getByText("DEV", { exact: true })).toHaveCount(1);
    await expect(
      boundary.getByRole("region", { name: "Pending messages", exact: true }),
    ).toHaveCount(0);
    await expect(boundary).toHaveCSS("border-top-left-radius", "0px");
  });
}

test("reordering labels injected feedback and does not create an empty drawer boundary", async ({
  page,
}) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-reordering--not-applied",
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("group", { name: "DEV", exact: true })).toContainText(
    "Injected feedback:",
  );
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-reordering--paged-lanes",
  );
  await page.getByRole("button", { name: "Queued 23", exact: true }).click();
  await expect(dialog.getByRole("group", { name: "DEV", exact: true })).toHaveCount(0);
});

test("editing simulation has its own DEV boundary inside the product drawer", async ({ page }) => {
  await page.goto(
    "http://localhost:6006/iframe.html?id=composer-pending-input-editing--interactive",
  );
  const draft = page.getByRole("group", { name: "DEV", exact: true }).filter({
    has: page.getByRole("textbox", { name: "Main draft", exact: true }),
  });
  await expect(draft).toBeVisible();
  await expect(draft.getByText("Local simulation.", { exact: false })).toBeVisible();
  await expect(draft.getByRole("button", { name: "Queued 1", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Queued 1", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const simulation = dialog.getByRole("group", { name: "DEV", exact: true });
  await expect(simulation).toHaveCount(1);
  await expect(simulation.getByText("DEV", { exact: true })).toHaveCount(1);
  await expect(simulation.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  await simulation
    .getByRole("button", { name: "Simulate editing session lost", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Unsaved pending message", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await simulation.scrollIntoViewIfNeeded();
  const frame = await simulation.boundingBox();
  const badge = await simulation.getByText("DEV", { exact: true }).boundingBox();
  assert(frame && badge, "Simulation boundary and badge must remain visible");
  expect(badge.y).toBeLessThan(frame.y);
  expect(badge.y + badge.height).toBeGreaterThan(frame.y);
  expect(badge.x + badge.width).toBeLessThanOrEqual(frame.x + frame.width);
  expect(frame.x + frame.width).toBeLessThanOrEqual(375);
  await expect(simulation).toHaveCSS("border-top-left-radius", "0px");
});
