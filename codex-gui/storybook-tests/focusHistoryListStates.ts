import { expect, type Page, type TestInfo } from "@playwright/test";
import { activateProductControl } from "./focusKeyboardActions";
import { recordFocusStates } from "./focusStateRecorder";

export const historyListStateStoryIds = [
  "history-flow--success",
  "history-list--pagination",
  "history-list--pagination-error",
  "history-list--append-error",
] as const;

/** Existing list fixtures only; do not consume a once-failing append twice. */
export async function observeHistoryListStates(page: Page, testInfo: TestInfo, storyId: string) {
  if (!historyListStateStoryIds.some((id) => id === storyId)) return [];
  return recordFocusStates(
    page,
    testInfo,
    {
      artifactName: `${storyId}-history-list-states`,
      initialPhase: "list-ready",
      failureTrigger: "existing History list fixture",
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
      const captureSurface = async (state: string, trigger: string) => {
        await capture(`${state}-current`, trigger, false);
        await capture(`${state}-traversal`, `${trigger} → Tab / Shift+Tab`, true);
      };
      const main = page.getByRole("main");
      const firstCard = main.getByRole("link", {
        name: "Investigate history recovery",
        exact: true,
      });
      const earlierCard = main.getByRole("link", { name: "Earlier investigation", exact: true });
      const loadMore = main.getByRole("button", { name: "Load more", exact: true });
      const errorNotice = main.getByRole("alert").filter({ hasText: "Unable to load history" });
      const continueTask = page.getByRole("button", { name: "Continue this task", exact: true });

      await expect(firstCard).toBeVisible();
      await expect(earlierCard).toHaveCount(0);
      if (storyId === "history-flow--success") {
        recorder.phase("open-history-detail");
        await activateProductControl(page, firstCard);
        await expect(firstCard).toHaveCount(0);
        await expect(continueTask).toBeEnabled();
        await expect(page.getByText("Read-only history evidence", { exact: true })).toBeVisible();
        await captureSurface("history-detail-opened", "History card → Enter");

        recorder.phase("continue-opened-history-detail");
        await activateProductControl(page, continueTask);
        await expect(continueTask).toHaveCount(0);
        await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
        await expect(
          page.getByRole("combobox", { name: "Message Codex", exact: true }),
        ).toBeVisible();
        await captureSurface("history-flow-continued", "Continue this task → Enter");
        // The caller's supplements route owns Context usage in this resulting Composer.
      } else {
        const startsFailed = storyId === "history-list--append-error";
        const failsFirstAppend = storyId === "history-list--pagination-error";
        await expect(loadMore).toBeEnabled();
        if (!startsFailed) {
          await expect(errorNotice).toHaveCount(0);
          recorder.phase("append-first-result");
          await activateProductControl(page, loadMore);
        }
        if (startsFailed || failsFirstAppend) {
          // append-error's Storybook play already consumed the first failing request.
          await expect(errorNotice).toBeVisible();
          await expect(loadMore).toBeEnabled();
          await expect(firstCard).toBeVisible();
          await expect(earlierCard).toHaveCount(0);
          // The preset's initial/overlay focus was already collected. Capture only the
          // newly triggered failure for pagination-error before examining its diagnostic.
          if (failsFirstAppend) {
            await captureSurface("history-append-failed", "Load more → first append rejection");
            recorder.phase("append-failure-diagnostic");
            const diagnosticTrigger = errorNotice.getByRole("button", {
              name: "View diagnostic information",
              exact: true,
            });
            await activateProductControl(page, diagnosticTrigger);
            const dialog = page.getByRole("dialog", {
              name: "Diagnostic information",
              exact: true,
            });
            await expect(dialog).toBeVisible();
            await expect(dialog).toContainText("STORYBOOK_HISTORY_APPEND_FAILED");
            await captureSurface(
              "history-append-failed-diagnostic",
              "View diagnostic information → Enter",
            );
            recorder.phase("append-failure-diagnostic-restored");
            await activateProductControl(
              page,
              dialog.getByRole("button", { name: "Close diagnostics", exact: true }),
            );
            await expect(dialog).toHaveCount(0);
            await expect(diagnosticTrigger).toBeFocused();
            await capture("history-append-diagnostic-restored", "Close diagnostics → Enter", false);
          }
          recorder.phase("append-retry-result");
          await activateProductControl(page, loadMore);
        }
        await expect(earlierCard).toBeVisible();
        await expect(firstCard).toBeVisible();
        await expect(loadMore).toHaveCount(0);
        await expect(errorNotice).toHaveCount(0);
        await captureSurface(
          "history-append-completed",
          startsFailed || failsFirstAppend
            ? "Load more → retry appends earlier card"
            : "Load more → appends earlier card",
        );
      }
    },
  );
}
