import { toast } from "@heroui/react";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import { attachWithThreadId } from "@/features/projection/__tests__/projectionTestBuilders";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
  createDeferred,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
} from "./appBrowserTestSupport";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));

const createdThreadId = "00000000-0000-0000-0000-000000000003";
const otherThreadId = "00000000-0000-0000-0000-000000000002";
const cwd = attachResponse.snapshot.thread.cwd;
const created = attachWithThreadId(attachResponse, createdThreadId);

beforeEach(() => {
  resetAppBrowserTestSupport(host.startGuiHostConnection);
});
afterEach(() => {
  toast.clear();
});

function creationResponse(): Awaited<ReturnType<GuiHostCommands["startThread"]>> {
  return {
    thread: created.snapshot.thread,
    model: "gpt-5",
    modelProvider: "openai",
    serviceTier: null,
    cwd,
    instructionSources: [],
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: { type: "dangerFullAccess" },
    reasoningEffort: null,
  };
}

async function mount(initialEntry = `/task/${launchThreadId}`, withDirectory = true) {
  seedBrowserAuthorizationSession({ token: "new-session-test" });
  if (withDirectory && initialEntry === "/new") {
    const authorization = consumeBrowserAuthorizationSession({
      location: new URL("https://codex.test/new"),
      replaceState: () => undefined,
      storage: window.sessionStorage,
    });
    authorization.commitActiveThread(launchThreadId, cwd);
    authorization.clearActiveThread();
  }
  const router = createAppRouter(createMemoryHistory({ initialEntries: [initialEntry] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands({
    loadedThreadIds: [launchThreadId, otherThreadId, createdThreadId],
  });
  vi.mocked(commands.startThread).mockResolvedValue(creationResponse());
  vi.mocked(commands.attachThreadProjection).mockImplementation(({ threadId }) => {
    const response = attachWithThreadId(attachResponse, threadId);
    return Promise.resolve(
      threadId === otherThreadId
        ? {
            ...response,
            snapshot: {
              ...response.snapshot,
              thread: { ...response.snapshot.thread, cwd: "/other-directory" },
            },
          }
        : response,
    );
  });
  initializeHost(getHostOptions(host.startGuiHostConnection), commands);
  return { screen, router, commands };
}

async function openNewSession() {
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "New session", exact: true })
    .click();
  await expect.element(page.getByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("heading", { name: "New session", exact: true }))
    .toBeVisible();
}

test("menu opens one directory-bound draft, retains it across other directories, and creates only on send", async () => {
  const { router, commands } = await mount();
  await expect.element(page.getByRole("combobox", { name: "Message Codex" })).toBeVisible();
  await openNewSession();
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await editor.fill("first new message");
  expect(commands.startThread).not.toHaveBeenCalled();
  await expect.element(page.getByText(`Working directory: ${cwd}`, { exact: true })).toBeVisible();
  await expect.poll(() => document.title).toBe("New session · Codex");
  expect(document.querySelector('[data-app-shell-content-layout="reading"]')).not.toBeNull();

  await router.navigate({ to: "/task/$threadId", params: { threadId: otherThreadId } });
  await expect
    .poll(() => commands.attachThreadProjection)
    .toHaveBeenCalledWith({ threadId: otherThreadId });
  await expect.element(editor).toBeVisible();
  await openNewSession();
  await expect.element(editor).toHaveTextContent("first new message");
  await expect.element(page.getByText(`Working directory: ${cwd}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect
    .element(navigation.getByRole("button", { name: "New session", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(navigation.getByRole("button", { name: "History", exact: true }))
    .not.toHaveAttribute("aria-current");
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${createdThreadId}`);
  expect(commands.startThread).toHaveBeenCalledExactlyOnceWith({ cwd });
  await expect.poll(() => commands.startTurn).toHaveBeenCalledTimes(1);
  expect(vi.mocked(commands.startTurn).mock.calls[0]?.[0]).toMatchObject({
    threadId: createdThreadId,
    input: [{ type: "text", text: "first new message" }],
  });
  expect(commands.resumeThread).not.toHaveBeenCalled();
  expect(commands.detachThreadProjection).not.toHaveBeenCalled();
});

test("new-session directory follows the viewed task when persisting its selection fails", async () => {
  const { router, commands } = await mount();
  await expect.element(page.getByRole("combobox", { name: "Message Codex" })).toBeVisible();
  const storageKey = "codex-gui.browserAuthorizationSession.v1";
  const storedSelection = window.sessionStorage.getItem(storageKey);
  const setItem = window.sessionStorage.setItem.bind(window.sessionStorage);
  const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
    if (key === storageKey) throw new Error("Selection storage unavailable");
    setItem(key, value);
  });
  try {
    await router.navigate({ to: "/task/$threadId", params: { threadId: otherThreadId } });
    await expect
      .poll(() => commands.attachThreadProjection)
      .toHaveBeenCalledWith({ threadId: otherThreadId });
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent("The task list could not be updated.");
    await expect.element(page.getByRole("combobox", { name: "Message Codex" })).toBeVisible();
    expect(window.sessionStorage.getItem(storageKey)).toBe(storedSelection);
    await openNewSession();
    await expect
      .element(page.getByText("Working directory: /other-directory", { exact: true }))
      .toBeVisible();
    expect(commands.startThread).not.toHaveBeenCalled();
  } finally {
    storageWrite.mockRestore();
  }
});

test("navigation failure after queue acceptance leaves no resendable draft and exposes the created session", async () => {
  const { router, commands } = await mount("/new");
  await page.getByRole("combobox", { name: "Message Codex" }).fill("accepted before navigation");
  const navigation = vi
    .spyOn(router, "navigate")
    .mockRejectedValueOnce(new Error("New session navigation failed"));
  try {
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => commands.startTurn).toHaveBeenCalledTimes(1);
    await expect
      .element(page.getByRole("button", { name: "Menu", exact: true }))
      .toHaveAccessibleDescription("Tasks or the connection need attention.");
    expect(router.state.location.pathname).toBe("/new");
    expect(commands.startThread).toHaveBeenCalledExactlyOnceWith({ cwd });
    await expect
      .element(page.getByRole("combobox", { name: "Message Codex" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: "Retry", exact: true }))
      .not.toBeInTheDocument();
  } finally {
    navigation.mockRestore();
  }
  await openNewSession();
  await expect.element(page.getByRole("combobox", { name: "Message Codex" })).toHaveTextContent("");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Current task", exact: true })
    .click();
  await expect.element(page.getByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${createdThreadId}`);
  const failure = page.getByRole("alert");
  await expect.element(failure).toHaveTextContent("The task could not be opened.");
  await failure.getByRole("button", { name: "View diagnostic information" }).click();
  await expect
    .element(page.getByRole("dialog", { name: "Diagnostic information" }))
    .toHaveTextContent("New session navigation failed");
  expect(commands.startThread).toHaveBeenCalledTimes(1);
  expect(commands.startTurn).toHaveBeenCalledTimes(1);
});

test("a refreshed new route uses retained directory but drops the unsent draft", async () => {
  const first = await mount("/new");
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await editor.fill("tab local only");
  await first.screen.unmount();
  const router = createAppRouter(createMemoryHistory({ initialEntries: ["/new"] }));
  await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands();
  initializeHost(getHostOptions(host.startGuiHostConnection), commands);
  await expect.element(editor).toBeVisible();
  await expect.element(editor).toHaveTextContent("");
  await expect.element(page.getByText(`Working directory: ${cwd}`, { exact: true })).toBeVisible();
  expect(commands.startThread).not.toHaveBeenCalled();
  expect(commands.startTurn).not.toHaveBeenCalled();
});

test("missing directory disables new-session navigation and never creates", async () => {
  const { commands } = await mount("/new", false);
  await expect
    .element(page.getByText("A working directory is required to start a session.", { exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect
    .element(page.getByRole("navigation").getByRole("button", { name: "New session", exact: true }))
    .toBeDisabled();
  expect(commands.startThread).not.toHaveBeenCalled();
});

test("unknown creation retains input and retries only after an explicit action", async () => {
  const { commands, router } = await mount("/new");
  vi.mocked(commands.startThread).mockRejectedValueOnce(
    new GuiHostCommandError({
      source: "unavailable",
      delivery: "deliveryUnknown",
      error: new Error("response lost"),
    }),
  );
  await page.getByRole("combobox", { name: "Message Codex" }).fill("retry explicitly");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent(
      "The creation result is unknown. Retrying may leave an extra empty session.",
    );
  expect(commands.startThread).toHaveBeenCalledTimes(1);
  expect(commands.startTurn).not.toHaveBeenCalled();
  await expect
    .element(page.getByRole("combobox", { name: "Message Codex" }))
    .toHaveTextContent("retry explicitly");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${createdThreadId}`);
  expect(commands.startThread).toHaveBeenCalledTimes(2);
  await expect.poll(() => commands.startTurn).toHaveBeenCalledTimes(1);
});

test("leaving while creation waits does not activate its late ID; returning reuses it", async () => {
  const { commands, router } = await mount("/new");
  const response = createDeferred<Awaited<ReturnType<GuiHostCommands["startThread"]>>>();
  vi.mocked(commands.startThread).mockReturnValueOnce(response.promise);
  await page.getByRole("combobox", { name: "Message Codex" }).fill("late creation");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => commands.startThread).toHaveBeenCalledTimes(1);
  await router.navigate({ to: "/history" });
  response.resolve(creationResponse());
  await router.navigate({ to: "/new" });
  await expect.element(page.getByRole("button", { name: "Retry", exact: true })).toBeEnabled();
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
  expect(commands.startTurn).not.toHaveBeenCalled();
  queueAttachProjectionResponse(commands, created);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${createdThreadId}`);
  expect(commands.startThread).toHaveBeenCalledTimes(1);
  await expect.poll(() => commands.startTurn).toHaveBeenCalledTimes(1);
});
