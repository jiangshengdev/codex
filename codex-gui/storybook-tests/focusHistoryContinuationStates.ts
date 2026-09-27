import { expect, type Page, type TestInfo } from "@playwright/test";
import { activateProductControl } from "./focusKeyboardActions";
import { recordFocusStates } from "./focusStateRecorder";

export const historyReturnStoryIds = [
  "history-continuation--unresolved",
  "history-continuation--current-changed",
] as const;

/**
 * H03 starts at the existing settled failure; reset restores the same story,
 * awaits its play/readiness, and reapplies the selected container width.
 * H06 starts AFTER the existing recovery collector successfully loads history.
 * Composer popovers remain exclusively owned by the caller's supplements phase.
 */
export async function observeHistoryContinuationStates(
  page: Page,
  testInfo: TestInfo,
  storyId: string,
  resetStory: () => Promise<void>,
) {
  const isReturnStory = historyReturnStoryIds.some((id) => id === storyId);
  if (!isReturnStory && storyId !== "history-detail--read-error") return [];
  return recordFocusStates(
    page,
    testInfo,
    {
      artifactName: `${storyId}-continuation-states`,
      initialPhase: "continuation-prerequisite",
      failureTrigger: "History continuation branch",
      observedStatus: "observed-awaiting-visual-review",
    },
    async (recorder) => {
      const record = (state: string, trigger: string, traverse = false) => {
        const prefix = `${storyId}-continuation-${state}`;
        return recorder.record(
          state,
          trigger,
          traverse ? { traversal: prefix } : { current: prefix },
        );
      };
      const continueAction = page.getByRole("button", { name: "Continue this task", exact: true });
      const returnAction = page.getByRole("button", {
        name: "Return to current task",
        exact: true,
      });
      const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
      const assertFailure = async () => {
        await expect(page.getByRole("complementary").getByRole("alert")).toBeVisible();
        await expect(returnAction).toBeEnabled();
        await expect(continueAction).toBeEnabled();
        await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
      };
      const reachedTask = async (branch: "return" | "retry" | "read-continue") => {
        const returned = branch === "return";
        await expect(editor).toBeVisible();
        await expect(continueAction).toHaveCount(0);
        await expect(returnAction).toHaveCount(0);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: returned ? "Current investigation" : "Continued investigation",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.getByText(returned ? "Current task context" : "Recovered authoritative task", {
            exact: true,
          }),
        ).toBeVisible();
        // Save natural landing before any new Tab; a zero landing is evidence, not a pass.
        await record(
          `${branch}-landing`,
          returned ? "Return to current task" : "Continue this task",
        );
        await record(`${branch}-surface`, "Subsequent real Tab / Shift+Tab traversal", true);
      };
      if (isReturnStory) {
        await assertFailure();
        recorder.phase("return-result");
        await activateProductControl(page, returnAction);
        await reachedTask("return");
        recorder.phase("reset-for-retry");
        await resetStory();
        await assertFailure();
        recorder.phase("retry-result");
        await activateProductControl(page, continueAction);
        await reachedTask("retry");
      } else {
        await expect(
          page.getByRole("button", { name: "Load task history", exact: true }),
        ).toHaveCount(0);
        await expect(continueAction).toBeEnabled();
        await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
        recorder.phase("read-continue-result");
        await activateProductControl(page, continueAction);
        await reachedTask("read-continue");
      }
    },
  );
}
