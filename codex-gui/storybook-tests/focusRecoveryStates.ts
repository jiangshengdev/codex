import { expect, type Page, type TestInfo } from "@playwright/test";
import { observeCurrentFocus, observeKeyboardFocus } from "./focusObservation";
import { activateProductControl } from "./focusKeyboardActions";
import { appShellStateStoryIds, observeAppShellStates } from "./focusAppShellStates";
import { historyListStateStoryIds, observeHistoryListStates } from "./focusHistoryListStates";
import {
  historyReturnStoryIds,
  observeHistoryContinuationStates,
} from "./focusHistoryContinuationStates";
import { historyForkStateStoryIds, observeHistoryForkStates } from "./focusHistoryForkStates";

export type HistoryLongFailureCapture = {
  kind: "history-long-failure";
  documentEndpoints: boolean;
};

const historyContinueStoryIds = [
  ...["empty", "content", "long-content", "long-content-continuation-failure"].map(
    (suffix) => `history-detail--${suffix}`,
  ),
  ...[
    "switch-in-progress",
    "current-changed-empty",
    "disconnected-before-commit",
    "disconnected-after-commit",
    "preparation-failed",
    "resume-failed",
    "activation-failed",
    "empty-result",
    "unexpected-failure",
    "navigation-failed",
  ].map((suffix) => `history-continuation--${suffix}`),
];
const historyOpenForkStoryIds = ["created-unopened", "open-failed", "navigation-failed"].map(
  (suffix) => `history-fork--${suffix}`,
);

/** Own validation and the inferred type of this diagnostic-only selection. */
export function parseRecoverySupplementSelection(text: string, route: string, storyIds: string[]) {
  if (
    storyIds.length === 0 ||
    storyIds.some((id) => id.length === 0 || id.trim() !== id) ||
    new Set(storyIds).size !== storyIds.length
  ) {
    throw new Error("Recovery entry selection requires unique explicit story IDs");
  }
  if (text === "history") {
    const collectContext = route === "supplements";
    const eligible = (id: string) =>
      collectContext
        ? id !== "history-detail--long-content-continuation-failure" &&
          (historyContinueStoryIds.includes(id) ||
            historyOpenForkStoryIds.includes(id) ||
            id === "history-fork--page-coexistence" ||
            id === "history-detail--read-error")
        : route === "recovery" && id === "history-fork--navigation-failed";
    if (!storyIds.every(eligible)) {
      throw new Error("History entry selection does not match the requested route/stories");
    }
    return { kind: "history-missing-states" as const, collectContext };
  }
  if (text === "restore-sync-failed-initial") {
    const eligible = ["backpressure", "commit-chain-mismatch", "missing-turn"].map(
      (suffix) => `feedback-message-synchronization--${suffix}`,
    );
    if (route !== "recovery" || !storyIds.every((id) => eligible.includes(id))) {
      throw new Error(
        "Restore sync entry selection requires recovery and the three known failed-entry stories",
      );
    }
    return { kind: "restore-sync-failed-initial" as const };
  }
  throw new Error(`Unknown recovery entry selection: ${text}`);
}

/** Reach product recovery outcomes using the existing local story scenarios. */
export async function observeRecoveryStates(
  page: Page,
  testInfo: TestInfo,
  storyId: string,
  resetStory: Parameters<typeof observeHistoryContinuationStates>[3],
  exactCapture?: HistoryLongFailureCapture,
  supplementSelection?: ReturnType<typeof parseRecoverySupplementSelection>,
) {
  expect(
    exactCapture == null || supplementSelection == null,
    "Recovery selections are mutually exclusive",
  ).toBe(true);
  if (exactCapture != null) {
    expect(storyId).toBe("history-detail--long-content-continuation-failure");
  }
  if (appShellStateStoryIds.some((id) => id === storyId))
    return observeAppShellStates(page, testInfo, storyId);
  if (historyListStateStoryIds.some((id) => id === storyId))
    return observeHistoryListStates(page, testInfo, storyId);
  if (historyReturnStoryIds.some((id) => id === storyId))
    return observeHistoryContinuationStates(page, testInfo, storyId, resetStory);
  const states: (
    | {
        state: string;
        trigger: string;
        observations: number;
      }
    | Awaited<ReturnType<typeof observeHistoryContinuationStates>>[number]
    | Awaited<ReturnType<typeof observeHistoryForkStates>>[number]
  )[] = [];
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  const capture = async (state: string, trigger: string, currentOnly = false) => {
    const observe = currentOnly ? observeCurrentFocus : observeKeyboardFocus;
    states.push({
      state,
      trigger,
      observations: (await observe(page, testInfo, `${storyId}-recovery-${state}`)).length,
    });
  };
  const diagnostics = async (state: string) => {
    const triggers = button("View diagnostic information");
    const count = await triggers.count();
    for (let index = 0; index < count; index += 1) {
      await activateProductControl(page, triggers.nth(index));
      await expect(
        page.getByRole("dialog", { name: "Diagnostic information", exact: true }),
      ).toBeVisible();
      await capture(`${state}-diagnostic-${String(index)}`, "View diagnostic information");
      await activateProductControl(page, button("Close diagnostics"));
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  };
  const restore = async (
    trigger: string,
    pending: string,
    failures: number,
    staysFailed = false,
  ) => {
    for (let attempt = 0; attempt <= failures; attempt += 1) {
      await activateProductControl(page, button(trigger));
      await expect(button(pending)).toBeVisible();
      // The sustained pending variants are collected in their own initial-state stories.
      // Wait for this real response before traversing, rather than racing its short timer.
      await expect(button(pending)).toHaveCount(0);
      const failed = attempt < failures || staysFailed;
      const state = `${trigger.toLowerCase().replaceAll(" ", "-")}-${String(attempt)}-${failed ? "failed" : "recovered"}`;
      if (failed) await expect(button(trigger)).toBeEnabled();
      else await expect(button(trigger)).toHaveCount(0);
      if (supplementSelection?.kind === "restore-sync-failed-initial") {
        expect(trigger).toBe("Restore sync");
        expect(attempt).toBe(0);
        expect(failed).toBe(true);
        await capture(`${state}-initial`, trigger, true);
        return;
      }
      await capture(state, trigger);
      if (failed) await diagnostics(state);
    }
  };

  if (historyForkStateStoryIds.some((id) => id === storyId)) {
    states.push(...(await observeHistoryForkStates(page, testInfo, storyId, resetStory)));
    if (
      supplementSelection?.kind === "history-missing-states" &&
      !supplementSelection.collectContext
    ) {
      return states;
    }
  }

  if (storyId === "feedback-connection-recovery-interactions--success") {
    await restore("Reconnect", "Reconnecting…", 0);
  } else if (storyId === "feedback-connection-recovery-interactions--failure") {
    await restore("Reconnect", "Reconnecting…", 0, true);
  } else if (storyId === "feedback-connection-recovery-pages--retained-disconnection") {
    await restore("Reconnect", "Reconnecting…", 1);
  } else if (storyId === "feedback-connection-recovery-pages--startup-failure") {
    await restore("Reconnect", "Reconnecting…", 0);
  } else if (storyId === "feedback-task-recovery--partial-recovery") {
    await restore("Restore task", "Restoring task…", 1);
  } else if (
    ["backpressure", "commit-chain-mismatch", "missing-turn", "task-operations"].some(
      (suffix) => storyId === `feedback-message-synchronization--${suffix}`,
    )
  ) {
    await restore("Restore sync", "Restoring sync…", 1);
  } else if (storyId === "feedback-message-synchronization--failed") {
    await restore("Restore sync", "Restoring sync…", 0);
  } else if (
    storyId === "composer-pending-input-recovery--unsent" ||
    storyId === "composer-pending-input-recovery--mixed-text-unsent"
  ) {
    await activateProductControl(page, button("Continue sending"));
    await expect(button("Resuming sending")).toBeDisabled();
    await capture("sending-persistently-pending", "Continue sending");
    // Releasing this story's pending state requires a DEV action, outside this observer.
  } else if (
    storyId === "new-session-flow--handoff-unknown" ||
    storyId === "new-session-mixed-recovery--handoff-unknown"
  ) {
    await activateProductControl(page, button("Open session"));
    await expect(button("Open session")).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Message Codex", exact: true }),
    ).toHaveAttribute("contenteditable", "true");
    await capture("opened-session", "Open session");
  } else if (storyId === "history-list--initial-error") {
    await activateProductControl(page, button("Load history"));
    await expect(
      page.getByRole("link", { name: "Investigate history recovery", exact: true }),
    ).toBeVisible();
    await capture("loaded-history", "Load history");
  } else if (storyId === "history-detail--read-error") {
    await activateProductControl(page, button("Load task history"));
    await expect(button("Continue this task")).toBeEnabled();
    if (supplementSelection == null) await capture("loaded-task-history", "Load task history");
    states.push(...(await observeHistoryContinuationStates(page, testInfo, storyId, resetStory)));
  } else if (historyContinueStoryIds.includes(storyId)) {
    await activateProductControl(page, button("Continue this task"));
    if (storyId === "history-detail--long-content-continuation-failure") {
      await expect(page.getByRole("alert")).toContainText("The task could not be resumed.");
      if (exactCapture == null) {
        await capture("long-content-continuation-failed", "Continue this task");
        await diagnostics("long-content-continuation-failed");
      }
      await activateProductControl(page, button("Continue this task"));
    }
    await expect(page.getByRole("combobox", { name: "Message Codex", exact: true })).toBeVisible();
    await expect(button("Continue this task")).toHaveCount(0);
    if (exactCapture == null && supplementSelection == null)
      await capture("continued-task", "Continue this task");
  } else if (historyOpenForkStoryIds.includes(storyId)) {
    await activateProductControl(page, button("Open fork"));
    if (storyId === "history-fork--open-failed") {
      await expect(button("Open fork")).toBeEnabled();
      if (supplementSelection == null) {
        // This response takes only 600 ms. Observe its distinct failure evidence instead
        // of requiring the brief disappearance of the recovery action to be sampled.
        await activateProductControl(page, button("View diagnostic information"));
        await expect(page.getByRole("dialog")).toContainText(
          "Opening the saved fork failed again.",
        );
        await capture("fork-open-failed-again-diagnostic", "View diagnostic information");
        await activateProductControl(page, button("Close diagnostics"));
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await capture("fork-open-failed-again", "Open fork");
      } else {
        // The requested Context needs the terminal saved-fork failure only as
        // preparation. Retain its visible product outcome without revisiting
        // the already-reviewed diagnostic dialog or recording another sweep.
        await expect(page.getByRole("alert").filter({ hasText: "Fork created" })).toHaveCount(1);
        await expect(button("View diagnostic information")).toBeVisible();
      }
      await activateProductControl(page, button("Open fork"));
    }
    await expect(page.getByText("Recovered authoritative task", { exact: true })).toBeVisible();
    await expect(button("Open fork")).toHaveCount(0);
    if (supplementSelection == null) await capture("opened-fork", "Open fork");
  } else if (storyId === "history-fork--page-coexistence") {
    const open = button("Open fork");
    const count = await open.count();
    expect(count).toBe(2);
    for (let remaining = count; remaining > 0; remaining -= 1) {
      await activateProductControl(page, open.last());
      await expect(open).toHaveCount(remaining - 1);
      await expect(
        page.getByRole("combobox", { name: "Message Codex", exact: true }),
      ).toBeVisible();
      if (supplementSelection == null)
        await capture(`coexisting-fork-${String(remaining)}`, "Open fork");
    }
  }
  // Static callback notices and unavailable/pending presets have no further product state.
  // Their visible controls and diagnostics belong to the caller's initial-state collection.
  return states;
}
