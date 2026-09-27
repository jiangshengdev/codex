import { expect, type Page, type TestInfo } from "@playwright/test";
import { activateProductControl } from "./focusKeyboardActions";
import { observeCurrentFocus, observeKeyboardFocus } from "./focusObservation";

/** Observe the existing failed-preset retry's resulting product focus surface. */
export async function observeNewSessionRetry(page: Page, testInfo: TestInfo, storyId: string) {
  if (
    !/^new-session-(flow|mixed-recovery)--(creation-failed|creation-unknown|activation-failed)$/.test(
      storyId,
    )
  )
    return;
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to start the conversation" }),
  ).toBeVisible();
  const send = page.getByRole("button", { name: "Send", exact: true });
  await activateProductControl(page, send);
  // The existing fixture routes to CurrentTaskPage after the retry; assert the
  // product title and editor rather than its DEV counters or simulated calls.
  await expect(page.getByText("Fictional new session", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to start the conversation" }),
  ).toHaveCount(0);
  await observeCurrentFocus(page, testInfo, `${storyId}-retry-restored`);
  await observeKeyboardFocus(page, testInfo, `${storyId}-retry-current-task`);
}
