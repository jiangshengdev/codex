import { storybookOrigin } from "./servers";
import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("preserves edits and order across priority delivery and ordinary recovery", async ({
  page,
}) => {
  await page.goto(`${storybookOrigin}/iframe.html?id=composer-pending-input-recovery--combined`);
  const openQueue = page
    .getByRole("group", { name: /^Pending:/ })
    .getByRole("button", { name: "Queued 3", exact: true });
  await openQueue.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("group", { name: "Ordinary message 3", exact: true })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Edit pending message", exact: true })
    .fill("Revised third message");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await dialog
    .getByRole("button", {
      name: "More move options for pending message: Revised third message",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Move to first", exact: true }).click();
  await expect(
    dialog.getByRole("region", { name: "Queued 3", exact: true }).getByRole("listitem").first(),
  ).toContainText("Revised third message");
  await page.keyboard.press("Escape");
  await expect(openQueue).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Main draft", exact: true })).toHaveValue(
    "Separate main draft",
  );
  const complete = page.getByRole("button", {
    name: "Simulate current turn completed",
    exact: true,
  });
  const response = page.getByRole("button", { name: "Simulate send response", exact: true });
  const confirm = page.getByRole("button", { name: "Simulate runtime confirmation", exact: true });
  await expect(page.getByRole("button", { name: "Priority 2", exact: true })).toBeVisible();
  await complete.click();
  await expect(page.getByRole("button", { name: /^Priority / })).toHaveCount(0);
  await response.click();
  await confirm.click();
  await expect(page.getByRole("button", { name: /^Priority / })).toHaveCount(0);
  await complete.click();
  await page.getByRole("button", { name: "Simulate send failure", exact: true }).click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toBeVisible();
  await page
    .getByRole("group", { name: "Pending: Queued 1", exact: true })
    .getByRole("button", { name: "Queued 1", exact: true })
    .click();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await expect(dialog.getByRole("listitem").first()).toContainText("Ordinary message 2");
  await expect(dialog).not.toContainText("Revised third message");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Continue sending", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resuming sending", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Release recovery display", exact: true }).click();
  await response.click();
  await confirm.click();
  await expect(page.getByText("1 message has not been sent", { exact: true })).toHaveCount(0);
  await page
    .getByRole("group", { name: "Pending: Queued 2", exact: true })
    .getByRole("button", { name: "Queued 2", exact: true })
    .click();
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByRole("listitem").first()).toContainText("Ordinary message 2");
  await expect(dialog.getByRole("listitem").nth(1)).toContainText("Revised third message");
  await expect(dialog).not.toContainText("Ordinary message 1");
});

test.describe("Chinese narrow preview", () => {
  test.use({ locale: "zh-CN", viewport: { width: 390, height: 700 } });

  test("reads and scrolls long content in dark mode with keyboard focus restored", async ({
    page,
  }) => {
    await page.goto(
      `${storybookOrigin}/iframe.html?id=composer-pending-input-browsing--both-lanes`,
    );
    await page.getByRole("radio", { name: "深色主题", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const trigger = page
      .getByRole("group", { name: "待处理：引导 23，排队 23", exact: true })
      .getByRole("button", { name: "引导 23", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "待处理详情", exact: true })).toBeVisible();
    // The requested group receives initial focus; the close control precedes it in tab order.
    await expect(dialog.getByRole("button", { name: "引导中 23", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "引导中 23", exact: true })).toBeFocused();
    const viewFull = dialog
      .getByRole("group", { name: /^Ordinary message 1 / })
      .getByRole("button", { name: "查看全文", exact: true });
    await viewFull.focus();
    await page.keyboard.press("Enter");
    const detail = page.getByRole("dialog", { name: "待处理详情", exact: true }).last();
    const ending = detail.getByText(/END OF LONG MESSAGE/);
    await expect(ending).toBeVisible();
    await ending.scrollIntoViewIfNeeded();
    await expect(ending).toBeInViewport();
    expect(
      await detail.evaluate((element) => {
        return [element, ...element.querySelectorAll("*")].some((child) => child.scrollTop > 0);
      }),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const bounds = await detail.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(390);
    await detail.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByText(/END OF LONG MESSAGE/)).toBeHidden();
    await expect(viewFull).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
});
