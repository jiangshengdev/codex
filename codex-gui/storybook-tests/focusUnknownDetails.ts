import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { activateProductControl, focusProductControl } from "./focusKeyboardActions";
import { observeCurrentFocus, observeKeyboardFocus } from "./focusObservation";

export const unknownDetailStoryIds = [
  "composer-input-and-send-send--send-unknown-multiple",
  "composer-input-and-send-send--send-unknown-long-text",
  "composer-input-and-send-send--send-unknown-multiple-long-text",
  "composer-input-and-send-send--send-unknown-long-list",
] as const;

type UnknownDetailObservation = {
  state: string;
  trigger: string;
  observations: number;
  status:
    | "observed-awaiting-visual-and-state-review"
    | "no-product-focus-observed"
    | "not-applicable";
  reason?: string;
};

/** Caller loads one allowlisted story's initial state, with no pending drawer open. */
export async function observeUnknownDetails(page: Page, testInfo: TestInfo, storyId: string) {
  if (!unknownDetailStoryIds.some((id) => id === storyId)) {
    throw new Error(`Unknown-message detail supplement does not allow story ${storyId}`);
  }
  const results: UnknownDetailObservation[] = [];
  try {
    const status = page.getByRole("status").filter({
      has: page.getByText("Sending result unknown", { exact: true }),
    });
    await expect(status).toHaveCount(1);
    await expect(status).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Pending details", exact: true })).toHaveCount(0);

    await page.evaluate(() => document.fonts.ready);
    const items = status.getByRole("listitem");
    await expect(items.first()).toBeVisible();
    const applicable: number[] = [];
    for (let index = 0; index < (await items.count()); index += 1) {
      const item = items.nth(index);
      const preview = item.locator("p.line-clamp-3");
      await expect(preview).toHaveCount(1);
      await expect(preview).toBeVisible();
      const trigger = item.getByRole("button", { name: "View full message", exact: true });
      await expect
        .poll(
          async () => {
            const truncated = await preview.evaluate(
              (element) => element.scrollHeight > element.clientHeight,
            );
            return (await trigger.count()) === (truncated ? 1 : 0);
          },
          { message: "Full-message entry must reflect this preview's actual overflow" },
        )
        .toBe(true);
      if (await preview.evaluate((element) => element.scrollHeight > element.clientHeight)) {
        await expect(trigger).toHaveCount(1);
        applicable.push(index);
      } else {
        results.push({
          state: `unknown-detail-${String(index)}-not-applicable`,
          trigger: "Sending result unknown → View full message",
          observations: 0,
          status: "not-applicable",
          reason: "The existing text preview has no vertical overflow in this layout",
        });
      }
    }

    const record = async (state: string, trigger: string, currentOnly: boolean) => {
      const artifact = `${storyId}-unknown-detail-${state}`;
      const observations = currentOnly
        ? await observeCurrentFocus(page, testInfo, artifact)
        : await observeKeyboardFocus(page, testInfo, artifact);
      results.push({
        state,
        trigger,
        observations: observations.length,
        status:
          observations.length > 0
            ? "observed-awaiting-visual-and-state-review"
            : "no-product-focus-observed",
      });
    };

    // Buttons in the status's scrollable list are reached using real Tab navigation.
    // No record is removed and no pending-message action is used to reach this surface.
    for (const index of applicable) {
      const trigger = items
        .nth(index)
        .getByRole("button", { name: "View full message", exact: true });
      await expect(trigger).toBeVisible();
      await focusProductControl(page, trigger);
      await record(`${String(index)}-trigger`, "View full message", true);
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Sending result unknown", exact: true });
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toBeVisible();
      await record(`${String(index)}-opened`, "Sending result unknown → View full message", false);
      await activateProductControl(
        page,
        dialog.getByRole("button", { name: "Close", exact: true }),
      );
      await expect(dialog).toBeHidden();
      await expect(trigger).toBeFocused();
      expect(
        await trigger.evaluate(
          (element) => document.hasFocus() && document.activeElement === element,
        ),
      ).toBe(true);
      await record(`${String(index)}-restored`, "Sending result unknown → Close", true);
      await expect(trigger).toHaveCount(1);
    }
    return results;
  } finally {
    const artifact = testInfo.outputPath(`${storyId}-unknown-details.json`);
    await writeFile(artifact, JSON.stringify(results, null, 2));
    await testInfo.attach(`${storyId}-unknown-details`, {
      path: artifact,
      contentType: "application/json",
    });
  }
}
