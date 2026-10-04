import { expect, test } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";

test.use({ locale: "en" });

test("QR entry opens the example current-task URL and closes with Escape", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 720 });
  await page.goto("/iframe.html?id=app-shell-qr-access--current-task&viewMode=story");
  const trigger = page.getByRole("button", { name: "Scan with phone", exact: true });
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Scan with phone" });
  await expect(dialog).toContainText(
    "https://gui.example.test/task/00000000-0000-0000-0000-000000000301#token=storybook-fictional-token",
  );
  await expect(dialog.locator('svg[aria-label="QR code for current GUI URL"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("supported routes encode the same URL displayed by the popover", async ({ page }) => {
  for (const [story, expected] of [
    [
      "current-task",
      "https://gui.example.test/task/00000000-0000-0000-0000-000000000301#token=storybook-fictional-token",
    ],
    [
      "history-detail",
      "https://gui.example.test/history/00000000-0000-0000-0000-000000000302#token=storybook-fictional-token",
    ],
  ] as const) {
    await page.goto(`/iframe.html?id=app-shell-qr-access--${story}&viewMode=story`);
    await page.getByRole("button", { name: "Scan with phone", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Scan with phone" });
    await expect(dialog.getByText(expected, { exact: true })).toBeVisible();
    const expectedSvg = renderToStaticMarkup(
      createElement(QRCodeSVG, { value: expected, marginSize: 4 }),
    );
    const expectedPaths = await page.evaluate((markup) => {
      const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
      return [...doc.querySelectorAll("path")].map((path) => path.getAttribute("d"));
    }, expectedSvg);
    await expect
      .poll(() =>
        dialog
          .locator("svg path")
          .evaluateAll((paths) => paths.map((path) => path.getAttribute("d"))),
      )
      .toEqual(expectedPaths);
  }
});

test("missing credentials and unsupported routes keep the real trigger disabled", async ({
  page,
}) => {
  for (const story of ["missing-credentials", "history-list", "new-session"]) {
    await page.goto(`/iframe.html?id=app-shell-qr-access--${story}&viewMode=story`);
    await expect(page.getByRole("button", { name: "Scan with phone", exact: true })).toBeDisabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});

for (const viewport of [
  { width: 480, height: 720 },
  { width: 375, height: 812 },
]) {
  test.describe(`QR edges at ${String(viewport.width)}px`, () => {
    test.use({ viewport, hasTouch: true });

    test("long URLs remain within the viewport at both edges", async ({ page }) => {
      for (const story of ["long-url-right-edge", "long-url-left-edge"]) {
        await page.goto(`/iframe.html?id=app-shell-qr-access--${story}&viewMode=story`);
        const trigger = page.getByRole("button", { name: "Scan with phone", exact: true });
        await trigger.tap();
        const dialog = page.getByRole("dialog", { name: "Scan with phone" });
        await expect(dialog).toBeVisible();
        await expect
          .poll(() =>
            dialog.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return (
                rect.left >= 0 &&
                rect.right <= innerWidth &&
                rect.top >= 0 &&
                rect.bottom <= innerHeight &&
                element.scrollWidth <= element.clientWidth
              );
            }),
          )
          .toBe(true);
        await page.keyboard.press("Escape");
        await trigger.tap();
        await expect(dialog).toBeVisible();
      }
    });
  });
}
