import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { historySelectedId, historyTask } from "./historyFixtures";

export type HistoryDetailScenario = "content" | "loading" | "readError" | "empty" | "longContent";

export function createHistoryReadCommand(
  scenario: HistoryDetailScenario | undefined,
  read: GuiHostCommands["readThread"],
  wait: (pending?: boolean) => Promise<void>,
): GuiHostCommands["readThread"] {
  let attempts = 0;
  return async (params) => {
    if (params.threadId !== historySelectedId) return read(params);
    attempts += 1;
    if (scenario === "loading") await wait(true);
    if (scenario === "readError" && attempts === 1)
      throw new Error(
        "STORYBOOK_HISTORY_READ_FAILED: The local historical snapshot is unavailable.",
      );
    if (attempts > 1) await wait();
    const response = await read(params);
    if (scenario === "empty") return { ...response, thread: { ...response.thread, turns: [] } };
    if (scenario === "longContent")
      return {
        ...response,
        thread: historyTask(
          historySelectedId,
          "Investigate history recovery",
          "Read-only history evidence\n\n" +
            "Long investigation paragraph with enough context to review the previous task.\n\n".repeat(
              60,
            ),
        ).snapshot.thread,
      };
    return response;
  };
}
