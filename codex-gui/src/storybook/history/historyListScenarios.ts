import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { historySelectedId, historyEarlierId } from "./historyFixtures";
import type { Thread } from "@codex-protocol/v2";

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
  getThread: (threadId: string) => Thread,
): GuiHostCommands["listThreads"] {
  let initialAttempts = 0;
  let appendAttempts = 0;
  const first = getThread(historySelectedId);
  const earlier = getThread(historyEarlierId);
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
      data: scenario === "empty" ? [] : scenario === "longContent" ? [first, earlier] : [first],
      nextCursor: paginated ? "local-next-page" : null,
      backwardsCursor: null,
    };
  };
}
