import { expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { attachResponse, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachWithTurns,
  baseTurn,
  contextCompaction,
  subAgentActivity,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { detailThreadId, renderDetail } from "./threadHistoryDetailBrowserHarness";

const historyThread = (
  turns: typeof attachResponse.snapshot.thread.turns,
  name = "Historical task",
) => ({
  ...attachWithTurns(attachResponse, turns).snapshot.thread,
  id: detailThreadId,
  name,
});

const emptyHistoryThread = () => historyThread([]);

test.each([
  { name: null, preview: "  Preview title  ", title: "Preview title" },
  { name: " \t ", preview: " \n ", title: "Untitled task" },
])("renders the detail fallback title $title", async ({ name, preview, title }) => {
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi.fn<GuiHostCommands["readThread"]>().mockResolvedValue({
      thread: { ...emptyHistoryThread(), name, preview },
    }),
  };
  const { screen } = await renderDetail({ commands });

  await expect.element(screen.getByRole("heading", { name: title, exact: true })).toBeVisible();
});

test("loads with exact read parameters, preserves the complete error, and retries into empty history", async () => {
  const initialRead = deferred<Awaited<ReturnType<GuiHostCommands["readThread"]>>>();
  const readThread = vi
    .fn<GuiHostCommands["readThread"]>()
    .mockReturnValueOnce(initialRead.promise)
    .mockResolvedValueOnce({ thread: emptyHistoryThread() });
  const commands = { ...createGuiHostCommands(), readThread };
  const { screen } = await renderDetail({ commands });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Loading task history…");
  expect(readThread).toHaveBeenCalledExactlyOnceWith({
    threadId: detailThreadId,
    includeTurns: true,
  });

  const rawFailure = new Error("complete thread/read failure: request id 88");
  initialRead.reject(rawFailure);
  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to load task history")).toBeVisible();
  await expect.element(alert.getByText(rawFailure.message, { exact: true })).toBeVisible();
  await alert.getByRole("button", { name: "Retry" }).click();

  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  expect(readThread).toHaveBeenCalledTimes(2);
  expect(commands.resumeThread).not.toHaveBeenCalled();
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
});

test("rejects a mismatched thread identity and retries the requested detail", async () => {
  const mismatchedThread = {
    ...historyThread(
      [
        baseTurn("mismatched-history-turn", [
          userMessage("mismatched-history-user", [textInput("Wrong thread content")]),
        ]),
      ],
      "Wrong historical task",
    ),
    id: "00000000-0000-0000-0000-000000000099",
  };
  const matchingThread = historyThread(
    [
      baseTurn("matching-history-turn", [
        userMessage("matching-history-user", [textInput("Requested thread content")]),
      ]),
    ],
    "Requested historical task",
  );
  const readThread = vi
    .fn<GuiHostCommands["readThread"]>()
    .mockResolvedValueOnce({ thread: mismatchedThread })
    .mockResolvedValueOnce({ thread: matchingThread });
  const commands = { ...createGuiHostCommands(), readThread };
  const { screen } = await renderDetail({ commands });

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to load task history")).toBeVisible();
  await expect
    .element(alert.getByText("thread/read returned a different thread identity", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Wrong thread content")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Continue this task" }))
    .not.toBeInTheDocument();
  expect(readThread).toHaveBeenCalledExactlyOnceWith({
    threadId: detailThreadId,
    includeTurns: true,
  });

  await alert.getByRole("button", { name: "Retry" }).click();

  await expect.element(screen.getByText("Requested thread content")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Requested historical task" }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Continue this task" })).toBeVisible();
  expect(readThread).toHaveBeenCalledTimes(2);
  expect(readThread).toHaveBeenNthCalledWith(2, {
    threadId: detailThreadId,
    includeTurns: true,
  });
});

test("settles a deferred read into ready after StrictMode effect replay", async () => {
  const read = deferred<Awaited<ReturnType<GuiHostCommands["readThread"]>>>();
  const readThread = vi.fn<GuiHostCommands["readThread"]>().mockReturnValue(read.promise);
  const commands = { ...createGuiHostCommands(), readThread };
  const { screen } = await renderDetail({ commands, strictMode: true });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Loading task history…");
  expect(readThread).toHaveBeenCalledExactlyOnceWith({
    threadId: detailThreadId,
    includeTurns: true,
  });

  read.resolve({ thread: emptyHistoryThread() });

  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("banner").getByRole("heading", { level: 1 }))
    .toHaveTextContent("Historical task");
  expect(screen.getByRole("heading", { level: 1 }).elements()).toHaveLength(1);
  await expect.poll(() => document.title).toBe("Historical task · Codex");
  expect(readThread).toHaveBeenCalledTimes(1);
  expect(commands.resumeThread).not.toHaveBeenCalled();
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
});

test("settles a deferred read into error after StrictMode effect replay", async () => {
  const read = deferred<Awaited<ReturnType<GuiHostCommands["readThread"]>>>();
  const readThread = vi.fn<GuiHostCommands["readThread"]>().mockReturnValue(read.promise);
  const commands = { ...createGuiHostCommands(), readThread };
  const { screen } = await renderDetail({ commands, strictMode: true });

  await expect.element(screen.getByRole("status")).toHaveTextContent("Loading task history…");
  expect(readThread).toHaveBeenCalledExactlyOnceWith({
    threadId: detailThreadId,
    includeTurns: true,
  });

  const failure = new Error("strict replay read failure");
  read.reject(failure);

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to load task history")).toBeVisible();
  await expect.element(alert.getByText(failure.message, { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("banner").getByRole("heading", { level: 1 }))
    .toHaveTextContent("History detail");
  await expect.poll(() => document.title).toBe("History detail · Codex");
  expect(readThread).toHaveBeenCalledTimes(1);
  expect(commands.resumeThread).not.toHaveBeenCalled();
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
});

test("shows a terminal connection error without an invalid Retry before commands exist", async () => {
  const { screen } = await renderDetail({
    activeThreadSession: null,
    commands: null,
    status: { label: "closed" },
  });

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("The task connection was closed.")).toBeVisible();
  await expect.element(alert.getByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  await expect.element(screen.getByText("Loading task history…")).not.toBeInTheDocument();
});

test("opens the canonical history list from the menu without search or fragment", async () => {
  const { router, screen } = await renderDetail();

  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History", exact: true })
    .click();

  await expect.element(screen.getByRole("main", { name: "History list" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/history");
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
});

test("retains a loaded read-only snapshot when commands later become unavailable", async () => {
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { capabilitiesStore, initialCapabilities, screen } = await renderDetail({ commands });

  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  capabilitiesStore.publish({
    ...initialCapabilities,
    activeThreadSession: null,
    commands: null,
    status: { label: "closed" },
  });

  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  await expect.element(screen.getByText("The task connection was closed.")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Continue this task" })).toBeDisabled();
});

test("renders formatted and aggregated sub-agent activity from a read-only snapshot", async () => {
  const paths = [
    "/root/plan_frontend_bootstrap",
    "/root/plan_routes_query",
    "/root/plan_rust_host",
    "/root/omitted_worker",
  ] as const;
  const thread = historyThread([
    baseTurn("history-sub-agent-activity", [
      userMessage("history-sub-agent-user", [textInput("Inspect delegated work")]),
      ...paths.map((agentPath, index) =>
        subAgentActivity(`history-sub-agent-${String(index)}`, "started", agentPath, {
          agentThreadId: `history-sub-agent-thread-${String(index)}`,
        }),
      ),
    ]),
  ]);
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi.fn<GuiHostCommands["readThread"]>().mockResolvedValue({ thread }),
  };
  const { screen } = await renderDetail({ commands });

  const turn = screen.getByRole("article", { name: "Turn history-sub-agent-activity" });
  const startedActivities = turn.getByRole("article", { name: /^Started / });
  expect(startedActivities.elements()).toHaveLength(1);
  const activity = startedActivities.nth(0);
  await expect
    .element(activity)
    .toHaveAccessibleName(
      "Started Plan frontend bootstrap Plan routes query Plan rust host and 1 more sub-agent",
    );

  const firstLabel = activity.getByText("Plan frontend bootstrap", { exact: true });
  const secondLabel = activity.getByText("Plan routes query", { exact: true });
  const thirdLabel = activity.getByText("Plan rust host", { exact: true });
  for (const content of [firstLabel, secondLabel, thirdLabel]) {
    await expect.element(content).toBeVisible();
  }
  expect(
    firstLabel.element().compareDocumentPosition(secondLabel.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expect(
    secondLabel.element().compareDocumentPosition(thirdLabel.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);

  await expect
    .element(activity.getByText("Omitted worker", { exact: true }))
    .not.toBeInTheDocument();
  for (const agentPath of paths) {
    await expect.element(activity.getByText(agentPath, { exact: true })).not.toBeInTheDocument();
  }
  expect(
    activity
      .element()
      .querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).toHaveLength(0);
});

test("keeps the transcript end above the measured continuation action surface", async () => {
  const finalMessage = `${Array.from(
    { length: 80 },
    (_, index) => `Read-only history line ${String(index + 1)}`,
  ).join("\n")}\nEnd of read-only history`;
  const diagnostic = Array.from(
    { length: 80 },
    (_, index) => `Continuation diagnostic line ${String(index + 1)}`,
  ).join("\n");
  const thread = historyThread([
    baseTurn("history-turn-1", [
      userMessage("history-user-1", [textInput("First historical context page")]),
    ]),
    baseTurn("history-turn-2", [
      contextCompaction("history-compaction-2"),
      userMessage("history-user-2", [textInput(finalMessage)]),
    ]),
  ]);
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi.fn<GuiHostCommands["readThread"]>().mockResolvedValue({ thread }),
  };
  const { screen } = await renderDetail({
    activate: {
      type: "unavailable",
      failure: {
        type: "operationFailed",
        phase: "resume",
        error: new Error(diagnostic),
        cleanupError: null,
      },
    },
    commands,
  });

  const pagination = screen.getByRole("navigation", { name: "Transcript context pages" });
  const firstPage = pagination.getByRole("button", { name: "Context page 1" });
  const secondPage = pagination.getByRole("button", { name: "Context page 2" });
  await expect.element(secondPage).toHaveAttribute("aria-current", "page");
  await expect
    .element(screen.getByText("End of read-only history", { exact: false }))
    .toBeVisible();
  await expect.element(screen.getByText("First historical context page")).not.toBeInTheDocument();
  await firstPage.click();
  await expect.element(screen.getByText("First historical context page")).toBeVisible();
  await expect
    .element(screen.getByText("End of read-only history", { exact: false }))
    .not.toBeInTheDocument();
  await secondPage.click();

  await expect
    .element(screen.getByRole("region", { name: "Message composer" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByPlaceholder("Message Codex")).not.toBeInTheDocument();
  expect(commands.startTurn).not.toHaveBeenCalled();
  expect(commands.steerTurn).not.toHaveBeenCalled();
  expect(commands.interruptTurn).not.toHaveBeenCalled();

  const action = screen.getByRole("button", { name: "Continue this task" });
  const qrAction = screen.getByRole("button", { name: "Scan with phone" });
  const actionBar = action.element().closest("aside");
  expect(qrAction.element().closest("aside")).toBe(actionBar);
  if (!(actionBar instanceof HTMLElement)) {
    throw new Error("Expected history continuation actions");
  }

  await action.click();
  await expect
    .element(screen.getByText("The task could not be resumed.", { exact: true }))
    .toBeVisible();

  await screen.getByRole("button", { name: "View diagnostic information" }).click();
  const dialog = page.getByRole("dialog", { name: "Diagnostic information" });
  await expect
    .element(dialog.getByText("Continuation diagnostic line 80", { exact: false }))
    .toBeVisible();
  await dialog.getByRole("button", { name: "Close diagnostics" }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect
    .poll(
      () =>
        actionBar
          .getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running" || animation.pending).length,
    )
    .toBe(0);
  await expect.element(action).toBeInViewport({ ratio: 1 });
  await expect.element(qrAction).toBeInViewport({ ratio: 1 });

  window.scrollTo(0, document.documentElement.scrollHeight);
  const transcriptEnd = screen.getByText("End of read-only history", { exact: false });
  await expect
    .poll(() => {
      return (
        transcriptEnd.element().getBoundingClientRect().bottom <=
        actionBar.getBoundingClientRect().top
      );
    })
    .toBe(true);
});

test("preserves detail and list entries across browser back and forward navigation", async () => {
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { router, screen } = await renderDetail({ commands });

  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await screen
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "History", exact: true })
    .click();
  await expect.element(screen.getByRole("main", { name: "History list" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/history");

  router.history.back();
  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
  expect(commands.readThread).toHaveBeenCalledTimes(2);

  router.history.forward();
  await expect.element(screen.getByRole("main", { name: "History list" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/history");
});
