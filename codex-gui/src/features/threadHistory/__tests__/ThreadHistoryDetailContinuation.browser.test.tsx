import { toast } from "@heroui/react";
import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { attachResponse, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import { createActiveThreadSessionHarness } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachWithTurns,
  baseTurn,
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

afterEach(() => {
  toast.clear();
});

test("reports an unresolved current thread without flashing pending and links the action to its reason", async () => {
  const activeThreadId = "00000000-0000-0000-0000-000000000089";
  const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
    type: "unavailable",
    failure: {
      type: "currentThreadUnresolved",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
      activeThreadId,
    },
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { screen } = await renderDetail({ activate, commands });
  const action = screen.getByRole("button", { name: "Continue this task" });

  await expect.element(action).toBeEnabled();
  await action.click();

  const reason =
    "The current task still has queued or unresolved messages. Return to it before switching.";
  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to switch tasks yet")).toBeVisible();
  await expect.element(alert.getByText(reason, { exact: true })).toBeVisible();
  await expect.element(action).not.toHaveAttribute("data-pending");
  await expect.element(action).toHaveAccessibleDescription(reason);
  expect(activate).toHaveBeenCalledExactlyOnceWith(detailThreadId);
  const returnAction = alert.getByRole("button", { name: "Return to current task" });
  await expect.element(returnAction).toBeVisible();
  await expect.element(returnAction).toBeEnabled();
});

test("pushes an unresolved continuation return target and preserves the history detail back stack", async () => {
  const activeThreadId = "00000000-0000-0000-0000-000000000089";
  const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
    type: "unavailable",
    failure: {
      type: "currentThreadUnresolved",
      blockers: [{ type: "ordinaryQueued", count: 1 }],
      activeThreadId,
    },
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const detailUrl = `/history/${detailThreadId}`;
  const { router, screen } = await renderDetail({
    activate,
    commands,
    initialEntries: ["/origin", detailUrl],
  });
  const historyLength = router.history.length;

  await screen.getByRole("button", { name: "Continue this task" }).click();
  const returnAction = screen.getByRole("button", { name: "Return to current task" });
  await expect.element(returnAction).toBeEnabled();
  await returnAction.click();

  await expect.element(screen.getByRole("main", { name: "Current task" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(`/task/${activeThreadId}`);
  expect(router.state.location.search).toEqual({});
  expect(router.state.location.hash).toBe("");
  expect(router.history.length).toBe(historyLength + 1);

  router.history.back();
  await expect.element(screen.getByRole("heading", { name: "Historical task" })).toBeVisible();
  expect(router.state.location.pathname).toBe(detailUrl);
});

test("does not offer a return action when the current thread changed to empty", async () => {
  const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
    type: "unavailable",
    failure: {
      type: "currentThreadChanged",
      activeThreadId: null,
      expectedRevision: 1,
      actualRevision: 2,
    },
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { screen } = await renderDetail({ activate, commands });

  await screen.getByRole("button", { name: "Continue this task" }).click();

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to continue this task")).toBeVisible();
  await expect.element(alert.getByText("The task could not be activated.")).toBeVisible();
  await expect
    .element(alert.getByRole("button", { name: "Return to current task" }))
    .not.toBeInTheDocument();
});

test("reports another switch in progress without offering a stale owner route", async () => {
  const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
    type: "unavailable",
    failure: { type: "switchInProgress" },
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { router, screen } = await renderDetail({ activate, commands });

  await screen.getByRole("button", { name: "Continue this task" }).click();

  const alert = screen.getByRole("alert");
  await expect
    .element(alert.getByText("Another task switch is already in progress. Try again shortly."))
    .toBeVisible();
  await expect
    .element(alert.getByRole("button", { name: "Return to current task" }))
    .not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
});

test("builds QR access for the visible detail instead of a different active thread", async () => {
  const activeThreadId = "00000000-0000-0000-0000-000000000089";
  const activeThreadSessionHarness = createActiveThreadSessionHarness();
  activeThreadSessionHarness.publish(
    activeThreadSessionHarness.activeSnapshot({
      threadId: activeThreadId,
      subscriptionId: `subscription-${activeThreadId}`,
    }),
  );
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { screen } = await renderDetail({
    activeThreadSession: activeThreadSessionHarness.session,
    authorizationToken: "retained-secret",
    commands,
  });

  await screen.getByRole("button", { name: "Scan with phone" }).click();

  const dialog = screen.getByRole("dialog", { name: "Scan with phone" });
  await expect
    .element(
      dialog.getByText(`${window.location.origin}/history/${detailThreadId}#token=retained-secret`),
    )
    .toBeVisible();
  await expect
    .element(dialog.getByText(new RegExp(`/task/${activeThreadId}`)))
    .not.toBeInTheDocument();
});

test("keeps one continuation in flight while the primary action is pending", async () => {
  const switching = deferred<Awaited<ReturnType<ActiveThreadSession["activate"]>>>();
  const activate = vi.fn<ActiveThreadSession["activate"]>().mockReturnValue(switching.promise);
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { router, screen } = await renderDetail({ activate, commands });
  const action = screen.getByRole("button", { name: "Continue this task" });

  await action.click();
  await expect.element(action).toHaveAttribute("data-pending", "true");
  const pendingActionElement = action.element();
  if (!(pendingActionElement instanceof HTMLButtonElement)) {
    throw new Error("Expected the pending continuation action to be a button");
  }
  pendingActionElement.click();
  expect(activate).toHaveBeenCalledExactlyOnceWith(detailThreadId);

  const rawFailure = new Error("continuation settled after pending");
  switching.resolve({
    type: "unavailable",
    failure: {
      type: "operationFailed",
      phase: "resume",
      error: rawFailure,
      cleanupError: null,
    },
  });

  await expect.element(action).not.toHaveAttribute("data-pending");
  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  const alert = screen.getByRole("alert");
  await expect
    .element(alert.getByText("The task could not be resumed.", { exact: true }))
    .toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
});

test("keeps the read-only detail visible when activation returns empty", async () => {
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { router, screen } = await renderDetail({ activate: { type: "empty" }, commands });
  const action = screen.getByRole("button", { name: "Continue this task" });

  await action.click();

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to continue this task")).toBeVisible();
  const summary = "The task could not be activated.";
  await expect.element(alert.getByText(summary)).toBeVisible();
  await expect.element(action).toHaveAccessibleDescription(summary);
  await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
});

test("keeps a long history continuation failure visible beside the retry action", async () => {
  const rawFailure = new Error("complete resume failure: request id 88");
  const cleanupError = new Error("cleanup after resume failed");
  const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
    type: "unavailable",
    failure: {
      type: "operationFailed",
      phase: "resume",
      error: rawFailure,
      cleanupError,
    },
  });
  const historyText = Array.from(
    { length: 80 },
    (_, index) => `Long read-only history line ${String(index + 1)}`,
  ).join("\n");
  const thread = historyThread([
    baseTurn("long-history-turn", [
      userMessage("long-history-user", [textInput(`${historyText}\nEnd of long history`)]),
    ]),
  ]);
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi.fn<GuiHostCommands["readThread"]>().mockResolvedValue({ thread }),
  };
  const { router, screen } = await renderDetail({ activate, commands });
  const action = screen.getByRole("button", { name: "Continue this task" });

  await expect.element(action).toBeVisible();
  window.scrollTo({ left: 0, top: 0 });
  await expect.poll(() => window.scrollY).toBe(0);
  await expect
    .poll(() => document.documentElement.scrollHeight - window.innerHeight - window.scrollY)
    .toBeGreaterThan(100);

  await action.click();

  const summary = "The task could not be resumed.";
  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText(summary, { exact: true })).toBeVisible();
  await expect.element(alert).toBeInViewport();
  const actionBar = action.element().closest("aside");
  expect(actionBar).not.toBeNull();
  expect(actionBar?.contains(alert.element())).toBe(true);
  await expect.element(action).toHaveAccessibleName("Continue this task");
  await expect.element(action).toHaveAccessibleDescription(summary);

  const operationDiagnostic = alert.getByText("Operation diagnostic:", { exact: false });
  const cleanupDiagnostic = alert.getByText("Cleanup diagnostic:", { exact: false });
  await expect.element(operationDiagnostic).not.toBeInTheDocument();
  await expect.element(cleanupDiagnostic).not.toBeInTheDocument();
  const disclosure = alert.getByRole("button", { name: "View diagnostic information" });
  await expect.element(disclosure).toBeVisible();
  disclosure.element().focus();
  await expect.element(disclosure).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(operationDiagnostic).toHaveTextContent(rawFailure.message);
  await expect.element(operationDiagnostic).toBeVisible();
  await expect.element(cleanupDiagnostic).toHaveTextContent(cleanupError.message);
  await expect.element(cleanupDiagnostic).toBeVisible();

  disclosure.element().focus();
  await expect.element(disclosure).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(operationDiagnostic).not.toBeInTheDocument();
  await expect.element(cleanupDiagnostic).not.toBeInTheDocument();

  await action.click();
  expect(activate).toHaveBeenCalledTimes(2);
  expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
});

test("preserves document scroll position when expanding diagnostics at the bottom", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  const originalScrollTop = window.scrollY;
  try {
    await page.viewport(1280, 720);
    const diagnostic = "complete resume failure: request id 88";
    const historyText = Array.from(
      { length: 80 },
      (_, index) => `Bottom expansion history line ${String(index + 1)}`,
    ).join("\n");
    const thread = historyThread([
      baseTurn("bottom-expansion-turn", [
        userMessage("bottom-expansion-user", [textInput(historyText)]),
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
    const action = screen.getByRole("button", { name: "Continue this task" });

    await action.click();
    const alert = screen.getByRole("alert");
    await expect.element(alert.getByText("The task could not be resumed.")).toBeVisible();
    const disclosure = alert.getByRole("button", { name: "View diagnostic information" });
    await expect.element(disclosure).toBeVisible();

    const actionBar = action.element().closest("aside");
    if (!(actionBar instanceof HTMLElement)) {
      throw new Error("Expected continuation action to be rendered in an aside");
    }
    const actionSpace = document.querySelector("[data-thread-history-continuation-action-space]");
    if (!(actionSpace instanceof HTMLElement)) {
      throw new Error("Expected continuation action space");
    }
    // Keep the measured spacer out of document scroll anchoring while its height changes.
    expect(getComputedStyle(actionSpace).overflowAnchor).toBe("none");
    await expect
      .poll(() => Math.abs(actionSpace.getBoundingClientRect().height - actionBar.offsetHeight))
      .toBeLessThanOrEqual(1);

    const documentScroller = document.scrollingElement;
    if (!(documentScroller instanceof HTMLElement)) {
      throw new Error("Expected an HTML document scrolling element");
    }
    window.scrollTo({ top: documentScroller.scrollHeight });
    await expect.poll(() => documentScroller.scrollTop).toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          documentScroller.scrollHeight -
          documentScroller.clientHeight -
          documentScroller.scrollTop,
      )
      .toBeLessThanOrEqual(1);
    const scrollTopBeforeExpand = documentScroller.scrollTop;

    disclosure.element().focus();
    await expect.element(disclosure).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect.element(alert.getByText(diagnostic, { exact: false })).toBeVisible();
    await expect
      .poll(() => Math.abs(actionSpace.getBoundingClientRect().height - actionBar.offsetHeight))
      .toBeLessThanOrEqual(1);
    await expect.element(disclosure).toHaveFocus();
    expect(Math.abs(documentScroller.scrollTop - scrollTopBeforeExpand)).toBeLessThanOrEqual(1);
  } finally {
    window.scrollTo({ top: originalScrollTop });
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("keeps long continuation diagnostics within a narrow action surface", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  const originalScrollTop = window.scrollY;
  try {
    await page.viewport(390, 600);
    const diagnostic = Array.from(
      { length: 100 },
      (_, index) =>
        `Raw continuation diagnostic line ${String(index + 1)} with enough detail to wrap.`,
    ).join("\n");
    const historyText = Array.from(
      { length: 80 },
      (_, index) => `Narrow history line ${String(index + 1)}`,
    ).join("\n");
    const thread = historyThread([
      baseTurn("narrow-diagnostic-turn", [
        userMessage("narrow-diagnostic-user", [textInput(historyText)]),
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
    const action = screen.getByRole("button", { name: "Continue this task" });

    await action.click();
    const alert = screen.getByRole("alert");
    await expect.element(alert.getByText("The task could not be resumed.")).toBeVisible();
    const disclosure = alert.getByRole("button", { name: "View diagnostic information" });
    await expect.element(disclosure).toBeInViewport({ ratio: 1 });

    const documentScroller = document.scrollingElement;
    if (!(documentScroller instanceof HTMLElement)) {
      throw new Error("Expected an HTML document scrolling element");
    }
    window.scrollTo({ top: Math.min(120, documentScroller.scrollHeight - window.innerHeight) });
    await expect.poll(() => documentScroller.scrollTop).toBeGreaterThan(0);
    const scrollTopBeforeExpand = documentScroller.scrollTop;

    await disclosure.click();

    const diagnosticRegion = alert
      .element()
      .querySelector("[data-history-continuation-diagnostics-scroll-region]");
    if (!(diagnosticRegion instanceof HTMLElement)) {
      throw new Error("Expected continuation diagnostics to own an internal scroll region");
    }
    await expect
      .element(
        alert.getByText("Raw continuation diagnostic line 100 with enough detail to wrap.", {
          exact: false,
        }),
      )
      .toBeVisible();
    await expect.element(action).toBeInViewport({ ratio: 1 });
    await expect.element(disclosure).toHaveFocus();
    await expect
      .poll(() => ({
        documentScrollTopStable: Math.abs(documentScroller.scrollTop - scrollTopBeforeExpand) <= 1,
        hasInternalOverflow: diagnosticRegion.scrollHeight > diagnosticRegion.clientHeight + 1,
        usesInternalScrolling: ["auto", "scroll"].includes(
          getComputedStyle(diagnosticRegion).overflowY,
        ),
      }))
      .toEqual({
        documentScrollTopStable: true,
        hasInternalOverflow: true,
        usesInternalScrolling: true,
      });
    diagnosticRegion.scrollTo({ top: diagnosticRegion.scrollHeight });
    await expect.poll(() => diagnosticRegion.scrollTop).toBeGreaterThan(0);
    expect(Math.abs(documentScroller.scrollTop - scrollTopBeforeExpand)).toBeLessThanOrEqual(1);
    await expect.element(disclosure).toHaveFocus();
  } finally {
    window.scrollTo({ top: originalScrollTop });
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test.each([
  ["resume", "The task could not be resumed."],
  ["attach", "The task connection could not be prepared."],
  ["prepare", "The task connection could not be prepared."],
  ["activate", "The task could not be activated."],
] as const)(
  "keeps the read-only detail retryable after an %s operation failure",
  async (phase, summary) => {
    const rawFailure = new Error(`complete ${phase} failure: request id 88`);
    const cleanupError = new Error(`cleanup after ${phase} failed`);
    const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
      type: "unavailable",
      failure: {
        type: "operationFailed",
        phase,
        error: rawFailure,
        cleanupError,
      },
    });
    const commands = {
      ...createGuiHostCommands(),
      readThread: vi
        .fn<GuiHostCommands["readThread"]>()
        .mockResolvedValue({ thread: emptyHistoryThread() }),
    };
    const { router, screen } = await renderDetail({ activate, commands });
    const action = screen.getByRole("button", { name: "Continue this task" });

    await action.click();
    const alert = screen.getByRole("alert");
    await expect.element(alert.getByText("Unable to continue this task")).toBeVisible();
    await expect.element(alert.getByText(summary, { exact: true })).toBeVisible();
    await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
    await expect.element(action).not.toHaveAttribute("data-pending");
    expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);

    await action.click();
    expect(activate).toHaveBeenCalledTimes(2);
  },
);

test.each(["beforeCommit", "afterCommit"] as const)(
  "keeps history visible after a %s connection loss without offering active-thread navigation",
  async (progress) => {
    const cleanupError = new Error(`cleanup after ${progress} failed`);
    const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
      type: "unavailable",
      failure: {
        type: "connectionLost",
        progress,
        threadId: detailThreadId,
        cleanupError,
      },
    });
    const commands = {
      ...createGuiHostCommands(),
      readThread: vi
        .fn<GuiHostCommands["readThread"]>()
        .mockResolvedValue({ thread: emptyHistoryThread() }),
    };
    const { router, screen } = await renderDetail({ activate, commands });

    await screen.getByRole("button", { name: "Continue this task" }).click();

    const alert = screen.getByRole("alert");
    await expect
      .element(
        alert.getByText(
          progress === "beforeCommit"
            ? "The connection was interrupted before the task switch completed. Reconnect and try again."
            : "The task switch was committed, but the connection was interrupted. Reconnect and confirm the current task.",
          { exact: true },
        ),
      )
      .toBeVisible();
    await expect
      .element(alert.getByRole("button", { name: "Return to current task" }))
      .not.toBeInTheDocument();
    await expect.element(screen.getByText("This task has no messages.")).toBeVisible();
    expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
  },
);

test("renders a synchronous activation exception as an unexpected failure", async () => {
  const rawFailure = new Error("synchronous activation failure");
  const activate = vi.fn<ActiveThreadSession["activate"]>(() => {
    throw rawFailure;
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { router, screen } = await renderDetail({ activate, commands });
  const action = screen.getByRole("button", { name: "Continue this task" });

  await action.click();

  const alert = screen.getByRole("alert");
  await expect.element(alert.getByText("Unable to continue this task")).toBeVisible();
  const summary = "An unexpected error occurred while continuing the task.";
  await expect.element(alert.getByText(summary, { exact: true })).toBeVisible();
  await expect.element(action).toHaveAccessibleDescription(summary);
  const diagnostic = alert.getByText("Diagnostic:", { exact: false });
  await expect.element(diagnostic).not.toBeInTheDocument();
  const disclosure = alert.getByRole("button", { name: "View diagnostic information" });
  await expect.element(disclosure).toBeVisible();
  await disclosure.click();
  await expect.element(diagnostic).toHaveTextContent(rawFailure.message);
  await expect.element(diagnostic).toBeVisible();
  expect(router.state.location.pathname).toBe(`/history/${detailThreadId}`);
});

test("replaces history with the authoritative ready thread without showing a warning", async () => {
  const authoritativeThreadId = "00000000-0000-0000-0000-000000000090";
  const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
    type: "ready",
    threadId: authoritativeThreadId,
    warnings: [],
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const detailUrl = `/history/${detailThreadId}`;
  const { router, screen } = await renderDetail({
    activate,
    commands,
    initialEntries: ["/origin", detailUrl],
  });
  const historyLength = router.history.length;

  await screen.getByRole("button", { name: "Continue this task" }).click();

  await expect.element(screen.getByRole("main", { name: "Current task" })).toBeInTheDocument();
  expect(router.state.location.pathname).toBe(`/task/${authoritativeThreadId}`);
  expect(router.history.length).toBe(historyLength);
  await expect.element(screen.getByText("Task opened", { exact: true })).not.toBeInTheDocument();

  router.history.back();
  await expect.element(screen.getByRole("main", { name: "Origin" })).toBeInTheDocument();
});

test.each([
  [
    { type: "authorizationPersistenceFailed", error: new Error("persistence degraded") },
    "The task opened, but some state synchronization did not finish.",
  ],
  [
    { type: "previousOwnerCleanupFailed", error: new Error("cleanup degraded") },
    "The previous task connection could not be fully cleaned up. Later state may be affected.",
  ],
] as const)(
  "navigates after a ready warning and keeps its Toast visible",
  async (warning, message) => {
    const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
      type: "ready",
      threadId: detailThreadId,
      warnings: [warning],
    });
    const commands = {
      ...createGuiHostCommands(),
      readThread: vi
        .fn<GuiHostCommands["readThread"]>()
        .mockResolvedValue({ thread: emptyHistoryThread() }),
    };
    const { screen } = await renderDetail({ activate, commands });

    await screen.getByRole("button", { name: "Continue this task" }).click();

    await expect.element(screen.getByRole("main", { name: "Current task" })).toBeInTheDocument();
    await expect.element(screen.getByText("Task opened", { exact: true })).toBeVisible();
    await expect.element(screen.getByText(message, { exact: true })).toBeVisible();
  },
);

test("keeps both warning Toasts visible after navigating away from history", async () => {
  const activate = vi.fn<ActiveThreadSession["activate"]>().mockResolvedValue({
    type: "ready",
    threadId: detailThreadId,
    warnings: [
      { type: "authorizationPersistenceFailed", error: new Error("persistence degraded") },
      { type: "previousOwnerCleanupFailed", error: new Error("cleanup degraded") },
    ],
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { screen } = await renderDetail({ activate, commands });

  await screen.getByRole("button", { name: "Continue this task" }).click();

  await expect.element(screen.getByRole("main", { name: "Current task" })).toBeInTheDocument();
  const postCommitWarning = screen.getByText(
    "The task opened, but some state synchronization did not finish.",
    { exact: true },
  );
  await expect.element(postCommitWarning).toBeVisible();
  const cleanupWarning = screen.getByText(
    "The previous task connection could not be fully cleaned up. Later state may be affected.",
    { exact: true },
  );
  await expect.element(cleanupWarning).toBeVisible();
  await expect
    .poll(() => screen.getByText("Task opened", { exact: true }).elements().length)
    .toBe(2);
});

test("ignores a stale in-flight capability result and invokes only its replacement", async () => {
  const staleSwitch = deferred<Awaited<ReturnType<ActiveThreadSession["activate"]>>>();
  const staleSessionHarness = createActiveThreadSessionHarness({
    activate: () => staleSwitch.promise,
  });
  const replacementSessionHarness = createActiveThreadSessionHarness({
    activate: {
      type: "unavailable",
      failure: { type: "switchInProgress" },
    },
  });
  const commands = {
    ...createGuiHostCommands(),
    readThread: vi
      .fn<GuiHostCommands["readThread"]>()
      .mockResolvedValue({ thread: emptyHistoryThread() }),
  };
  const { capabilitiesStore, initialCapabilities, router, screen } = await renderDetail({
    activeThreadSession: staleSessionHarness.session,
    commands,
  });
  const action = screen.getByRole("button", { name: "Continue this task" });

  await action.click();
  capabilitiesStore.publish({
    ...initialCapabilities,
    activeThreadSession: null,
    status: { label: "closed" },
  });
  await expect.element(action).toBeDisabled();
  capabilitiesStore.publish({
    ...initialCapabilities,
    activeThreadSession: replacementSessionHarness.session,
  });
  await expect.element(action).toBeEnabled();

  staleSwitch.resolve({ type: "ready", threadId: detailThreadId, warnings: [] });
  await expect.poll(() => router.state.location.pathname).toBe(`/history/${detailThreadId}`);

  await action.click();
  await expect
    .element(screen.getByText("Another task switch is already in progress. Try again shortly."))
    .toBeVisible();
  expect(staleSessionHarness.activate).toHaveBeenCalledOnce();
  expect(replacementSessionHarness.activate).toHaveBeenCalledOnce();
});
