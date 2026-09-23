import assert from "node:assert/strict";
import type { Locator, Page } from "@playwright/test";

export async function clickCenterWithPointer(page: Page, target: Locator): Promise<void> {
  const bounds = await target.boundingBox();
  assert(bounds);
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}
