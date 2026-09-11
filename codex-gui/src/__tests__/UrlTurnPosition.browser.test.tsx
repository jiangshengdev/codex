import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  itemCompleted,
  contextCompaction,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { eventItemCompleted } from "@/features/projection/__tests__/projectionFixtures";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
  createGuiHostCommands,
  createDeferred,
  getHostOptions,
  initializeHost,
  emitProjectionEvent,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
} from "./appBrowserTestSupport";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

beforeEach(() => {
  resetAppBrowserTestSupport(guiHostClientMock.startGuiHostConnection);
});

test("an existing empty turn is not reported as missing", async () => {
  const url = `/history/${launchThreadId}?turnId=empty-turn&position=end`;
  window.history.replaceState({}, "", url);
  seedBrowserAuthorizationSession({ token: "position-test-secret" });
  const fixture = attachWithTurns(attachResponse, [baseTurn("empty-turn", [])]);
  const commands = createGuiHostCommands();
  vi.mocked(commands.readThread).mockResolvedValue({ thread: fixture.snapshot.thread });
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  initializeHost(getHostOptions(guiHostClientMock.startGuiHostConnection), commands);
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        resolve();
      }),
    ),
  );
  await expect
    .element(screen.getByText("The specified turn was not found."))
    .not.toBeInTheDocument();
});

test.each(["history", "task"] as const)(
  "%s URL selects the target context page and aligns the turn end",
  async (route) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    await page.viewport(390, 720);
    try {
      const url = `/${route}/${launchThreadId}?turnId=target&position=end`;
      window.history.replaceState({}, "", url);
      seedBrowserAuthorizationSession({ token: "position-test-secret" });
      const fixture = attachWithTurns(attachResponse, [
        baseTurn("target", [
          userMessage("prompt", [textInput("History line.\n".repeat(100))]),
          contextCompaction("within-target"),
          agentMessage(
            "answer",
            `${"After compaction.\n\n".repeat(100)}Target end`,
            "final_answer",
          ),
        ]),
        baseTurn("latest", [
          contextCompaction("compact"),
          userMessage("latest-prompt", [textInput("Latest page")]),
        ]),
      ]);
      const commands = createGuiHostCommands();
      vi.mocked(commands.readThread).mockResolvedValue({ thread: fixture.snapshot.thread });
      queueAttachProjectionResponse(commands, fixture);
      const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
      const screen = await renderWithProviders(<RouterProvider router={router} />);
      initializeHost(getHostOptions(guiHostClientMock.startGuiHostConnection), commands);
      await expect.element(screen.getByText("Target end", { exact: true })).toBeVisible();
      await expect
        .element(screen.getByText("Latest page", { exact: true }))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: "Context page 2", exact: true }))
        .toHaveAttribute("aria-current", "page");
      const turn = screen.getByRole("article", { name: "Turn target", exact: true });
      await expect
        .poll(() => {
          const end = turn.element().getBoundingClientRect().bottom;
          const panel = screen.container.querySelector(".task-bottom-shell");
          if (!(panel instanceof HTMLElement)) throw new Error("Missing history action panel");
          const bottom = Math.min(window.innerHeight, panel.getBoundingClientRect().top);
          return end > 0 && end <= bottom && bottom - end < 32;
        })
        .toBe(true);
      expect(router.state.location.search).toMatchObject({ turnId: "target", position: "end" });
      window.scrollTo({ top: 0, behavior: "instant" });
      await expect.poll(() => window.scrollY).toBe(0);
      await router.navigate({
        to: route === "history" ? "/history/$threadId" : "/task/$threadId",
        params: { threadId: launchThreadId },
        search: { turnId: "latest", position: "end" },
      });
      await expect.element(screen.getByText("Latest page", { exact: true })).toBeVisible();
      router.history.back();
      await expect.element(screen.getByText("Target end", { exact: true })).toBeVisible();
      await expect.poll(() => window.scrollY).toBeGreaterThan(100);
      window.scrollTo({ top: 0, behavior: "instant" });
      await expect.poll(() => window.scrollY).toBe(0);
      router.history.forward();
      await expect.element(screen.getByText("Latest page", { exact: true })).toBeVisible();
    } finally {
      await page.viewport(viewport.width, viewport.height);
    }
  },
);

test("leaving a positioning URL while history loads does not scroll the next conversation", async () => {
  const url = `/history/${launchThreadId}?turnId=target&position=end`;
  window.history.replaceState({}, "", url);
  seedBrowserAuthorizationSession({ token: "position-test-secret" });
  const fixture = attachWithTurns(attachResponse, [
    baseTurn("target", [userMessage("prompt", [textInput("Old conversation\n".repeat(100))])]),
  ]);
  const other = attachWithTurns(attachResponse, [
    baseTurn("other", [
      userMessage("other-prompt", [textInput("Other conversation\n".repeat(100))]),
    ]),
  ]);
  const otherThreadId = "00000000-0000-0000-0000-000000000002";
  const commands = createGuiHostCommands();
  const response = createDeferred<Awaited<ReturnType<typeof commands.readThread>>>();
  vi.mocked(commands.readThread).mockImplementation(({ threadId }) =>
    threadId === launchThreadId
      ? response.promise
      : Promise.resolve({ thread: { ...other.snapshot.thread, id: otherThreadId } }),
  );
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  initializeHost(getHostOptions(guiHostClientMock.startGuiHostConnection), commands);
  await expect.element(screen.getByText("Loading task history…")).toBeVisible();
  await router.navigate({
    to: "/history/$threadId",
    params: { threadId: otherThreadId },
    search: {},
  });
  await expect
    .element(screen.getByRole("article", { name: "Turn other", exact: true }))
    .toBeVisible();
  window.scrollTo({ top: 100, behavior: "instant" });
  const scrollBeforeResponse = window.scrollY;
  response.resolve({ thread: fixture.snapshot.thread });
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        resolve();
      }),
    ),
  );
  expect(window.scrollY).toBe(scrollBeforeResponse);
  await expect
    .element(screen.getByRole("article", { name: "Turn other", exact: true }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("article", { name: "Turn target", exact: true }))
    .not.toBeInTheDocument();
});

test.each([
  "turnId=target",
  "position=end",
  "turnId=&position=end",
  "turnId=target&position=start",
  "turnId=target&turnId=target&position=end",
  "turnId=target&position=end&position=end",
])("invalid positioning query uses the existing error page: %s", async (query) => {
  const url = `/history/${launchThreadId}?${query}`;
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  await expect
    .element(screen.getByRole("heading", { name: "Page not found", exact: true }))
    .toBeVisible();
});

test("current task output does not repeat a completed URL positioning request", async () => {
  const url = `/task/${launchThreadId}?turnId=target&position=end`;
  window.history.replaceState({}, "", url);
  seedBrowserAuthorizationSession({ token: "position-test-secret" });
  const fixture = attachWithTurns(attachResponse, [
    baseTurn("target", [
      agentMessage("initial-answer", "Existing output line.\n".repeat(100), "final_answer"),
    ]),
  ]);
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(commands, fixture);
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(guiHostClientMock.startGuiHostConnection);
  initializeHost(options, commands);
  await expect.poll(() => window.scrollY).toBeGreaterThan(100);
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        resolve();
      }),
    ),
  );
  window.scrollTo({ top: 0, behavior: "instant" });
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "position-output",
        "target",
        agentMessage("later-answer", "Output after positioning", "final_answer"),
      ),
      { parentCommitId: null },
    ),
  );
  await expect
    .element(screen.getByText("Output after positioning", { exact: true }))
    .toBeInTheDocument();
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        resolve();
      }),
    ),
  );
  expect(window.scrollY).toBe(0);
});

test.each([false, true])(
  "missing history turn waits for complete data and reports missing (empty=%s)",
  async (empty) => {
    const url = `/history/${launchThreadId}?turnId=missing&position=end`;
    window.history.replaceState({}, "", url);
    seedBrowserAuthorizationSession({ token: "position-test-secret" });
    const fixture = attachWithTurns(
      attachResponse,
      empty
        ? []
        : [baseTurn("latest", [userMessage("prompt", [textInput("Latest history\n".repeat(90))])])],
    );
    const commands = createGuiHostCommands();
    const response = createDeferred<Awaited<ReturnType<typeof commands.readThread>>>();
    vi.mocked(commands.readThread).mockReturnValue(response.promise);
    const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    initializeHost(getHostOptions(guiHostClientMock.startGuiHostConnection), commands);
    await expect.element(screen.getByText("Loading task history…")).toBeVisible();
    await expect
      .element(screen.getByText("The specified turn was not found."))
      .not.toBeInTheDocument();
    response.resolve({ thread: fixture.snapshot.thread });
    await expect.element(screen.getByText("The specified turn was not found.")).toBeVisible();
    await expect
      .poll(() => {
        const scroller = document.scrollingElement;
        if (!(scroller instanceof HTMLElement)) throw new Error("Missing document scroller");
        return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      })
      .toBeLessThanOrEqual(4);
  },
);
