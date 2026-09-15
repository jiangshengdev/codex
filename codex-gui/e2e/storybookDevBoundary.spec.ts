import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("environment simulation shares a DEV boundary without changing its controls", async ({
  page,
}) => {
  await page.goto("http://localhost:6006/iframe.html?id=environment-stateful--empty");
  const simulation = page.getByRole("group", { name: "DEV", exact: true }).filter({
    has: page.getByRole("button", { name: "Create read-model slot", exact: true }),
  });
  await expect(simulation).toBeVisible();
  await expect(simulation.getByText("DEV", { exact: true })).toHaveCount(1);
  await expect(simulation).toHaveCSS("border-top-left-radius", "0px");
  await expect(simulation).toHaveCSS("border-top-style", "solid");
  await simulation.getByRole("button", { name: "Create read-model slot", exact: true }).click();
  await expect(simulation.getByRole("status")).toContainText("Redux slots: 1");
});

test("DEV badges stay on their borders in both themes and on narrow screens", async ({ page }) => {
  await page.goto("http://localhost:6006/iframe.html?id=environment-stateful--empty");
  for (const theme of ["Light theme", "Dark theme"]) {
    await page.getByRole("radio", { name: theme, exact: true }).click();
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: 800 });
      const regions = page.getByRole("group", { name: "DEV", exact: true });
      await expect(regions).toHaveCount(2);
      for (const region of await regions.all()) {
        const badge = region.getByText("DEV", { exact: true });
        await expect(badge).toBeVisible();
        const frame = await region.boundingBox();
        const label = await badge.boundingBox();
        expect(frame).not.toBeNull();
        expect(label).not.toBeNull();
        expect(label!.x).toBeGreaterThan(frame!.x);
        expect(label!.x + label!.width).toBeLessThan(frame!.x + frame!.width);
        expect(label!.y).toBeLessThan(frame!.y);
        expect(label!.y + label!.height).toBeGreaterThan(frame!.y);
        expect(frame!.x + frame!.width).toBeLessThanOrEqual(width);
        await expect(region).toHaveCSS("border-top-left-radius", "0px");
      }
    }
  }
});
