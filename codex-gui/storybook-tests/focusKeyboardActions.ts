import { expect, type Locator, type Page } from "@playwright/test";
import { isProductElement, waitForStableFocusSnapshot } from "./focusObservation";

/** Reach a product control through the browser's real sequential focus navigation. */
export async function focusProductControl(page: Page, target: Locator): Promise<void> {
  await expect(target).toHaveCount(1);
  await expect(target).toBeVisible();
  expect(await target.evaluate(isProductElement)).toBe(true);
  const limit = await page.locator("*").count();
  const sequence: unknown[] = [];
  const targetPrecedesFocus = await target.evaluate((element) => {
    const active = document.activeElement;
    return (
      active != null &&
      (active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
    );
  });
  // This chooses a search direction only; every stop still requires a real key.
  const directions = targetPrecedesFocus ? ["Shift+Tab", "Tab"] : ["Tab", "Shift+Tab"];
  for (const key of directions) {
    const seen = await page.evaluateHandle(() => new WeakSet<Element>());
    try {
      for (let step = 0; step <= limit; step += 1) {
        await page.keyboard.press(key);
        await waitForStableFocusSnapshot(page);
        const stop = await target.evaluate((element, visited) => {
          const active = document.activeElement;
          const documentFocused = document.hasFocus();
          const eligible = documentFocused && active != null && active !== document.body;
          const repeated = eligible && visited.has(active);
          if (eligible) visited.add(active);
          return {
            reached: documentFocused && active === element,
            repeated,
            documentFocused,
            tag: active?.tagName,
            role: active?.getAttribute("role"),
            name: active?.getAttribute("aria-label"),
            text: active?.textContent.slice(0, 100),
          };
        }, seen);
        sequence.push({ key, ...stop });
        if (stop.reached) return;
        if (stop.repeated) break;
      }
    } finally {
      await seen.dispose();
    }
  }
  throw new Error(
    `Product control was not reached through forward and backward Tab traversal: ${JSON.stringify(sequence)}`,
  );
}

export async function activateProductControl(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeEnabled();
  await focusProductControl(page, target);
  await page.keyboard.press("Enter");
}
