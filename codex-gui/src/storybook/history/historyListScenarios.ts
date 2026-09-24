import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { historyTask, historySelectedId, historyCurrentId } from "./historyFixtures";

export type HistoryListScenario =
  | "loading"
  | "empty"
  | "contextUnavailable"
  | "initialError"
  | "pagination"
  | "paginationError"
  | "appendLoading"
  | "longContent";

export function createHistoryListCommand(
  scenario: HistoryListScenario | undefined,
  wait: (pending?: boolean) => Promise<void>,
): GuiHostCommands["listThreads"] {
  let initialAttempts = 0;
  let appendAttempts = 0;
  const first = historyTask(
    historySelectedId,
    "Investigate history recovery",
    "Read-only history evidence",
  ).snapshot.thread;
  const earlier = historyTask(historyCurrentId, "Earlier investigation", "Earlier history evidence")
    .snapshot.thread;
  const long = {
    ...first,
    name: "Long history title ".repeat(30),
    preview: "Long summary without losing the selected task context. ".repeat(40),
  };
  return async ({ cursor }) => {
    if (scenario === "loading") await wait(true);
    if (cursor != null) {
      appendAttempts += 1;
      await wait(scenario === "appendLoading");
      if (scenario === "paginationError" && appendAttempts === 1)
        throw new Error("STORYBOOK_HISTORY_APPEND_FAILED: The next local page is unavailable.");
      return { data: [earlier], nextCursor: null, backwardsCursor: null };
    }
    initialAttempts += 1;
    if (scenario === "initialError" && initialAttempts === 1)
      throw new Error("STORYBOOK_HISTORY_LIST_FAILED: The local history list is unavailable.");
    if (initialAttempts > 1) await wait();
    const paginated =
      scenario === "pagination" || scenario === "paginationError" || scenario === "appendLoading";
    return {
      data:
        scenario === "empty"
          ? []
          : scenario === "longContent"
            ? [long, { ...earlier, recencyAt: first.updatedAt - 86_400 }]
            : [first],
      nextCursor: paginated ? "local-next-page" : null,
      backwardsCursor: null,
    };
  };
}
