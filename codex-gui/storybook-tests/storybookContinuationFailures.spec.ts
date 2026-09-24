import { expect, test } from "@playwright/test";

test.use({ locale: "en" });

const failureCases = [
  {
    story: "unresolved",
    title: "Unable to switch tasks yet",
    description:
      "The current task still has queued or unresolved messages. Return to it before switching.",
    canReturn: true,
  },
  {
    story: "switch-in-progress",
    title: "Unable to switch tasks yet",
    description: "Another task switch is already in progress. Try again shortly.",
    canReturn: false,
  },
  {
    story: "current-changed",
    title: "Unable to continue this task",
    description: "The task could not be activated.",
    canReturn: true,
  },
  {
    story: "current-changed-empty",
    title: "Unable to continue this task",
    description: "The task could not be activated.",
    canReturn: false,
  },
  {
    story: "disconnected-before-commit",
    title: "Unable to continue this task",
    description:
      "The connection was interrupted before the task switch completed. Reconnect and try again.",
    canReturn: false,
  },
  {
    story: "disconnected-after-commit",
    title: "Task switched, but cannot be opened",
    description:
      "The task switch was committed, but the connection was interrupted. Reconnect and confirm the current task.",
    canReturn: false,
  },
  {
    story: "preparation-failed",
    title: "Unable to continue this task",
    description: "The task connection could not be prepared.",
    canReturn: false,
  },
  {
    story: "resume-failed",
    title: "Unable to continue this task",
    description: "The task could not be resumed.",
    canReturn: false,
  },
  {
    story: "activation-failed",
    title: "Unable to continue this task",
    description: "The task could not be activated.",
    canReturn: false,
  },
  {
    story: "empty-result",
    title: "Unable to continue this task",
    description: "The task could not be activated.",
    canReturn: false,
  },
  {
    story: "unexpected-failure",
    title: "Unable to continue this task",
    description: "An unexpected error occurred while continuing the task.",
    canReturn: false,
  },
] as const;

for (const { story, title, description, canReturn } of failureCases) {
  const returnCount = canReturn ? 1 : 0;
  const actionName = canReturn ? "Return to current task" : "Continue this task";
  const recoveredText = canReturn ? "Current task context" : "Recovered authoritative task";

  test(`continuation ${story} preserves history and offers the appropriate recovery`, async ({
    page,
  }) => {
    await page.goto(`/iframe.html?id=history-continuation--${story}&viewMode=story`);
    const error = page.getByRole("alert");
    await expect(error).toContainText(title);
    await expect(error).toContainText(description);
    await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toHaveCount(0);
    const returnToCurrent = page.getByRole("button", {
      name: "Return to current task",
      exact: true,
    });
    await expect(returnToCurrent).toHaveCount(returnCount);
    const action = page.getByRole("button", { name: actionName, exact: true });
    await expect(action).toBeEnabled();
    await action.press("Enter");
    await expect(page.getByText(recoveredText, { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
    await expect(page.getByText(description, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Read-only history evidence", { exact: true })).toHaveCount(0);
  });
}

test("continuation failure diagnostics restore keyboard focus and fit a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/iframe.html?id=history-continuation--preparation-failed&viewMode=story");
  const error = page.getByRole("alert");
  await expect(error).toContainText("The task connection could not be prepared.");
  await expect
    .poll(() =>
      error.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          element.scrollWidth <= element.clientWidth
        );
      }),
    )
    .toBe(true);
  const diagnostic = error.getByRole("button", {
    name: "View diagnostic information",
    exact: true,
  });
  await diagnostic.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("STORYBOOK_CONTINUE_FAILED");
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(diagnostic).toBeFocused();
  await page.getByRole("button", { name: "Continue this task", exact: true }).press("Enter");
  await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
