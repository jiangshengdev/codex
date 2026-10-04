import { Button, toast } from "@heroui/react";
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
import { attachmentFileInput } from "./appComposerQueueBrowserTestSupport";
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
  skillsListResponse,
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

const shortcutPlatforms = [
  {
    platform: "MacIntel",
    menu: "{Meta>}b{/Meta}",
    focus: "{Meta>}{Shift>}E{/Shift}{/Meta}",
    newSession: "{Meta>}{Shift>}O{/Shift}{/Meta}",
    previousTask: "{Control>}{Meta>}k{/Meta}{/Control}",
    nextTask: "{Control>}{Meta>}j{/Meta}{/Control}",
    menuModifiers: { metaKey: true },
  },
  {
    platform: "Win32",
    menu: "{Control>}b{/Control}",
    focus: "{Control>}{Alt>}e{/Alt}{/Control}",
    newSession: "{Control>}{Alt>}n{/Alt}{/Control}",
    previousTask: "{Control>}{Alt>}k{/Alt}{/Control}",
    nextTask: "{Control>}{Alt>}j{/Alt}{/Control}",
    menuModifiers: { ctrlKey: true },
  },
];

beforeEach(async () => {
  // Browser Mode retains pointer position between cases, including over a newly mounted Menu.
  await userEvent.unhover(document.body);
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
    disabledPluginIds: [],
    cwd,
    instructionSources: [],
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: { type: "dangerFullAccess" },
    reasoningEffort: null,
  };
}

async function mount(
  initialEntry = `/task/${launchThreadId}`,
  withDirectory = true,
  directory = cwd,
) {
  seedBrowserAuthorizationSession({ token: "new-session-test" });
  if (withDirectory && initialEntry === "/new") {
    const authorization = consumeBrowserAuthorizationSession({
      location: new URL("https://codex.test/new"),
      replaceState: () => undefined,
      storage: window.sessionStorage,
    });
    authorization.commitActiveThread(launchThreadId, directory);
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

test.each([
  ["MacIntel", "{Meta>}b{/Meta}"],
  ["Win32", "{Control>}b{/Control}"],
])(
  "menu shortcut toggles navigation from the editor and restores focus on %s",
  async (platform, shortcut) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { commands } = await mount();
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await editor.fill("keep my draft");
    await userEvent.keyboard(shortcut);
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect.element(dialog).toBeVisible();
    await userEvent.keyboard(shortcut);
    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(editor).toHaveFocus();
    await expect.element(editor).toHaveTextContent("keep my draft");
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);

test.each(shortcutPlatforms)(
  "focus shortcut returns to the current message without sending or changing its draft on $platform",
  async ({ platform, focus }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { commands } = await mount();
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await editor.fill("focus retained draft");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard(focus);
    await expect.element(editor).toHaveFocus();
    await expect.element(editor).toHaveTextContent("focus retained draft");
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);

async function expectWorkingDirectory(path: string) {
  await page.getByRole("button", { name: /^Working directory:/ }).click();
  const dialog = page.getByRole("dialog", { name: "Working directory", exact: true });
  await expect.element(dialog.getByText(path, { exact: true })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
}

test.each(shortcutPlatforms)(
  "new session shortcut reuses the unsent draft and preserves the original task draft on $platform",
  async ({ platform, newSession }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { router, commands } = await mount();
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await editor.fill("original task draft");
    await userEvent.keyboard(newSession);
    await expect.poll(() => router.state.location.pathname).toBe("/new");
    await editor.fill("unsent new draft");
    await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
    await expect.element(editor).toHaveTextContent("original task draft");
    await editor.click();
    await userEvent.keyboard(newSession);
    await expect.poll(() => router.state.location.pathname).toBe("/new");
    await expect.element(editor).toHaveTextContent("unsent new draft");
    expect(commands.startThread).not.toHaveBeenCalled();
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);

test.each(shortcutPlatforms)(
  "task shortcuts follow active list order, wrap and retain each task draft on $platform",
  async ({ platform, previousTask, nextTask }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { router, commands } = await mount();
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await editor.fill("first draft");
    await router.navigate({ to: "/task/$threadId", params: { threadId: otherThreadId } });
    await editor.fill("second draft");
    await router.navigate({ to: "/task/$threadId", params: { threadId: createdThreadId } });
    await editor.fill("third draft");
    await userEvent.keyboard(nextTask);
    await expect.poll(() => router.state.location.pathname).toBe(`/task/${launchThreadId}`);
    await expect.element(editor).toHaveTextContent("first draft");
    await editor.click();
    await userEvent.keyboard(previousTask);
    await expect.poll(() => router.state.location.pathname).toBe(`/task/${createdThreadId}`);
    await expect.element(editor).toHaveTextContent("third draft");
    await editor.click();
    await userEvent.keyboard(previousTask);
    await expect.poll(() => router.state.location.pathname).toBe(`/task/${otherThreadId}`);
    await expect.element(editor).toHaveTextContent("second draft");
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);

test.each(shortcutPlatforms)(
  "shortcut page supports navigation while focus remains a no-op on $platform",
  async ({ platform, menu, focus, newSession, nextTask }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { router, commands } = await mount();
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await editor.fill("draft kept across shortcut help");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("button", { name: "Keyboard shortcuts", exact: true }).click();
    await expect.poll(() => router.state.location.pathname).toBe("/shortcuts");
    await userEvent.keyboard(focus);
    expect(router.state.location.pathname).toBe("/shortcuts");
    await expect.element(editor).not.toBeInTheDocument();
    await userEvent.keyboard(menu);
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect.element(dialog).toBeVisible();
    await userEvent.keyboard(focus);
    await expect.element(dialog).toBeVisible();
    await userEvent.keyboard(menu);
    await expect.element(dialog).not.toBeInTheDocument();
    await userEvent.keyboard(newSession);
    await expect.poll(() => router.state.location.pathname).toBe("/new");
    await editor.fill("new draft kept across shortcut help");
    await router.navigate({ to: "/shortcuts" });
    await userEvent.keyboard(nextTask);
    await expect.poll(() => router.state.location.pathname).toBe(`/task/${launchThreadId}`);
    await expect.element(editor).toHaveTextContent("draft kept across shortcut help");
    await router.navigate({ to: "/shortcuts" });
    await userEvent.keyboard(newSession);
    await expect.element(editor).toHaveTextContent("new draft kept across shortcut help");
    expect(commands.startThread).not.toHaveBeenCalled();
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);

test.each(shortcutPlatforms)(
  "composition and repeated keydown do not trigger application shortcuts on $platform",
  async ({ platform, menu, newSession, menuModifiers }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { router, commands } = await mount();
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await editor.fill("unchanged");
    editor.element().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await userEvent.keyboard(menu);
    await userEvent.keyboard(newSession);
    await expect.element(page.getByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/task/${launchThreadId}`);
    editor.element().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    editor.element().dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "b",
        ...menuModifiers,
        repeat: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await expect.element(page.getByRole("dialog", { name: "Navigation" })).not.toBeInTheDocument();
    await expect.element(editor).toHaveTextContent("unchanged");
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);

test.each(shortcutPlatforms)(
  "unavailable new session and empty task list ignore shortcuts on $platform",
  async ({ platform, newSession, nextTask, previousTask, focus }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { router, commands } = await mount("/new", false);
    await expect
      .element(
        page.getByText("A working directory is required to start a session.", { exact: true }),
      )
      .toBeVisible();
    await userEvent.keyboard(newSession);
    await userEvent.keyboard(nextTask);
    await userEvent.keyboard(previousTask);
    await userEvent.keyboard(focus);
    expect(router.state.location.pathname).toBe("/new");
    expect(commands.startThread).not.toHaveBeenCalled();
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);

test.each(shortcutPlatforms)(
  "single task cycling retains its draft and disabled input cannot be focused on $platform",
  async ({ platform, nextTask, previousTask, focus }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { router, commands } = await mount();
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await editor.fill("only task draft");
    await userEvent.keyboard(nextTask);
    await userEvent.keyboard(previousTask);
    expect(router.state.location.pathname).toBe(`/task/${launchThreadId}`);
    await expect.element(editor).toHaveTextContent("only task draft");
    await openNewSession();
    const connection = getHostOptions(host.startGuiHostConnection);
    connection.onCommandsUnavailable?.();
    connection.onStatus?.({ label: "closed" });
    await expect.element(editor).toHaveAttribute("contenteditable", "false");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard(focus);
    await expect.element(page.getByRole("button", { name: "Menu", exact: true })).toHaveFocus();
    expect(commands.startTurn).not.toHaveBeenCalled();
  },
);

test("Windows leaves Ctrl+Shift+E available without focusing the composer", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  const { router, commands } = await mount();
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await editor.fill("retained Windows draft");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  menu.element().focus();
  const event = new KeyboardEvent("keydown", {
    key: "E",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });
  menu.element().dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  await expect.element(menu).toHaveFocus();
  await expect.element(editor).toHaveTextContent("retained Windows draft");
  expect(router.state.location.pathname).toBe(`/task/${launchThreadId}`);
  expect(commands.startThread).not.toHaveBeenCalled();
  expect(commands.startTurn).not.toHaveBeenCalled();
});

test.each([
  { reason: "AltGraph", modifiers: { modifierAltGraph: true } },
  { reason: "composition", modifiers: { isComposing: true } },
  { reason: "extra Shift", modifiers: { shiftKey: true } },
  { reason: "extra Meta", modifiers: { metaKey: true } },
])("Windows does not intercept shortcuts with $reason", async ({ modifiers }) => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  const { router, commands } = await mount();
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await editor.fill("retained modified-key draft");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  menu.element().focus();
  for (const key of ["n", "e", "j", "k"]) {
    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: true,
      altKey: true,
      ...modifiers,
      bubbles: true,
      cancelable: true,
    });
    menu.element().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  }
  await expect.element(menu).toHaveFocus();
  await expect.element(editor).toHaveTextContent("retained modified-key draft");
  expect(router.state.location.pathname).toBe(`/task/${launchThreadId}`);
  expect(commands.startThread).not.toHaveBeenCalled();
  expect(commands.startTurn).not.toHaveBeenCalled();
});

test.each(shortcutPlatforms)(
  "focus shortcut does nothing after the composer unmounts on history pages on $platform",
  async ({ platform, focus }) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
    const { router, commands } = await mount();
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await editor.fill("draft survives history navigation");
    const expectFocusUnavailable = async (pathname: string) => {
      await expect.element(editor).not.toBeInTheDocument();
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await userEvent.keyboard(focus);
      await expect.element(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
      expect(router.state.location.pathname).toBe(pathname);
      expect(commands.startThread).not.toHaveBeenCalled();
      expect(commands.startTurn).not.toHaveBeenCalled();
      await userEvent.keyboard("{Escape}");
    };
    await router.navigate({ to: "/history" });
    await expectFocusUnavailable("/history");
    await router.navigate({ to: "/history/$threadId", params: { threadId: otherThreadId } });
    await expectFocusUnavailable(`/history/${otherThreadId}`);
    await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
    await expect.element(editor).toHaveTextContent("draft survives history navigation");
  },
);

test.each(["/new", `/task/${launchThreadId}`])(
  "uses consistent message field geometry on %s",
  async (route) => {
    await mount(route);
    const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
    await expect.element(editor).toBeVisible();
    const panel = editor.element().closest('[data-slot="surface"]');
    if (!(panel instanceof HTMLElement)) throw new Error("message field must have a surface");
    const style = getComputedStyle(panel);
    expect(style.borderRadius).toBe("20px");
    expect(style.padding).toBe("8px");
    expect(style.borderWidth).toBe("0px");
    expect(getComputedStyle(editor.element()).minHeight).toBe("96px");
    expect(style.boxShadow).not.toBe("none");
    const attach = page.getByRole("button", { name: "Attach files", exact: true });
    const send = page.getByRole("button", { name: "Send", exact: true });
    await expect.element(attach).toBeVisible();
    await expect.element(send).toBeVisible();
    await expect
      .poll(() => {
        const attachmentBounds = attach.element().getBoundingClientRect();
        const sendBounds = send.element().getBoundingClientRect();
        return Math.abs(
          attachmentBounds.top +
            attachmentBounds.height / 2 -
            (sendBounds.top + sendBounds.height / 2),
        );
      })
      .toBeLessThanOrEqual(1);
  },
);

test.each([
  { route: "/new", width: 1280 },
  { route: "/new", width: 390 },
  { route: `/task/${launchThreadId}`, width: 1280 },
  { route: `/task/${launchThreadId}`, width: 390 },
])(
  "keeps the toolbar usable with long text and attachments on $route at $width",
  async ({ route, width }) => {
    const originalViewport = { width: window.innerWidth, height: window.innerHeight };
    const upload = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() =>
        Promise.resolve(new Response("/tmp/layout-attachment.txt", { status: 201 })),
      );
    try {
      await page.viewport(width, 900);
      await mount(route);
      const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
      const attach = page.getByRole("button", { name: "Attach files", exact: true });
      const send = page.getByRole("button", { name: "Send", exact: true });
      const expectToolbar = async () => {
        await expect.element(attach).toBeInViewport();
        await expect.element(send).toBeInViewport();
        await expect
          .poll(() => {
            const left = attach.element().getBoundingClientRect();
            const right = send.element().getBoundingClientRect();
            return {
              aligned: Math.abs(left.top + left.height / 2 - right.top - right.height / 2) <= 1,
              separated: left.right <= right.left,
              withinViewport: left.left >= 0 && right.right <= width,
              noOverflow: document.documentElement.scrollWidth <= width,
              belowEditor:
                Math.min(left.top, right.top) >= editor.element().getBoundingClientRect().bottom,
            };
          })
          .toEqual({
            aligned: true,
            separated: true,
            withinViewport: true,
            noOverflow: true,
            belowEditor: true,
          });
      };
      await expectToolbar();
      await editor.fill("Long message content ".repeat(300));
      await expectToolbar();
      expect(editor.element().scrollHeight).toBeGreaterThan(editor.element().clientHeight);
      await attachmentFileInput().upload([
        new File(["first"], "first.txt"),
        new File(["second"], "second.txt"),
        new File(["third"], "third.txt"),
      ]);
      await expect.poll(() => editor.getByText("Uploaded", { exact: true }).all().length).toBe(3);
      await expectToolbar();
      await expect.element(send).toBeEnabled();
    } finally {
      upload.mockRestore();
      await page.viewport(originalViewport.width, originalViewport.height);
    }
  },
);

test("send follows nonblank draft content without creating an empty session", async () => {
  const { commands } = await mount("/new");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await expect.element(send).toBeDisabled();
  await editor.fill("   ");
  await expect.element(send).toBeDisabled();
  await userEvent.keyboard("{Enter}");
  expect(commands.startThread).not.toHaveBeenCalled();
  await editor.fill("message");
  await expect.element(send).toBeEnabled();
  await editor.fill("");
  await expect.element(send).toBeDisabled();
  await userEvent.keyboard("{Enter}");
  expect(commands.startThread).not.toHaveBeenCalled();
});

test.each([
  { platform: "MacIntel", shortcut: "{Meta>}{Enter}{/Meta}", visible: "↵" },
  { platform: "Win32", shortcut: "{Control>}{Enter}{/Control}", visible: "Enter" },
])("new session only sends with Enter on $platform", async ({ platform, shortcut, visible }) => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  const { commands } = await mount("/new");
  const editor = page.getByRole("combobox", { name: "Message Codex", exact: true });
  const send = page.getByRole("button", { name: "Send", exact: true });
  await editor.fill("Keep the first message");
  await expect.element(send).toBeEnabled();
  await expect.element(editor).not.toHaveAttribute("aria-keyshortcuts");
  await userEvent.keyboard(shortcut);
  await expect.element(editor).toHaveTextContent("Keep the first message");
  expect(commands.startThread).not.toHaveBeenCalled();
  expect(commands.startTurn).not.toHaveBeenCalled();
  await expect.element(send).toHaveAttribute("aria-keyshortcuts", "Enter");
  await userEvent.unhover(document.body);
  await userEvent.hover(send);
  const tooltip = page.getByRole("tooltip");
  await expect.element(tooltip).toHaveTextContent(visible);
  const key = tooltip.element().querySelector("kbd");
  expect(key).toHaveAttribute("aria-label", "Enter");
  expect(key).toHaveClass("kbd--light");
  await userEvent.unhover(send);
  await editor.click();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => vi.mocked(commands.startThread).mock.calls.length).toBe(1);
  await expect.poll(() => vi.mocked(commands.startTurn).mock.calls.length).toBe(1);
});

test("working directory reveals its selectable full path without changing the draft", async () => {
  const { commands } = await mount("/new", true, "/workspace/codex");
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await editor.fill("keep this draft");
  const directory = page.getByRole("button", { name: "Working directory: codex", exact: true });
  await expect.element(directory).toHaveTextContent("codex");
  await expect.element(page.getByText("/workspace/codex", { exact: true })).not.toBeInTheDocument();
  await directory.click();
  const dialog = page.getByRole("dialog", { name: "Working directory", exact: true });
  await expect.element(dialog).toHaveTextContent("/workspace/codex");
  await dialog.getByText("/workspace/codex", { exact: true }).tripleClick();
  expect(window.getSelection()?.getRangeAt(0).cloneContents().textContent).toBe("/workspace/codex");
  await expect.element(dialog.getByRole("button")).not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(directory).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(dialog).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(editor).toHaveTextContent("keep this draft");
  expect(commands.startThread).not.toHaveBeenCalled();
});

test("working directory remains available after disconnection without enabling send", async () => {
  const { commands } = await mount("/new", true, "/workspace/codex");
  await page.getByRole("combobox", { name: "Message Codex" }).fill("retained offline draft");
  const connection = getHostOptions(host.startGuiHostConnection);
  connection.onCommandsUnavailable?.();
  connection.onStatus?.({ label: "closed" });
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await expect.element(editor).toHaveTextContent("retained offline draft");
  await expect.element(editor).toHaveAttribute("contenteditable", "false");
  await expect
    .element(page.getByText("Connect to Codex to send this draft."))
    .not.toBeInTheDocument();
  await expectWorkingDirectory("/workspace/codex");
  await expect.element(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  expect(commands.startThread).not.toHaveBeenCalled();
});

test.each(["", "draft survives reconnect"])(
  "disconnected draft %s stays disabled until a new connection is ready",
  async (draft) => {
    const { commands } = await mount("/new");
    const editor = page.getByRole("combobox", { name: "Message Codex" });
    await expect.element(editor).toBeVisible();
    if (draft) await editor.fill(draft);
    const skillRequests = vi.mocked(commands.listSkills).mock.calls.length;
    const connection = getHostOptions(host.startGuiHostConnection);
    connection.onCommandsUnavailable?.();
    connection.onStatus?.({ label: "closed" });
    await expect.element(editor).toHaveAttribute("contenteditable", "false");
    await expect.element(editor).toHaveTextContent(draft);
    await editor.click();
    await userEvent.keyboard("x{Enter}");
    await expect.element(editor).toHaveTextContent(draft);
    expect(commands.listSkills).toHaveBeenCalledTimes(skillRequests);
    expect(commands.startThread).not.toHaveBeenCalled();
    await page.getByRole("button", { name: "Reconnect", exact: true }).click();
    await expect.element(editor).toHaveAttribute("contenteditable", "false");
    const replacement = createGuiHostCommands();
    initializeHost(getHostOptions(host.startGuiHostConnection, "latest"), replacement);
    await expect.element(editor).toHaveAttribute("contenteditable", "true");
    await expect.element(editor).toHaveTextContent(draft);
    const send = page.getByRole("button", { name: "Send", exact: true });
    await expect.poll(() => send.element().matches(":disabled")).toBe(draft.length === 0);
    await expect.poll(() => replacement.listSkills).toHaveBeenCalled();
    expect(replacement.startThread).not.toHaveBeenCalled();
    expect(replacement.startTurn).not.toHaveBeenCalled();
    await expectWorkingDirectory(cwd);
  },
);

test("entering the new page while disconnected keeps an empty disabled composer", async () => {
  const { router, commands } = await mount("/new");
  await expect.element(page.getByRole("combobox", { name: "Message Codex" })).toBeVisible();
  await router.navigate({ to: "/history" });
  const connection = getHostOptions(host.startGuiHostConnection);
  connection.onCommandsUnavailable?.();
  connection.onStatus?.({ label: "closed" });
  const skillRequests = vi.mocked(commands.listSkills).mock.calls.length;
  await router.navigate({ to: "/new" });
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await expect.element(editor).toBeVisible();
  await expect.element(editor).toHaveAttribute("contenteditable", "false");
  await expect.element(editor).toHaveTextContent("");
  await expectWorkingDirectory(cwd);
  expect(commands.listSkills).toHaveBeenCalledTimes(skillRequests);
  expect(commands.startThread).not.toHaveBeenCalled();
});

test("a late skill response from the disconnected session cannot replace the new catalog", async () => {
  const { router, commands } = await mount("/new");
  await expect.element(page.getByRole("combobox", { name: "Message Codex" })).toBeVisible();
  await router.navigate({ to: "/history" });
  const stale = createDeferred<Awaited<ReturnType<GuiHostCommands["listSkills"]>>>();
  vi.mocked(commands.listSkills).mockReturnValue(stale.promise);
  const requests = vi.mocked(commands.listSkills).mock.calls.length;
  await router.navigate({ to: "/new" });
  await expect
    .poll(() => vi.mocked(commands.listSkills).mock.calls.length)
    .toBeGreaterThan(requests);
  const connection = getHostOptions(host.startGuiHostConnection);
  connection.onCommandsUnavailable?.();
  connection.onStatus?.({ label: "closed" });
  await page.getByRole("button", { name: "Reconnect", exact: true }).click();
  const replacement = createGuiHostCommands();
  vi.mocked(replacement.listSkills).mockResolvedValue(
    skillsListResponse(cwd, [
      {
        name: "current-skill",
        description: "Skill from the current connection",
        path: `${cwd}/skills/current-skill/SKILL.md`,
        scope: "repo",
        enabled: true,
        pluginId: null,
      },
    ]),
  );
  initializeHost(getHostOptions(host.startGuiHostConnection, "latest"), replacement);
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await expect.element(editor).toHaveAttribute("contenteditable", "true");
  await editor.fill("$");
  const menu = page.getByRole("listbox", { name: "Typeahead menu" });
  await expect.element(menu).toHaveTextContent("current-skill");
  stale.resolve(skillsListResponse(cwd, []));
  await userEvent.keyboard("{Escape}");
  await editor.fill("");
  await editor.fill("$");
  await expect.element(menu).toHaveTextContent("current-skill");
  expect(replacement.startThread).not.toHaveBeenCalled();
});

test.each([
  ["/", "/"],
  ["/workspace/project/", "project"],
  ["/workspace/a directory", "a directory"],
  ["/workspace/a\\directory", "a\\directory"],
  ["C:\\workspace\\project", "project"],
])("working directory %s has a readable name and preserves the full path", async (path, name) => {
  await mount("/new", true, path);
  await expect
    .element(page.getByRole("button", { name: `Working directory: ${name}`, exact: true }))
    .toHaveTextContent(name);
  await expectWorkingDirectory(path);
});

test("long directory names and paths fit a narrow viewport", async () => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const name = "long-directory-name-".repeat(12);
  const path = `/workspace/${name}`;
  try {
    await page.viewport(375, 812);
    await mount("/new", true, path);
    const trigger = page.getByRole("button", { name: `Working directory: ${name}`, exact: true });
    await expect.element(trigger).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Working directory", exact: true });
    await expect.element(dialog.getByText(path, { exact: true })).toBeVisible();
    await expect
      .poll(() => {
        const rect = dialog.element().getBoundingClientRect();
        return rect.left >= 0 && rect.right <= window.innerWidth;
      })
      .toBe(true);
    expect(dialog.element().scrollWidth).toBeLessThanOrEqual(dialog.element().clientWidth);
  } finally {
    await page.viewport(viewport.width, viewport.height);
  }
});

test("menu opens one directory-bound draft, retains it across other directories, and creates only on send", async () => {
  const { router, commands } = await mount();
  await expect.element(page.getByRole("combobox", { name: "Message Codex" })).toBeVisible();
  await openNewSession();
  const editor = page.getByRole("combobox", { name: "Message Codex" });
  await editor.fill("first new message");
  expect(commands.startThread).not.toHaveBeenCalled();
  await expectWorkingDirectory(cwd);
  await expect.poll(() => document.title).toBe("New session · Codex");
  expect(document.querySelector('[data-app-shell-content-layout="reading"]')).not.toBeNull();

  await router.navigate({ to: "/task/$threadId", params: { threadId: otherThreadId } });
  await expect
    .poll(() => commands.attachThreadProjection)
    .toHaveBeenCalledWith({ threadId: otherThreadId });
  await expect.element(editor).toBeVisible();
  await openNewSession();
  await expect.element(editor).toHaveTextContent("first new message");
  await expectWorkingDirectory(cwd);
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
    await expectWorkingDirectory("/other-directory");
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
      .element(page.getByRole("button", { name: "Send", exact: true }))
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
  await expectWorkingDirectory(cwd);
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
  const originalViewport = { width: window.innerWidth, height: window.innerHeight };
  const reference = await renderWithProviders(
    <>
      <Button size="sm">Compact reference</Button>
      <Button size="md">Page action reference</Button>
    </>,
  );
  try {
    for (const width of [375, 1280]) {
      await page.viewport(width, 900);
      const compactHeight = reference
        .getByRole("button", { name: "Compact reference", exact: true })
        .element()
        .getBoundingClientRect().height;
      const regularHeight = reference
        .getByRole("button", { name: "Page action reference", exact: true })
        .element()
        .getBoundingClientRect().height;
      await expect
        .poll(
          () =>
            page
              .getByRole("alert")
              .getByRole("button", { name: "View diagnostic information", exact: true })
              .element()
              .getBoundingClientRect().height,
        )
        .toBe(compactHeight);
      await expect
        .poll(
          () =>
            page
              .getByRole("button", { name: "Send", exact: true })
              .element()
              .getBoundingClientRect().height,
        )
        .toBe(regularHeight);
    }
  } finally {
    await reference.unmount();
    await page.viewport(originalViewport.width, originalViewport.height);
  }
  const retry = createDeferred<Awaited<ReturnType<GuiHostCommands["startThread"]>>>();
  vi.mocked(commands.startThread).mockReturnValueOnce(retry.promise);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const sending = page.getByRole("button", { name: "Sending", exact: true });
  await expect.element(sending).toBeDisabled();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent(
      "The creation result is unknown. Retrying may leave an extra empty session.",
    );
  await page.getByRole("button", { name: "View diagnostic information" }).click();
  await expect
    .element(page.getByRole("dialog", { name: "Diagnostic information" }))
    .toHaveTextContent("response lost");
  await userEvent.keyboard("{Escape}");
  await expect
    .element(page.getByRole("dialog", { name: "Diagnostic information" }))
    .not.toBeInTheDocument();
  retry.reject(new Error("creation rejected again"));
  await expect.element(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "View diagnostic information" }).click();
  await expect
    .element(page.getByRole("dialog", { name: "Diagnostic information" }))
    .toHaveTextContent("creation rejected again");
  await userEvent.keyboard("{Escape}");
  await expect
    .element(page.getByRole("dialog", { name: "Diagnostic information" }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${createdThreadId}`);
  expect(commands.startThread).toHaveBeenCalledTimes(3);
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
  await expect.element(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
  expect(commands.startTurn).not.toHaveBeenCalled();
  queueAttachProjectionResponse(commands, created);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => router.state.location.pathname).toBe(`/task/${createdThreadId}`);
  expect(commands.startThread).toHaveBeenCalledTimes(1);
  await expect.poll(() => commands.startTurn).toHaveBeenCalledTimes(1);
});
