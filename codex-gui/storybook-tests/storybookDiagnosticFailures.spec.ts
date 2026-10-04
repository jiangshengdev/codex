import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

test("history repeated continue preserves the primary and cleanup diagnostics", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=history-continuation--initialization-and-cleanup-failed&viewMode=story",
  );
  const diagnostic = page.getByRole("button", { name: "View diagnostic information", exact: true });
  await diagnostic.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Candidate projection became unavailable before publication");
  await expect(dialog).toContainText("STORYBOOK_CONTINUE_CLEANUP_FAILED");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Continue this task", exact: true }).click();
  await diagnostic.click();
  await expect(dialog).toContainText("Candidate projection became unavailable before publication");
  await expect(dialog).toContainText("STORYBOOK_CONTINUE_CLEANUP_FAILED");
});

test("repeated continue story opens the complete diagnostic", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=history-continuation--repeated-continue-loses-diagnostics&viewMode=story",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "Candidate projection became unavailable before publication",
  );
  await expect(page.getByRole("dialog")).toContainText("STORYBOOK_CONTINUE_CLEANUP_FAILED");
});

for (const key of ["c", "x"]) {
  for (const failure of ["false", "reject"] as const) {
    test(`composer node selection ${key === "c" ? "copy" : "cut"} ${failure} shows failure feedback and preserves content`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(
        "/iframe.html?id=composer-input-and-send-input--clipboard-failure&viewMode=story",
      );
      const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
      const skill = editor.getByRole("group", { name: /preview-review/ });
      await expect(skill).toHaveAttribute("data-selected");
      await expect(editor).toBeFocused();
      await page.evaluate((mode) => {
        // Inject at the browser API used by Lexical; each test owns a fresh page.
        const failures = {
          false: () => false,
          reject: () => {
            throw new Error("Clipboard unavailable");
          },
        };
        Object.defineProperty(document, "execCommand", {
          configurable: true,
          value: failures[mode],
        });
      }, failure);
      await page.keyboard.press(`ControlOrMeta+${key}`);
      await expect(page.getByRole("alert")).toContainText(
        key === "c"
          ? "Copy failed. Please try again."
          : "Cut failed. Your content has been preserved.",
      );
      await expect(editor).toContainText("$preview-review");
      await expect(editor).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
}
