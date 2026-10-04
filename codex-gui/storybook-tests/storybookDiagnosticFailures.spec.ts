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
  test(`composer node selection ${key === "c" ? "copy" : "cut"} failure escapes without product feedback`, async ({
    page,
    browserName,
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
    await page.keyboard.press(`ControlOrMeta+${key}`);
    // WebKit includes the Error name in the message of an unhandled rejection.
    await expect
      .poll(() => errors)
      .toEqual([
        `${browserName === "webkit" ? "Error: " : ""}Unable to copy the composer selection`,
      ]);
    await expect(editor).toContainText("$preview-review");
    await expect(page.getByRole("alert")).toHaveCount(0);
    // No assertions on the Story-only diagnostic observer or simulation controls.
  });
}
