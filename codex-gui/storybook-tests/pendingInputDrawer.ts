import { expect, type Locator, type Page } from "@playwright/test";

export async function closePendingInputDrawer(page: Page, trigger: Locator): Promise<void> {
  await page.keyboard.press("Escape");
  // Closing includes the exit animation and restoration to the surviving trigger.
  // Firefox fill can lose its input if that restoration occurs while it is filling.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
}
