import { expect, type Page, type TestInfo } from "@playwright/test";
import { activateProductControl } from "./focusKeyboardActions";
import { recordFocusStates } from "./focusStateRecorder";
import { observeComposerPopovers } from "./focusComposerPopovers";

export const historyForkStateStoryIds = [
  "history-fork--creation-failure",
  "history-fork--result-unknown",
  "history-fork--created-unopened",
  "history-fork--open-failed",
  "history-fork--navigation-failed",
  "history-fork--completed",
  "history-fork--page-coexistence",
] as const;

/** Independent missing notice transitions, before the existing Open fork recovery route. */
export async function observeHistoryForkStates(
  page: Page,
  testInfo: TestInfo,
  storyId: string,
  resetStory: () => Promise<void>,
) {
  if (!historyForkStateStoryIds.some((id) => id === storyId)) return [];
  return recordFocusStates(
    page,
    testInfo,
    {
      artifactName: `${storyId}-history-fork-states`,
      initialPhase: "fork-preset",
      failureTrigger: "existing History fork fixture",
      observedStatus: "observed-awaiting-visual-and-state-review",
    },
    async (recorder) => {
      const capture = (state: string, trigger: string, traverse: boolean) => {
        const prefix = `${storyId}-recovery-${state}`;
        return recorder.record(
          state,
          trigger,
          traverse ? { traversal: prefix } : { current: prefix },
        );
      };
      const surface = async (state: string, trigger: string) => {
        await capture(`${state}-current`, trigger, false);
        await capture(`${state}-traversal`, `${trigger} → Tab / Shift+Tab`, true);
      };
      const failure = page.getByRole("alert").filter({ hasText: "Unable to create fork" });
      const savedForks = page.getByRole("alert").filter({ hasText: "Fork created" });
      const forkButton = page.getByRole("button", { name: "Fork from here", exact: true });
      const historyRoot = page.locator("[data-history-forks]");
      const expectedSaved =
        storyId === "history-fork--page-coexistence"
          ? 2
          : [
                "history-fork--created-unopened",
                "history-fork--open-failed",
                "history-fork--navigation-failed",
              ].includes(storyId)
            ? 1
            : 0;
      const expectSavedPreserved = async () => {
        await expect(savedForks).toHaveCount(expectedSaved);
        await expect(page.getByRole("button", { name: "Open fork", exact: true })).toHaveCount(
          expectedSaved,
        );
      };
      const dismiss = async (state: string) => {
        recorder.phase(state);
        await expect(failure).toHaveCount(1);
        await activateProductControl(
          page,
          failure.getByRole("button", { name: "Dismiss", exact: true }),
        );
        await expect(failure).toHaveCount(0);
        await expectSavedPreserved();
        await surface(state, "Dismiss → Enter; saved-fork notices retained");
      };

      if (
        [
          "history-fork--creation-failure",
          "history-fork--result-unknown",
          "history-fork--page-coexistence",
        ].includes(storyId)
      ) {
        recorder.phase("reset-before-preset-dismiss");
        await resetStory();
        await expectSavedPreserved();
        await dismiss("fork-preset-dismissed");
      }

      // Use a fresh preset for the new request: never inherit H04's dismissal or
      // consume an Open fork recovery as preparation for a different transition.
      recorder.phase("reset-before-local-fork");
      await resetStory();
      await expectSavedPreserved();
      await expect(historyRoot).toHaveAttribute("data-history-forks", "0");
      await expect(forkButton).toHaveCount(1);
      await expect(forkButton).toBeEnabled();
      recorder.phase("fork-local-rejection");
      await activateProductControl(page, forkButton);
      await expect(historyRoot).toHaveAttribute("data-history-forks", "1");
      await expect(forkButton).toBeEnabled();
      await expect(failure).toHaveCount(1);
      await expect(failure).toContainText("The result is unknown.");
      await expectSavedPreserved();
      await surface("fork-local-rejected", "Fork from here → local fixture rejection");

      recorder.phase("fork-local-diagnostic");
      const diagnosticTrigger = failure.getByRole("button", {
        name: "View diagnostic information",
        exact: true,
      });
      await activateProductControl(page, diagnosticTrigger);
      const dialog = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
      await expect(dialog).toBeVisible();
      // Distinguishes the new rejection from a preset deliveryUnknown notice.
      await expect(dialog).toContainText("Creating a fork is outside this local preview.");
      await surface("fork-local-rejected-diagnostic", "View diagnostic information → Enter");
      recorder.phase("fork-local-diagnostic-restored");
      await activateProductControl(
        page,
        dialog.getByRole("button", { name: "Close diagnostics", exact: true }),
      );
      await expect(dialog).toHaveCount(0);
      await expect(diagnosticTrigger).toBeFocused();
      await capture("fork-local-diagnostic-restored", "Close diagnostics → Enter", false);
      await dismiss("fork-local-rejection-dismissed");
      await expect(historyRoot).toHaveAttribute("data-history-forks", "1");

      if (storyId === "history-fork--created-unopened") {
        recorder.phase("reset-before-independent-continue");
        await resetStory();
        await expectSavedPreserved();
        const continueTask = page.getByRole("button", { name: "Continue this task", exact: true });
        recorder.phase("continue-with-saved-fork");
        await activateProductControl(page, continueTask);
        await expect(continueTask).toHaveCount(0);
        await expect(
          page.getByRole("combobox", { name: "Message Codex", exact: true }),
        ).toBeVisible();
        await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
        await expectSavedPreserved();
        await expect(historyRoot).toHaveAttribute("data-history-forks", "0");
        await surface(
          "fork-independent-continue",
          "Continue this task → current task with saved-fork notice",
        );
        // This retained notice changes the Composer's surrounding layout. Reuse the
        // popover owner here before reset; the caller later captures the distinct
        // state after Open fork has cleared that notice. Keep artifact names separate.
        recorder.phase("fork-independent-continue-popovers");
        await observeComposerPopovers(page, testInfo, `${storyId}-fork-independent-continue`);
        await expectSavedPreserved();
      }

      // The existing recovery implementation runs once after this helper returns.
      // Its Open fork/page-coexistence paths then leave the expected Composer state
      // for the caller's notice-cleared Context usage supplement. Do not reset on a failure.
      recorder.phase("reset-for-existing-recovery");
      await resetStory();
    },
  );
}
