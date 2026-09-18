import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { consumeBrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { attachWithThreadId } from "@/features/projection/__tests__/projectionTestBuilders";
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
} from "../appBrowserTestSupport";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));

const otherThreadId = "00000000-0000-0000-0000-000000000002";
const routes = ["/new", `/task/${launchThreadId}`];
const composer = () => page.getByRole("combobox", { name: "Message Codex", exact: true });
const panel = () => {
  const element = composer().element().closest('[data-slot="surface"]');
  if (!(element instanceof HTMLElement)) throw new Error("composer surface must render");
  return element;
};
const paint = () => {
  const style = getComputedStyle(panel());
  return { boxShadow: style.boxShadow, outline: style.outline };
};

beforeEach(async () => {
  resetAppBrowserTestSupport(host.startGuiHostConnection);
  await userEvent.unhover(document.body);
});
afterEach(() => vi.restoreAllMocks());

async function mount(route: string) {
  seedBrowserAuthorizationSession({ token: "composer-surface-test" });
  const authorization = consumeBrowserAuthorizationSession({
    location: new URL("https://codex.test/new"),
    replaceState: () => undefined,
    storage: window.sessionStorage,
  });
  authorization.commitActiveThread(launchThreadId, attachResponse.snapshot.thread.cwd);
  authorization.clearActiveThread();
  const router = createAppRouter(createMemoryHistory({ initialEntries: [route] }));
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const commands = createGuiHostCommands({ loadedThreadIds: [launchThreadId, otherThreadId] });
  vi.mocked(commands.attachThreadProjection).mockImplementation(({ threadId }) =>
    Promise.resolve(attachWithThreadId(attachResponse, threadId)),
  );
  initializeHost(getHostOptions(host.startGuiHostConnection), commands);
  await expect.element(composer()).toBeVisible();
  return { router, screen, commands };
}

test.each(routes)(
  "shows keyboard focus, preserves pointer editing, and clears paint on blur on %s",
  async (route) => {
    await mount(route);
    composer().element().blur();
    await nextFrame();
    await expect.poll(() => panel().getAnimations().length).toBe(0);
    const resting = paint();
    await composer().click();
    await expect.element(composer()).toHaveFocus();
    await userEvent.keyboard("x");
    await expect.element(composer()).toHaveTextContent("x");
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    await expect.element(composer()).toHaveFocus();
    await expect.element(panel()).toHaveAttribute("data-focus-visible", "true");
    await expect.poll(paint).not.toEqual(resting);
    await composer().click();
    await expect.element(panel()).toHaveAttribute("data-focus-visible", "false");
    composer().element().blur();
    await expect.poll(paint).toEqual(resting);
  },
);

const nextFrame = (): Promise<void> =>
  new Promise((resolve) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        resolve();
      }),
    ),
  );

function installViewport() {
  const original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  const viewport = Object.assign(new EventTarget(), { height: 699, offsetTop: 0 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(699);
  const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
  return {
    scrollBy,
    async resize(height = 361) {
      viewport.height = height;
      viewport.dispatchEvent(new Event("resize"));
      await nextFrame();
    },
    restore() {
      if (original) Object.defineProperty(window, "visualViewport", original);
    },
  };
}

function setComposerBottom(bottom: number) {
  const shell = page.getByRole("region", { name: "Message composer", exact: true }).element();
  return vi
    .spyOn(shell, "getBoundingClientRect")
    .mockReturnValue(new DOMRect(0, bottom - 152, 390, 152));
}

test.each(routes)(
  "reveals a covered editor once per focus and ignores blur on %s",
  async (route) => {
    const viewport = installViewport();
    try {
      await mount(route);
      await composer().click();
      setComposerBottom(699);
      viewport.scrollBy.mockClear();
      await viewport.resize();
      expect(viewport.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 346, behavior: "smooth" });
      await viewport.resize();
      expect(viewport.scrollBy).toHaveBeenCalledTimes(1);
      composer().element().blur();
      await composer().click();
      composer().element().blur();
      viewport.scrollBy.mockClear();
      await viewport.resize();
      expect(viewport.scrollBy).not.toHaveBeenCalled();
    } finally {
      viewport.restore();
    }
  },
);

test.each(routes)("does not scroll an already visible editor on %s", async (route) => {
  const viewport = installViewport();
  try {
    await mount(route);
    await composer().click();
    setComposerBottom(361);
    viewport.scrollBy.mockClear();
    await viewport.resize();
    expect(viewport.scrollBy).not.toHaveBeenCalled();
  } finally {
    viewport.restore();
  }
});

test.each(routes)(
  "cancels pending viewport work when the application unmounts on %s",
  async (route) => {
    const viewport = installViewport();
    try {
      const { screen } = await mount(route);
      await composer().click();
      setComposerBottom(699);
      viewport.scrollBy.mockClear();
      const pendingResize = viewport.resize();
      await screen.unmount();
      await pendingResize;
      await viewport.resize();
      expect(viewport.scrollBy).not.toHaveBeenCalled();
    } finally {
      viewport.restore();
    }
  },
);

test("rebinds focus and viewport handling after route changes and task instance remounts", async () => {
  const viewport = installViewport();
  try {
    const { router } = await mount("/new");
    const targets = [`/task/${launchThreadId}`, `/task/${otherThreadId}`, "/new"];
    for (const target of targets) {
      const previous = composer().element();
      await composer().click();
      const previousBounds = setComposerBottom(699);
      // Leave a resize callback pending when the route replaces the editor.
      const pendingResize = viewport.resize();
      await router.navigate({ to: target });
      await pendingResize;
      await expect.poll(() => previous.isConnected).toBe(false);
      previousBounds.mockClear();
      viewport.scrollBy.mockClear();
      await expect.element(composer()).toBeVisible();
      await composer().click();
      setComposerBottom(699);
      await userEvent.tab();
      await userEvent.tab({ shift: true });
      await expect.element(composer()).toHaveFocus();
      await expect.element(panel()).toHaveAttribute("data-focus-visible", "true");
      viewport.scrollBy.mockClear();
      await viewport.resize();
      await viewport.resize();
      expect(viewport.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 346, behavior: "smooth" });
      expect(previousBounds).not.toHaveBeenCalled();
    }
  } finally {
    viewport.restore();
  }
});

test("hands the first send to a fresh task composer without retaining old viewport callbacks", async () => {
  const viewport = installViewport();
  try {
    const { commands } = await mount("/new");
    vi.mocked(commands.startThread).mockResolvedValue({
      thread: attachWithThreadId(attachResponse, otherThreadId).snapshot.thread,
      model: "gpt-5",
      modelProvider: "openai",
      serviceTier: null,
      cwd: attachResponse.snapshot.thread.cwd,
      instructionSources: [],
      approvalPolicy: "on-request",
      approvalsReviewer: "user",
      sandbox: { type: "dangerFullAccess" },
      reasoningEffort: null,
    });
    await composer().fill("First message");
    const previous = composer().element();
    const previousBounds = setComposerBottom(699);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect.poll(() => previous.isConnected).toBe(false);
    await expect.poll(() => vi.mocked(commands.startTurn).mock.calls.length).toBe(1);
    previousBounds.mockClear();
    viewport.scrollBy.mockClear();
    await composer().click();
    setComposerBottom(699);
    viewport.scrollBy.mockClear();
    await viewport.resize();
    await viewport.resize();
    expect(viewport.scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 346, behavior: "smooth" });
    expect(previousBounds).not.toHaveBeenCalled();
  } finally {
    viewport.restore();
  }
});
