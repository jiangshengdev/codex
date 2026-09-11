import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import {
  agentMessage,
  attachWithTurns,
  attachWithThreadId,
  baseTurn,
  contextCompaction,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  launchThreadId,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
} from "./appBrowserTestSupport";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));
beforeEach(() => {
  resetAppBrowserTestSupport(host.startGuiHostConnection);
});
const historyId = "00000000-0000-0000-0000-000000000088";
const forkId = "00000000-0000-0000-0000-000000000003";
const historyProjection = attachWithThreadId(
  attachWithTurns(attachResponse, [
    baseTurn("history-point", [agentMessage("answer", "Historical answer")]),
    baseTurn("later-point", [agentMessage("later", "Later historical answer")]),
  ]),
  historyId,
);
const forkProjection = attachWithThreadId(
  attachWithTurns(historyProjection, historyProjection.snapshot.thread.turns.slice(0, 1)),
  forkId,
);
const forkResponse = (): Awaited<ReturnType<GuiHostCommands["forkThread"]>> => ({
  thread: forkProjection.snapshot.thread,
  model: "gpt-5",
  modelProvider: "openai",
  serviceTier: null,
  cwd: forkProjection.snapshot.thread.cwd,
  instructionSources: [],
  approvalPolicy: "on-request",
  approvalsReviewer: "user",
  sandbox: { type: "dangerFullAccess" },
  reasoningEffort: null,
});

test("history preview forks its own source and preserves the working conversation draft", async () => {
  seedBrowserAuthorizationSession({ token: "history-fork-test" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands({ loadedThreadIds: [launchThreadId, forkId] });
  vi.mocked(commands.readThread).mockImplementation(({ threadId }) =>
    Promise.resolve({
      thread:
        threadId === historyId ? historyProjection.snapshot.thread : attachResponse.snapshot.thread,
    }),
  );
  vi.mocked(commands.attachThreadProjection).mockImplementation(({ threadId }) =>
    Promise.resolve(threadId === forkId ? forkProjection : attachResponse),
  );
  vi.mocked(commands.forkThread).mockResolvedValue(forkResponse());
  initializeHost(getHostOptions(host.startGuiHostConnection), commands);
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await expect.element(editor).toHaveAttribute("contenteditable", "true");
  await editor.fill("Keep working draft");
  await router.navigate({ to: "/history/$threadId", params: { threadId: historyId } });
  const turn = page.getByRole("article", { name: "Turn history-point", exact: true });
  await expect.element(turn.getByText("Historical answer", { exact: true })).toBeVisible();
  await turn.getByRole("button", { name: "Fork from here", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${forkId}`);
  expect(commands.forkThread).toHaveBeenCalledExactlyOnceWith({
    threadId: historyId,
    lastTurnId: "history-point",
  });
  await expect.element(page.getByText("Historical answer", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("Later historical answer", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(editor).not.toHaveTextContent("Keep working draft");
  expect(commands.startTurn).not.toHaveBeenCalled();
  await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
  await expect.element(editor).toHaveTextContent("Keep working draft");
});

test("a turn spanning context pages only exposes fork on its last fragment", async () => {
  seedBrowserAuthorizationSession({ token: "history-fork-test" });
  const url = `/history/${historyId}?turnId=spanning&position=end`;
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  vi.mocked(commands.readThread).mockResolvedValue({
    thread: attachWithThreadId(
      attachWithTurns(attachResponse, [
        baseTurn("spanning", [
          agentMessage("before", "Before compaction"),
          contextCompaction("compact"),
          agentMessage("after", "After compaction"),
        ]),
      ]),
      historyId,
    ).snapshot.thread,
  });
  initializeHost(getHostOptions(host.startGuiHostConnection), commands);
  await expect.element(page.getByText("After compaction", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous context page", exact: true }).click();
  await expect.element(page.getByText("Before compaction", { exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Fork from here", exact: true }))
    .not.toBeInTheDocument();
  await router.navigate({
    to: "/history/$threadId",
    params: { threadId: historyId },
    search: { turnId: "spanning", position: "end" },
  });
  await expect.element(page.getByText("After compaction", { exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Fork from here", exact: true }))
    .toBeEnabled();
});
