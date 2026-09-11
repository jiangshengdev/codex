import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  agentMessage,
  attachWithTurns,
  attachWithThreadId,
  baseTurn,
  inProgressTurn,
  failedTurn,
  interruptedTurn,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
  createDeferred,
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

test("offers fork at the end of a displayed completed turn", async () => {
  seedBrowserAuthorizationSession({ token: "fork-test" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands({ loadedThreadIds: [launchThreadId] });
  vi.mocked(commands.attachThreadProjection).mockResolvedValue(
    attachWithTurns(attachResponse, [
      baseTurn("fork-point", [agentMessage("answer", "Keep this answer")]),
    ]),
  );
  initializeHost(getHostOptions(host.startGuiHostConnection), commands);
  await expect.element(page.getByText("Keep this answer", { exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Fork from here", exact: true }))
    .toBeEnabled();
});

const forkId = "00000000-0000-0000-0000-000000000003";
const prefix = [baseTurn("fork-point", [agentMessage("answer", "Keep this answer")])];
const forkProjection = attachWithThreadId(attachWithTurns(attachResponse, prefix), forkId);
function forkResponse(): Awaited<ReturnType<GuiHostCommands["forkThread"]>> {
  return {
    thread: forkProjection.snapshot.thread,
    model: "gpt-5",
    modelProvider: "openai",
    serviceTier: null,
    cwd: attachResponse.snapshot.thread.cwd,
    instructionSources: [],
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: { type: "dangerFullAccess" },
    reasoningEffort: null,
  };
}

async function mountFork() {
  seedBrowserAuthorizationSession({ token: "fork-test" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands({ loadedThreadIds: [launchThreadId, forkId] });
  vi.mocked(commands.forkThread).mockResolvedValue(forkResponse());
  vi.mocked(commands.attachThreadProjection).mockImplementation(({ threadId }) =>
    Promise.resolve(
      threadId === forkId
        ? forkProjection
        : attachWithTurns(attachResponse, [
            ...prefix,
            inProgressTurn("later-turn", [agentMessage("later-answer", "Later output")]),
          ]),
    ),
  );
  initializeHost(getHostOptions(host.startGuiHostConnection), commands);
  await expect
    .element(page.getByRole("button", { name: "Fork from here", exact: true }))
    .toBeEnabled();
  return { router, commands };
}

test("forks the selected terminal prefix while the parent runs and sends new input to the fork", async () => {
  const { router, commands } = await mountFork();
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  await editor.fill("Parent draft");
  await page.getByRole("button", { name: "Fork from here", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${forkId}`);
  expect(commands.forkThread).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
    lastTurnId: "fork-point",
  });
  await expect.element(page.getByText("Later output", { exact: true })).not.toBeInTheDocument();
  await expect.element(page.getByText("Keep this answer", { exact: true })).toBeVisible();
  await expect.element(editor).not.toHaveTextContent("Parent draft");
  await editor.fill("Fork followup");
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => commands.startTurn).toHaveBeenCalledTimes(1);
  expect(vi.mocked(commands.startTurn).mock.calls[0]?.[0]).toMatchObject({ threadId: forkId });
  expect(commands.interruptTurn).not.toHaveBeenCalled();
  expect(commands.detachThreadProjection).not.toHaveBeenCalled();
  await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
  await expect.element(editor).toHaveTextContent("Parent draft");
});

test("retains a created ID after leaving the source and opens it without another create", async () => {
  const { router, commands } = await mountFork();
  const pending = createDeferred<Awaited<ReturnType<GuiHostCommands["forkThread"]>>>();
  vi.mocked(commands.forkThread).mockReturnValueOnce(pending.promise);
  await page.getByRole("button", { name: "Fork from here", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Fork from here", exact: true }))
    .toBeDisabled();
  await router.navigate({ to: "/history" });
  pending.resolve(forkResponse());
  await expect.element(page.getByRole("button", { name: "Open fork", exact: true })).toBeEnabled();
  expect(router.state.location.pathname).toBe("/history");
  expect(
    vi
      .mocked(commands.attachThreadProjection)
      .mock.calls.some(([params]) => params.threadId === forkId),
  ).toBe(false);
  await page.getByRole("button", { name: "Open fork", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${forkId}`);
  expect(commands.forkThread).toHaveBeenCalledTimes(1);
});

test("navigation recovery uses the created ID without reattaching or creating again", async () => {
  const { router, commands } = await mountFork();
  const navigate = vi
    .spyOn(router, "navigate")
    .mockRejectedValueOnce(new Error("Navigation failed"));
  await page.getByRole("button", { name: "Fork from here", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Open fork", exact: true })).toBeEnabled();
  const attaches = vi.mocked(commands.attachThreadProjection).mock.calls.length;
  await page.getByRole("button", { name: "Open fork", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${forkId}`);
  expect(commands.forkThread).toHaveBeenCalledTimes(1);
  expect(commands.attachThreadProjection).toHaveBeenCalledTimes(attaches);
  navigate.mockRestore();
});

test("unknown creation suggests history and a new click is a new request", async () => {
  const { commands } = await mountFork();
  vi.mocked(commands.forkThread).mockRejectedValueOnce(
    new GuiHostCommandError({
      source: "unavailable",
      delivery: "deliveryUnknown",
      error: new Error("Disconnected"),
    }),
  );
  await page.getByRole("button", { name: "Fork from here", exact: true }).click();
  await expect
    .element(
      page.getByText(
        "The result is unknown. Check history before forking again; another click may create an additional conversation.",
      ),
    )
    .toBeVisible();
  expect(commands.forkThread).toHaveBeenCalledTimes(1);
  await expect
    .element(page.getByRole("button", { name: "Open fork", exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Fork from here", exact: true }).click();
  await expect.poll(() => commands.forkThread).toHaveBeenCalledTimes(2);
});

test("a superseded navigation keeps the saved fork available", async () => {
  const { router, commands } = await mountFork();
  const navigate = vi.spyOn(router, "navigate").mockResolvedValueOnce(undefined);
  await page.getByRole("button", { name: "Fork from here", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Open fork", exact: true })).toBeEnabled();
  expect(router.state.location.pathname).toBe(`/task/${launchThreadId}`);
  await page.getByRole("button", { name: "Open fork", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${forkId}`);
  expect(commands.forkThread).toHaveBeenCalledTimes(1);
  navigate.mockRestore();
});

test("activation failure keeps the created fork available for another open", async () => {
  const { commands, router } = await mountFork();
  vi.mocked(commands.attachThreadProjection).mockRejectedValueOnce(new Error("Attach failed"));
  await page.getByRole("button", { name: "Fork from here", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Open fork", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Open fork", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${forkId}`);
  expect(commands.forkThread).toHaveBeenCalledTimes(1);
});

test("interrupted and failed displayed turns have actions while the running turn does not", async () => {
  seedBrowserAuthorizationSession({ token: "fork-test" });
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
  );
  await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands({ loadedThreadIds: [launchThreadId, forkId] });
  vi.mocked(commands.attachThreadProjection).mockResolvedValue(
    attachWithTurns(attachResponse, [
      interruptedTurn("interrupted", [agentMessage("partial", "Partial answer")]),
      failedTurn("failed", {
        message: "Turn failed",
        codexErrorInfo: null,
        additionalDetails: null,
        misalignment: null,
      }),
      inProgressTurn("running", [agentMessage("streaming", "Still running")]),
    ]),
  );
  initializeHost(getHostOptions(host.startGuiHostConnection), commands);
  await expect
    .element(
      page
        .getByRole("article", { name: "Turn interrupted", exact: true })
        .getByRole("button", { name: "Fork from here", exact: true }),
    )
    .toBeEnabled();
  await expect
    .element(
      page
        .getByRole("article", { name: "Turn failed", exact: true })
        .getByRole("button", { name: "Fork from here", exact: true }),
    )
    .toBeEnabled();
  await expect
    .element(
      page
        .getByRole("article", { name: "Turn running", exact: true })
        .getByRole("button", { name: "Fork from here", exact: true }),
    )
    .not.toBeInTheDocument();
});
