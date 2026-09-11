import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { beforeEach, expect, test, vi } from "vitest";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  contextCompaction,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
  createGuiHostCommands,
  createDeferred,
  getHostOptions,
  initializeHost,
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

test("history URL selects the target context page and aligns the turn end", async () => {
  const url = `/history/${launchThreadId}?turnId=target&position=end`;
  window.history.replaceState({}, "", url);
  seedBrowserAuthorizationSession({ token: "position-test-secret" });
  const fixture = attachWithTurns(attachResponse, [
    baseTurn("target", [
      userMessage("prompt", [textInput("History line.\n".repeat(100))]),
      agentMessage("answer", "Target end", "final_answer"),
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
  await expect.element(screen.getByText("Latest page", { exact: true })).not.toBeInTheDocument();
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
    to: "/history/$threadId",
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
