import { beforeEach, expect, test, vi } from "vitest";
import { useEffect } from "react";
import { page } from "vitest/browser";
import {
  attachResponse,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionError,
  queueDeferredAttachProjection,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { attachWithSnapshotThread } from "@/features/projection/__tests__/projectionTestBuilders";
import { renderWithProviders } from "@/utils/test-utils";
import { useActiveThreadSession } from "@/features/appShell/AppCapabilities";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

let observedSession: ActiveThreadSession | null = null;
function ObservedTaskPage() {
  const session = useActiveThreadSession();
  useEffect(() => {
    observedSession = session;
  }, [session]);
  return <CurrentTaskPage />;
}

function requireSession(): ActiveThreadSession {
  if (observedSession == null) throw new Error("Expected a published session");
  return observedSession;
}

async function expectDiagnostic(trigger: ReturnType<typeof page.getByRole>, ...details: string[]) {
  for (const detail of details) {
    await expect.element(page.getByText(detail)).not.toBeInTheDocument();
  }
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Diagnostic information", exact: true });
  for (const detail of details) {
    await expect.element(dialog).toHaveTextContent(detail);
    await expect.poll(() => page.getByText(detail).elements().length).toBe(1);
  }
  await dialog.getByRole("button", { name: "Close diagnostics", exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument();
}

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  observedSession = null;
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
});

test.each(["success", "failure"] as const)(
  "announces task loading and removes the indicator after %s",
  async (outcome) => {
    const commands = createGuiHostCommands();
    const pendingAttach = queueDeferredAttachProjection(commands);
    const screen = await renderWithProviders(<App />);
    initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
    await expect.poll(pendingAttach.getState).toBe("pending");
    const loading = screen
      .getByRole("main")
      .getByRole("status")
      .filter({ hasText: "Loading task…" });
    await expect.element(loading).toHaveTextContent("Loading task…");
    await expect.element(loading).toBeVisible();
    await expect
      .element(screen.getByRole("region", { name: "Message composer" }))
      .not.toBeInTheDocument();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    try {
      for (const width of [375, 1280]) {
        await page.viewport(width, 720);
        const mainBounds = screen.getByRole("main").element().getBoundingClientRect();
        const loadingBounds = loading.element().getBoundingClientRect();
        expect(loadingBounds.left).toBeGreaterThanOrEqual(mainBounds.left);
        expect(loadingBounds.right).toBeLessThanOrEqual(mainBounds.right);
        expect(loadingBounds.left + loadingBounds.width / 2).toBeCloseTo(
          mainBounds.left + mainBounds.width / 2,
          0,
        );
      }
    } finally {
      await page.viewport(viewport.width, viewport.height);
    }
    if (outcome === "success") {
      pendingAttach.resolve();
    } else {
      pendingAttach.reject(new Error("Task loading failed"));
    }
    const settledContent =
      outcome === "success"
        ? screen.getByRole("region", { name: "Message composer" })
        : screen
            .getByRole("main")
            .getByRole("alert")
            .getByText("The current task could not be loaded.");
    await expect.element(settledContent).toBeVisible();
    await expect.element(loading).not.toBeInTheDocument();
    await expect.element(screen.getByText("Loading task…")).not.toBeInTheDocument();
  },
);

test.each([`/task/${launchThreadId}`, "/history", `/history/${launchThreadId}`])(
  "App displays a shared connection error once on %s",
  async (initialEntry) => {
    const detail = "Shared handshake failed: regression detail 81";
    const screen = await renderWithProviders(<App initialEntry={initialEntry} />);
    getHostOptions(startGuiHostConnectionMock).onStatus?.({ label: "error", message: detail });

    await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
    await expect.element(screen.getByText("Codex GUI could not be started.")).toBeVisible();
    const globalAlert = screen
      .getByText("Unable to start Codex GUI")
      .element()
      .closest('[data-slot="alert-root"]');
    if (globalAlert == null) throw new Error("Expected the global error alert");
    expect(
      globalAlert.getBoundingClientRect().top -
        screen.getByRole("banner").element().getBoundingClientRect().bottom,
    ).toBeCloseTo(12, 0);
    await expect
      .element(
        screen
          .getByRole("main")
          .getByRole("button", { name: "View diagnostic information", exact: true }),
      )
      .not.toBeInTheDocument();
    await expectDiagnostic(
      page.getByRole("button", { name: "View diagnostic information", exact: true }),
      detail,
    );
    await expect.element(screen.getByRole("main").getByText(detail)).not.toBeInTheDocument();
  },
);

test.each([1280, 375])(
  "global and history page errors remain 12px apart at %i pixels",
  async (width) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    try {
      await page.viewport(width, 720);
      const screen = await renderWithProviders(<App initialEntry="/history" />);
      getHostOptions(startGuiHostConnectionMock).onStatus?.({
        label: "error",
        message: "Connection failed",
      });
      await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
      const globalAlert = screen
        .getByText("Unable to start Codex GUI")
        .element()
        .closest('[data-slot="alert-root"]');
      if (globalAlert == null) throw new Error("Expected the global error alert");
      expect(
        screen.getByRole("main").getByRole("alert").element().getBoundingClientRect().top -
          globalAlert.getBoundingClientRect().bottom,
      ).toBeCloseTo(12, 0);
    } finally {
      await page.viewport(viewport.width, viewport.height);
    }
  },
);

test("a late background failure does not replace the foreground and remains available in its task", async () => {
  const backgroundThreadId = "00000000-0000-0000-0000-000000000002";
  const detail = "Background projection failed: regression detail 90";
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App currentTaskComponent={ObservedTaskPage} />);
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  const session = requireSession();
  const backgroundAttach = queueDeferredAttachProjection(commands);
  const activation = session.activate(backgroundThreadId);
  await expect.poll(backgroundAttach.getState).toBe("pending");
  await session.activate(launchThreadId);
  backgroundAttach.reject(new Error(detail));
  await activation;
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  await expect.element(page.getByText(detail)).not.toBeInTheDocument();

  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("region", { name: "Active tasks" })
    .getByRole("button", { name: backgroundThreadId, exact: true })
    .click();
  await expect
    .element(screen.getByRole("main").getByText("The current task could not be loaded."))
    .toBeVisible();
  await expectDiagnostic(
    screen
      .getByRole("main")
      .getByRole("button", { name: "View diagnostic information", exact: true }),
    detail,
  );
});

test("independent global and task operations with identical details remain independently visible", async () => {
  const missingThreadId = "00000000-0000-0000-0000-000000000003";
  const detail = "Independent operation failed with identical text";
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App currentTaskComponent={ObservedTaskPage} />);
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  const session = requireSession();
  session.setOperationError(missingThreadId, "navigation", new Error(detail));
  session.setOperationError(launchThreadId, "navigation", new Error(detail));
  session.setOperationError(launchThreadId, "remove", new Error(detail));
  const diagnostics = page.getByRole("button", {
    name: "View diagnostic information",
    exact: true,
  });
  const taskDiagnostics = screen
    .getByRole("main")
    .getByRole("button", { name: "View diagnostic information", exact: true });
  await expect.poll(() => diagnostics.elements().length).toBe(3);
  await expect.poll(() => taskDiagnostics.elements().length).toBe(2);
  const navigationNotice = screen
    .getByRole("main")
    .getByRole("alert")
    .filter({ hasText: "The task could not be opened." });
  const removalNotice = screen
    .getByRole("main")
    .getByRole("alert")
    .filter({ hasText: "The task could not be removed." });
  await expect
    .element(navigationNotice.getByRole("button", { name: "Retry", exact: true }))
    .toHaveClass("button--primary");
  await expect
    .element(removalNotice.getByRole("button", { name: "Retry", exact: true }))
    .toHaveClass("button--danger");
  for (let index = 0; index < 3; index += 1) {
    await expectDiagnostic(diagnostics.nth(index), detail);
  }
  session.setOperationError(launchThreadId, "navigation", null);
  await expect.poll(() => diagnostics.elements().length).toBe(2);
  await expect.poll(() => taskDiagnostics.elements().length).toBe(1);
  await expect.element(navigationNotice).not.toBeInTheDocument();
  await expect.element(removalNotice).toBeVisible();
  for (let index = 0; index < 2; index += 1) {
    await expectDiagnostic(diagnostics.nth(index), detail);
  }
});

test.each(["notLoaded", "systemError"] as const)(
  "the task page retains status retry for a ready member with %s",
  async (type) => {
    const commands = createGuiHostCommands();
    queueAttachProjectionResponse(
      commands,
      attachWithSnapshotThread(attachResponse, {
        ...attachResponse.snapshot.thread,
        status: { type },
      }),
    );
    vi.mocked(commands.readThread).mockResolvedValue({
      thread: { ...attachResponse.snapshot.thread, status: { type: "idle" } },
    });
    const screen = await renderWithProviders(<App />);
    initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
    const retry = screen.getByRole("main").getByRole("button", { name: "Retry", exact: true });
    await expect.element(retry).toBeEnabled();
    await expect.element(retry).toHaveClass("button--primary");
    await retry.click();
    await expect.poll(() => vi.mocked(commands.readThread).mock.calls.length).toBeGreaterThan(0);
    await expect.element(retry).not.toBeInTheDocument();
    await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  },
);

test("initialization and cleanup failures both remain visible in the task page", async () => {
  const cleanupDetail = "Cleanup connection failed: regression detail 95";
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(
    commands,
    attachWithSnapshotThread(attachResponse, {
      ...attachResponse.snapshot.thread,
      id: "00000000-0000-0000-0000-000000000004",
    }),
  );
  vi.mocked(commands.detachThreadProjection).mockRejectedValue(new Error(cleanupDetail));
  const screen = await renderWithProviders(<App />);
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  const main = screen.getByRole("main");
  const primaryDetail = "thread/projection/attach returned a different thread identity";
  const notice = main.getByRole("alert");
  await expect.element(notice).toHaveTextContent("The current task could not be loaded.");
  await expect
    .element(notice.getByRole("button", { name: "Retry", exact: true }))
    .toHaveClass("button--primary");
  await expectDiagnostic(
    notice.getByRole("button", { name: "View diagnostic information", exact: true }),
    primaryDetail,
    cleanupDetail,
  );
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  try {
    for (const width of [1280, 375]) {
      await page.viewport(width, 720);
      const retry = notice.getByRole("button", { name: "Retry", exact: true });
      expect(
        notice.element().getBoundingClientRect().top -
          screen.getByRole("banner").element().getBoundingClientRect().bottom,
      ).toBeCloseTo(12, 0);
      const title = notice.getByText("Unable to load the current task", { exact: true });
      const description = notice.getByText("The current task could not be loaded.", {
        exact: true,
      });
      await expect
        .poll(() => {
          const action = retry.element().getBoundingClientRect();
          const heading = title.element().getBoundingClientRect();
          const text = description.element().getBoundingClientRect();
          return width >= 640
            ? action.left > text.right && Math.abs(action.top - heading.top) <= 1
            : action.top >= text.bottom;
        })
        .toBe(true);
      expect(notice.element().scrollWidth).toBeLessThanOrEqual(notice.element().clientWidth);
      const diagnostic = notice.getByRole("button", {
        name: "View diagnostic information",
        exact: true,
      });
      await expect
        .poll(() => {
          const detail = diagnostic.element().getBoundingClientRect();
          const text = description.element().getBoundingClientRect();
          const action = retry.element().getBoundingClientRect();
          return (
            Math.abs(detail.left - text.left) <= 1 &&
            detail.top >= text.bottom &&
            Math.abs(detail.height - action.height) <= 1
          );
        })
        .toBe(true);
      await expect.element(retry).toHaveClass("button--sm");
      await expect.element(diagnostic).toHaveClass("button--sm");
      expect(
        notice.getByRole("button", { name: "View diagnostic information", exact: true }).elements(),
      ).toHaveLength(1);
    }
  } finally {
    await page.viewport(viewport.width, viewport.height);
  }
});

test("history continuation leaves collection diagnostics global and can retry the operation", async () => {
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App initialEntry={`/history/${launchThreadId}`} />);
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  const continueTask = screen.getByRole("button", { name: "Continue this task", exact: true });
  await expect.element(continueTask).toBeEnabled();
  const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("history membership unavailable");
  });
  try {
    await continueTask.click();
    const detail = "Session collection persistence failed: write";
    await expect.element(screen.getByText("The task list could not be updated.")).toBeVisible();
    await expectDiagnostic(
      page.getByRole("button", { name: "View diagnostic information", exact: true }),
      detail,
    );
    expect(storageWrite.mock.calls.length).toBeGreaterThan(0);
    expect(storageWrite.mock.calls.every(([key]) => key === "codex-gui.sessionCollection")).toBe(
      true,
    );
    await expect.element(screen.getByRole("main").getByText(detail)).not.toBeInTheDocument();
    await expect
      .element(
        screen
          .getByRole("main")
          .getByRole("button", { name: "View diagnostic information", exact: true }),
      )
      .not.toBeInTheDocument();
    storageWrite.mockRestore();
    await continueTask.click();
    await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
    await expect.element(page.getByText(detail)).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "View diagnostic information", exact: true }))
      .not.toBeInTheDocument();
  } finally {
    storageWrite.mockRestore();
  }
});

test("consecutive global errors remain 12px apart", async () => {
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App initialEntry={`/history/${launchThreadId}`} />);
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  const continueTask = screen.getByRole("button", { name: "Continue this task", exact: true });
  await expect.element(continueTask).toBeEnabled();
  const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("history membership unavailable");
  });
  try {
    await continueTask.click();
    await expect.element(screen.getByText("The task list could not be updated.")).toBeVisible();
    getHostOptions(startGuiHostConnectionMock).onStatus?.({
      label: "error",
      message: "Connection failed",
    });
    await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
    const alerts = screen.container.querySelectorAll(
      '[data-app-shell-top-notices] [data-slot="alert-root"]',
    );
    expect(alerts.length).toBe(2);
    const [first, second] = alerts;
    if (first == null || second == null) throw new Error("Expected both global alerts");
    expect(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom).toBeCloseTo(
      12,
      0,
    );
  } finally {
    storageWrite.mockRestore();
  }
});

test("history continuation explicitly retries an existing failed task", async () => {
  const commands = createGuiHostCommands();
  const detail = "History task resume unavailable";
  vi.mocked(commands.resumeThread).mockRejectedValueOnce(new Error(detail));
  const screen = await renderWithProviders(<App initialEntry={`/history/${launchThreadId}`} />);
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  const continueTask = screen.getByRole("button", { name: "Continue this task", exact: true });
  await expect.element(continueTask).toBeEnabled();
  await continueTask.click();
  await expect
    .element(screen.getByText("Unable to continue this task", { exact: true }))
    .toBeVisible();
  expect(commands.resumeThread).toHaveBeenCalledTimes(1);
  await continueTask.click();
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  expect(commands.resumeThread).toHaveBeenCalledTimes(2);
});

test("App keeps a membership save failure global before the task exists and retains retry", async () => {
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("membership storage unavailable");
  });
  try {
    initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
    const detail = "Session collection persistence failed: write";
    await expect.element(screen.getByText("The task list could not be updated.")).toBeVisible();
    expect(storageWrite.mock.calls.length).toBeGreaterThan(0);
    expect(storageWrite.mock.calls.every(([key]) => key === "codex-gui.sessionCollection")).toBe(
      true,
    );
    await expectDiagnostic(
      page.getByRole("button", { name: "View diagnostic information", exact: true }),
      detail,
    );
    await expect.element(screen.getByRole("main").getByText(detail)).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
    await expect
      .element(screen.getByRole("button", { name: "Retry", exact: true }))
      .toHaveClass("button--primary");
    expect(commands.resumeThread).not.toHaveBeenCalled();
    storageWrite.mockRestore();
    await screen.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
    await expect.element(page.getByText(detail)).not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "View diagnostic information", exact: true }))
      .not.toBeInTheDocument();
  } finally {
    storageWrite.mockRestore();
  }
});

test.each([false, true])(
  "App shows an initial attach failure exactly once with the task menu open=%s",
  async (openMenu) => {
    const detail = "Initial projection attach failed: regression detail 72";
    const commands = createGuiHostCommands();
    queueAttachProjectionError(commands, new Error(detail));
    const screen = await renderWithProviders(<App />);
    initializeHost(getHostOptions(startGuiHostConnectionMock), commands);

    const notice = screen.getByRole("main").getByRole("alert");
    await expect.element(notice).toHaveTextContent("The current task could not be loaded.");
    await expect
      .element(notice.getByRole("button", { name: "Retry", exact: true }))
      .toHaveClass("button--primary");
    await expectDiagnostic(
      notice.getByRole("button", { name: "View diagnostic information", exact: true }),
      detail,
    );
    if (openMenu) {
      await screen.getByRole("button", { name: "Menu", exact: true }).click();
    }
    await expect
      .poll(() =>
        page
          .getByRole("region", { name: "Active tasks" })
          .elements()
          .some((element) => element.checkVisibility()),
      )
      .toBe(openMenu);

    // Include the Drawer portal and obscured page: the task owns the only diagnostic entry.
    await expect
      .poll(
        () =>
          page
            .getByRole("button", {
              name: "View diagnostic information",
              exact: true,
              includeHidden: true,
            })
            .elements().length,
      )
      .toBe(1);
    await expect.element(page.getByText(detail)).not.toBeInTheDocument();
    await expect
      .element(page.getByText("Unable to start Codex GUI", { exact: true }))
      .not.toBeInTheDocument();
  },
);

test.each([
  { name: "A named task", expectedTitle: "A named task" },
  { name: null, expectedTitle: launchThreadId },
  { name: "", expectedTitle: launchThreadId },
])("App task menu uses only the title or UUID for name=$name", async ({ name, expectedTitle }) => {
  const preview = "Preview must never become the task menu title";
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(
    commands,
    attachWithSnapshotThread(attachResponse, {
      ...attachResponse.snapshot.thread,
      name,
      preview,
    }),
  );
  const screen = await renderWithProviders(<App />);
  initializeHost(getHostOptions(startGuiHostConnectionMock), commands);
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();

  await screen.getByRole("button", { name: "Menu", exact: true }).click();
  const tasks = page.getByRole("region", { name: "Active tasks" });
  await expect.element(tasks).toBeVisible();
  await expect
    .element(tasks.getByRole("button", { name: expectedTitle, exact: true }))
    .toHaveTextContent(expectedTitle);
  await expect.element(tasks.getByText(preview, { exact: true })).not.toBeInTheDocument();
});
