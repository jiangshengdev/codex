import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { useEffect } from "react";
import {
  attachResponse,
  createDeferred,
  createGuiHostCommands,
  emitSkillsChanged,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getConnectionStartCount,
  getHostOptions,
  initializeHost,
  launchThreadId,
  markCommandsUnavailable,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
  skillsListResponse,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import {
  useActiveThreadSession,
  useActiveThreadSessionSnapshot,
} from "@/features/appShell/AppCapabilities";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import { eventTurnStarted } from "@/features/projection/__tests__/projectionFixtures";
import { attachWithThreadId } from "@/features/projection/__tests__/projectionTestBuilders";
import { selectThreadRuntimeRecord } from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import type { SkillMetadata, SkillsListResponse } from "@codex-protocol/v2";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));
vi.mock("@/features/composerInputQueue/composerInputQueueCoordinator", { spy: true });

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

const candidateThreadId = "00000000-0000-0000-0000-000000000002";
let threadSwitchProbeSession: ActiveThreadSession | null = null;

function ThreadSwitchCapabilityProbe() {
  const session = useActiveThreadSession();
  const snapshot = useActiveThreadSessionSnapshot();
  const available = snapshot.phase === "active" || snapshot.phase === "projectionUnavailable";
  useEffect(() => {
    threadSwitchProbeSession = session;
  }, [session]);

  return (
    <section aria-label="Thread switch capability probe">
      <button
        disabled={session == null || !available}
        onClick={() => {
          void session?.activate(candidateThreadId);
        }}
        type="button"
      >
        Continue candidate thread
      </button>
      <output aria-label="Active thread session">{available ? snapshot.threadId : "none"}</output>
      <output aria-label="Active skill catalog status">
        {available ? snapshot.skills.type : "none"}
      </output>
      <output aria-label="Active skill catalog">
        {available
          ? snapshot.skills.candidates.map(({ name }) => name).join(",") || "none"
          : "none"}
      </output>
    </section>
  );
}

function ThreadSwitchComposerProbe() {
  return (
    <>
      <ThreadSwitchCapabilityProbe />
      <CurrentTaskPage />
    </>
  );
}

const catalogSkill = (name: string, cwd: string, enabled = true): SkillMetadata => ({
  name,
  description: `${name} description`,
  path: `${cwd}/skills/${name}/SKILL.md`,
  scope: "repo",
  enabled,
  pluginId: null,
});

const requireThreadSwitchProbeSession = (): ActiveThreadSession => {
  if (threadSwitchProbeSession == null) {
    throw new Error("thread switch probe must expose an active session");
  }
  return threadSwitchProbeSession;
};

const waitForThreadSwitchProbeSession = async () => {
  await expect
    .poll(() => {
      const snapshot = threadSwitchProbeSession?.getSnapshot();
      return snapshot?.phase === "active" || snapshot?.phase === "projectionUnavailable";
    })
    .toBe(true);
  const session = requireThreadSwitchProbeSession();
  const snapshot = session.getSnapshot();
  if (snapshot.phase !== "active" && snapshot.phase !== "projectionUnavailable") {
    throw new Error("thread switch probe session must be available");
  }
  return { session, snapshot };
};

const renderThreadSwitchProbe = async (commands: GuiHostCommands) => {
  const screen = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchCapabilityProbe} />,
  );
  const options = getHostOptions(startGuiHostConnectionMock);
  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);
  const continueButton = screen.getByRole("button", { name: "Continue candidate thread" });
  await expect.element(continueButton).toBeEnabled();
  const { snapshot } = await waitForThreadSwitchProbeSession();
  expect(snapshot.threadId).toBe(launchThreadId);
  return { continueButton, options, screen };
};

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
  threadSwitchProbeSession = null;
});

const documentScroller = (): HTMLElement => {
  const scroller = document.scrollingElement;
  if (!(scroller instanceof HTMLElement)) {
    throw new Error("document.scrollingElement must be available");
  }

  return scroller;
};

const scrollToDocumentTop = (): void => {
  window.scrollTo({ top: 0 });
};

const expectHorizontalAlignment = (first: Element, second: Element): void => {
  const firstBounds = first.getBoundingClientRect();
  const secondBounds = second.getBoundingClientRect();
  expect(Math.abs(firstBounds.left - secondBounds.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(firstBounds.right - secondBounds.right)).toBeLessThanOrEqual(1);
};

const getAppComposer = (screen: Awaited<ReturnType<typeof renderWithProviders>>) =>
  screen.getByRole("combobox", { name: "Message Codex", exact: true });

const expectEditorReachable = async (editor: Element): Promise<void> => {
  await expect
    .poll(() => {
      const bounds = editor.getBoundingClientRect();
      // Use the same one-pixel geometry tolerance as the surrounding layout checks.
      // Probe inside every corner as well as the center to detect clipping or overlays.
      const insetX = Math.min(1, bounds.width / 2);
      const insetY = Math.min(1, bounds.height / 2);
      const points: (readonly [number, number])[] = [
        [bounds.left + insetX, bounds.top + insetY],
        [bounds.right - insetX, bounds.top + insetY],
        [bounds.left + insetX, bounds.bottom - insetY],
        [bounds.right - insetX, bounds.bottom - insetY],
        [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2],
      ];
      return {
        withinViewport:
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.left >= -1 &&
          bounds.top >= -1 &&
          bounds.right <= window.innerWidth + 1 &&
          bounds.bottom <= window.innerHeight + 1,
        canBeHit: points.every(([x, y]) => editor.contains(document.elementFromPoint(x, y))),
      };
    })
    .toEqual({ withinViewport: true, canBeHit: true });
};

const renderReadyApp = async (commandHandle = createGuiHostCommands()) => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  queueAttachProjectionResponse(commandHandle);
  initializeHost(options, commandHandle);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");

  return { commandHandle, options, screen };
};

afterEach(() => {
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
  scrollToDocumentTop();
});

test("App renders the committed transcript shell without visible host debug details", async () => {
  const { screen } = await renderReadyApp();
  const topNotices = screen.container.querySelector("[data-app-shell-top-notices]");

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "initialized");
  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
  expect(topNotices).toBeNull();
  expect(guiHostClientMock.startGuiHostConnection).toHaveBeenCalledTimes(1);
});

test("App renders composer in the shell without visible host debug details", async () => {
  const { screen } = await renderReadyApp();
  const transcriptBottomSentinel = screen.container.querySelector(
    ".committed-transcript-bottom-sentinel",
  );
  const composerShell = screen.container.querySelector('[aria-label="Message composer"]');

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
  if (
    !(transcriptBottomSentinel instanceof HTMLElement) ||
    !(composerShell instanceof HTMLElement)
  ) {
    throw new Error("transcript sentinel and composer shell must render");
  }
  expect(
    transcriptBottomSentinel.compareDocumentPosition(composerShell) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  await expectEditorReachable(getAppComposer(screen).element());
});

test("App keeps the skill menu anchored above the composer across responsive viewports", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  const activeFixture: { unmount: (() => Promise<void>) | null } = { unmount: null };

  const assertResponsiveMenuGeometry = async (width: number, height: number): Promise<void> => {
    await page.viewport(width, height);
    const commands = createGuiHostCommands();
    const cwd = attachResponse.snapshot.thread.cwd;
    vi.mocked(commands.listSkills).mockResolvedValue(
      skillsListResponse(
        cwd,
        Array.from({ length: 25 }, (_, index) => {
          const candidate = catalogSkill(`responsive-skill-${String(index).padStart(2, "0")}`, cwd);
          return index === 19
            ? {
                ...candidate,
                description: "A long responsive skill description with useful detail. ".repeat(12),
                path: `${cwd}/skills/${"long-path-token".repeat(24)}/SKILL.md`,
              }
            : candidate;
        }),
      ),
    );
    const { screen } = await renderReadyApp(commands);
    activeFixture.unmount = screen.unmount;
    const editor = getAppComposer(screen);
    const composerShell = screen.getByRole("region", { name: "Message composer" }).element();
    const composerPanel = composerShell.querySelector(".composer-panel");
    if (!(composerPanel instanceof HTMLElement)) {
      throw new Error("composer panel must render");
    }
    await expect.element(editor).toHaveAttribute("aria-expanded", "false");
    scrollToDocumentTop();
    await expectEditorReachable(editor.element());

    const scroller = documentScroller();
    const baselineDocumentSize = {
      height: scroller.scrollHeight,
      width: scroller.scrollWidth,
    };
    const baselineDocumentScrollTop = scroller.scrollTop;
    const baselineComposerBottom = composerShell.getBoundingClientRect().bottom;

    await editor.fill("$");
    const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
    await expect.poll(() => listbox.getByRole("option").length).toBe(25);
    expect(composerPanel.contains(listbox.element())).toBe(true);

    await expect
      .poll(() => {
        const menuBounds = listbox.element().getBoundingClientRect();
        const panelBounds = composerPanel.getBoundingClientRect();
        const composerBottom = composerShell.getBoundingClientRect().bottom;
        const visualViewport = window.visualViewport;
        const viewportTop = visualViewport?.offsetTop ?? 0;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const viewportBottom = viewportTop + viewportHeight;
        const currentScroller = documentScroller();

        return {
          composerBottomStable: Math.abs(composerBottom - baselineComposerBottom) <= 1,
          documentHeightStable: currentScroller.scrollHeight <= baselineDocumentSize.height + 1,
          documentWidthStable: currentScroller.scrollWidth <= baselineDocumentSize.width + 1,
          documentWithoutHorizontalOverflow:
            currentScroller.scrollWidth <= currentScroller.clientWidth + 1,
          menuFullyVisible:
            menuBounds.top >= viewportTop - 1 && menuBounds.bottom <= viewportBottom + 1,
          menuDoesNotOverlapComposer: menuBounds.bottom <= panelBounds.top + 1,
          menuWithinViewportWidth:
            menuBounds.left >= -1 && menuBounds.right <= window.innerWidth + 1,
        };
      })
      .toEqual({
        composerBottomStable: true,
        documentHeightStable: true,
        documentWidthStable: true,
        documentWithoutHorizontalOverflow: true,
        menuFullyVisible: true,
        menuDoesNotOverlapComposer: true,
        menuWithinViewportWidth: true,
      });

    const scrollRegion = screen.container.querySelector("[data-skill-menu-scroll-region]");
    if (!(scrollRegion instanceof HTMLElement)) {
      throw new Error("skill menu scroll region must render");
    }
    expect(listbox.element().contains(scrollRegion)).toBe(true);

    await screen.user.keyboard("{ArrowDown}".repeat(24));
    await expect
      .poll(() => {
        const activeOption = listbox
          .element()
          .querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
        if (activeOption == null) {
          return null;
        }
        const options = listbox.element().querySelectorAll<HTMLElement>('[role="option"]');
        const lastOption = options.item(options.length - 1);
        const activeBounds = activeOption.getBoundingClientRect();
        const scrollBounds = scrollRegion.getBoundingClientRect();
        const menuBounds = listbox.element().getBoundingClientRect();
        const panelBounds = composerPanel.getBoundingClientRect();
        const composerBottom = composerShell.getBoundingClientRect().bottom;
        const currentScroller = documentScroller();
        const visualViewport = window.visualViewport;
        const viewportTop = visualViewport?.offsetTop ?? 0;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;

        return {
          activeIsLastResult: activeOption === lastOption,
          activeVisibleInScrollRegion:
            activeBounds.top >= scrollBounds.top - 1 &&
            activeBounds.bottom <= scrollBounds.bottom + 1,
          activeCanBeHit: activeOption.contains(
            document.elementFromPoint(
              activeBounds.left + activeBounds.width / 2,
              activeBounds.top + activeBounds.height / 2,
            ),
          ),
          composerBottomStable: Math.abs(composerBottom - baselineComposerBottom) <= 1,
          documentHeightStable: currentScroller.scrollHeight <= baselineDocumentSize.height + 1,
          documentScrollTopStable:
            Math.abs(currentScroller.scrollTop - baselineDocumentScrollTop) <= 1,
          documentWidthStable: currentScroller.scrollWidth <= baselineDocumentSize.width + 1,
          documentWithoutHorizontalOverflow:
            currentScroller.scrollWidth <= currentScroller.clientWidth + 1,
          menuFullyVisible:
            menuBounds.top >= viewportTop - 1 &&
            menuBounds.bottom <= viewportTop + viewportHeight + 1,
          menuDoesNotOverlapComposer: menuBounds.bottom <= panelBounds.top + 1,
          menuWithinViewportWidth:
            menuBounds.left >= -1 && menuBounds.right <= window.innerWidth + 1,
          scrollRegionAdvanced: scrollRegion.scrollTop > 0,
        };
      })
      .toEqual({
        activeIsLastResult: true,
        activeVisibleInScrollRegion: true,
        activeCanBeHit: true,
        composerBottomStable: true,
        documentHeightStable: true,
        documentScrollTopStable: true,
        documentWidthStable: true,
        documentWithoutHorizontalOverflow: true,
        menuFullyVisible: true,
        menuDoesNotOverlapComposer: true,
        menuWithinViewportWidth: true,
        scrollRegionAdvanced: true,
      });

    await activeFixture.unmount();
    activeFixture.unmount = null;
  };

  try {
    await assertResponsiveMenuGeometry(400, 876);
    await assertResponsiveMenuGeometry(1440, 900);
  } finally {
    await activeFixture.unmount?.();
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("App keeps host lifecycle status stable while projection events update runtime", async () => {
  const screen = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchComposerProbe} />,
  );
  const { store } = screen;
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();

  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }
  await expect
    .poll(() => selectThreadRuntimeRecord(store.getState())?.threadId)
    .toBe(launchThreadId);
  const { session } = await waitForThreadSwitchProbeSession();
  emitProjectionEvent(options, eventTurnStarted);

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "initialized");
  await expect
    .poll(() => {
      const snapshot = session.getSnapshot();
      return snapshot.phase === "active" || snapshot.phase === "projectionUnavailable"
        ? snapshot.activeTurnId
        : null;
    })
    .toBe(eventTurnStarted.event.notification.turn.id);
});

test("App exposes the current cwd enabled skill catalog and refreshes it after invalidation", async () => {
  const commands = createGuiHostCommands();
  const cwd = attachResponse.snapshot.thread.cwd;
  vi.mocked(commands.listSkills)
    .mockResolvedValueOnce({
      data: [
        {
          cwd: "/workspace/other",
          skills: [catalogSkill("other-cwd", "/workspace/other")],
          errors: [],
        },
        {
          cwd,
          skills: [
            catalogSkill("enabled-current", cwd),
            catalogSkill("disabled-current", cwd, false),
          ],
          errors: [],
        },
      ],
    })
    .mockResolvedValueOnce(skillsListResponse(cwd, [catalogSkill("refreshed-current", cwd)]));
  const { options, screen } = await renderThreadSwitchProbe(commands);
  const catalogStatus = screen.getByLabelText("Active skill catalog status");
  const catalog = screen.getByLabelText("Active skill catalog", { exact: true });

  await expect.element(catalogStatus).toHaveTextContent("ready");
  await expect.element(catalog).toHaveTextContent(/^enabled-current$/);
  expect(commands.listSkills).toHaveBeenCalledExactlyOnceWith({
    cwds: [cwd],
    forceReload: false,
  });

  emitSkillsChanged(options);

  await expect.element(catalog).toHaveTextContent(/^refreshed-current$/);
  expect(commands.listSkills).toHaveBeenCalledTimes(2);
});

test("App isolates a replacement owner from the previous catalog settlement and drops unavailable targets", async () => {
  const commands = createGuiHostCommands();
  const currentCwd = attachResponse.snapshot.thread.cwd;
  const candidateCwd = "/workspace/candidate";
  const staleRefresh = createDeferred<SkillsListResponse>();
  vi.mocked(commands.listSkills)
    .mockResolvedValueOnce(skillsListResponse(currentCwd, [catalogSkill("current", currentCwd)]))
    .mockReturnValueOnce(staleRefresh.promise)
    .mockResolvedValueOnce(
      skillsListResponse(candidateCwd, [catalogSkill("candidate", candidateCwd)]),
    );
  const { continueButton, options, screen } = await renderThreadSwitchProbe(commands);
  const activeThread = screen.getByLabelText("Active thread session");
  const catalogStatus = screen.getByLabelText("Active skill catalog status");
  const catalog = screen.getByLabelText("Active skill catalog", { exact: true });

  await expect.element(catalog).toHaveTextContent(/^current$/);
  emitSkillsChanged(options);
  await expect.poll(() => vi.mocked(commands.listSkills).mock.calls.length).toBe(2);
  await expect.element(catalogStatus).toHaveTextContent("refreshing");

  const candidateAttachBase = attachWithThreadId(attachResponse, candidateThreadId);
  queueAttachProjectionResponse(commands, {
    ...candidateAttachBase,
    snapshot: {
      ...candidateAttachBase.snapshot,
      thread: { ...candidateAttachBase.snapshot.thread, cwd: candidateCwd },
    },
  });
  await continueButton.click();

  await expect.element(activeThread).toHaveTextContent(candidateThreadId);
  await expect.element(catalog).toHaveTextContent(/^candidate$/);
  staleRefresh.resolve(skillsListResponse(currentCwd, [catalogSkill("stale", currentCwd)]));
  await Promise.resolve();
  await expect.element(catalog).toHaveTextContent(/^candidate$/);

  markCommandsUnavailable(options);
  await expect.element(activeThread).toHaveTextContent("none");
  await expect.element(catalogStatus).toHaveTextContent("none");
  emitSkillsChanged(options);
  expect(commands.listSkills).toHaveBeenCalledTimes(3);
});

test("App displays GUI host startup errors in the top notices region", async () => {
  startGuiHostConnectionMock.mockImplementation(() => {
    throw new Error("Missing launch token fragment");
  });

  const screen = await renderWithProviders(<App />);
  const topNotices = screen.container.querySelector("[data-app-shell-top-notices]");
  const banner = screen.getByRole("banner").element();
  const main = screen.getByRole("main").element();
  const errorTitle = screen.getByText("Unable to start Codex GUI").element();
  const errorMessage = screen.getByText("Missing launch token fragment").element();

  if (!(topNotices instanceof HTMLElement)) {
    throw new Error("top notices region must render");
  }
  const topNoticesContent = topNotices.firstElementChild;
  if (!(topNoticesContent instanceof HTMLElement)) {
    throw new Error("top notices content must render");
  }

  await expect.element(screen.getByRole("main")).toHaveAttribute("data-gui-host-status", "error");
  await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
  await expect.element(screen.getByText("Missing launch token fragment")).toBeVisible();
  await expect
    .element(screen.getByText("Unable to load the current task", { exact: true }))
    .not.toBeInTheDocument();
  expect(banner.compareDocumentPosition(topNotices) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(topNotices.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(topNotices.contains(errorTitle)).toBe(true);
  expect(topNotices.contains(errorMessage)).toBe(true);
  await expect.element(getAppComposer(screen)).not.toBeInTheDocument();
});

test("App aligns history startup errors with their responsive shell owners", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };

  try {
    startGuiHostConnectionMock.mockImplementation(() => {
      throw new Error("Missing launch token fragment");
    });

    const screen = await renderWithProviders(
      <App initialEntry="/history" routeTarget={{ type: "historyList" }} />,
    );
    const bannerContent = screen.getByRole("banner").element().firstElementChild;
    const historyMain = screen.getByRole("main").element();
    const historyAlert = screen
      .getByText("Unable to load history", { exact: true })
      .element()
      .closest('[role="alert"]');
    const topNoticeTitle = screen.getByText("Unable to start Codex GUI").element();
    const topNoticeAlert = topNoticeTitle.parentElement?.parentElement;
    const topNoticeContent = topNoticeAlert?.parentElement;

    if (
      !(bannerContent instanceof HTMLElement) ||
      !(historyAlert instanceof HTMLElement) ||
      !(topNoticeAlert instanceof HTMLElement) ||
      !(topNoticeContent instanceof HTMLElement)
    ) {
      throw new Error("responsive history error layout owners must render");
    }

    await expect.element(screen.getByText("Unable to start Codex GUI")).toBeVisible();
    await expect.element(screen.getByText("Missing launch token fragment")).toBeVisible();
    await expect.element(historyAlert).toHaveTextContent("Unable to load history");
    await expect.element(getAppComposer(screen)).not.toBeInTheDocument();

    for (const [width, height] of [
      [400, 900],
      [800, 900],
      [900, 900],
    ] as const) {
      await page.viewport(width, height);

      expectHorizontalAlignment(bannerContent, topNoticeContent);
      expectHorizontalAlignment(topNoticeContent, historyMain);
      expectHorizontalAlignment(topNoticeAlert, historyAlert);
      expect(topNoticeAlert.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        screen.getByRole("banner").element().getBoundingClientRect().bottom - 1,
      );
      expect(historyAlert.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        topNoticeAlert.getBoundingClientRect().bottom - 1,
      );

      const scroller = documentScroller();
      expect(scroller.scrollWidth).toBeLessThanOrEqual(scroller.clientWidth + 1);
      for (const element of [
        bannerContent,
        topNoticeContent,
        historyMain,
        topNoticeAlert,
        historyAlert,
      ]) {
        expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth + 1);
      }
    }
  } finally {
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});

test("App localizes the GUI host startup error title without translating its details", async () => {
  startGuiHostConnectionMock.mockImplementation(() => {
    throw new Error("Missing launch token fragment");
  });

  const screen = await renderWithProviders(<App />, { locale: "zh-CN" });

  await expect.element(screen.getByText("无法启动 Codex GUI")).toBeVisible();
  await expect.element(screen.getByText("Missing launch token fragment")).toBeVisible();
});

test("App fails closed on history when the authorization session has no active task", async () => {
  window.history.replaceState({}, "", "/history");
  seedBrowserAuthorizationSession({ token: "history-secret" });
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(
    <App initialEntry="/history" routeTarget={{ type: "historyList" }} />,
  );
  const options = getHostOptions(startGuiHostConnectionMock);

  initializeHost(options, commands);

  const alert = screen.getByRole("alert");
  await expect.element(alert).toHaveTextContent("History context unavailable");
  await expect
    .element(alert)
    .toHaveTextContent("Open an active task in this browser tab before viewing its history.");
  expect(commands.attachThreadProjection).not.toHaveBeenCalled();
  expect(commands.listThreads).not.toHaveBeenCalled();
  expect(getConnectionStartCount(startGuiHostConnectionMock)).toBe(1);
  expect(window.location.pathname).toBe("/history");
});

test("App shows a QR access popover before the Stop button", async () => {
  const { screen } = await renderReadyApp();

  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  const buttons = Array.from(screen.container.querySelectorAll("button"));
  const qrButtonElement = buttons.find(
    (button) => button.getAttribute("aria-label") === "Scan with phone",
  );
  const stopButtonElement = buttons.find((button) => button.textContent.trim() === "Stop");

  await expect.element(qrButton).toBeEnabled();
  if (qrButtonElement == null || stopButtonElement == null) {
    throw new Error("QR and Stop buttons must render");
  }
  expect(
    qrButtonElement.compareDocumentPosition(stopButtonElement) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);

  await qrButton.click();

  const expectedUrl = new URL(`/task/${launchThreadId}#token=secret`, window.location.origin);
  await expect.element(screen.getByRole("dialog", { name: "Scan with phone" })).toBeVisible();
  await expect.element(screen.getByLabelText("QR code for current GUI URL")).toBeVisible();
  await expect.element(screen.getByText(expectedUrl.toString())).toBeVisible();
  expect(expectedUrl.pathname).toBe(`/task/${launchThreadId}`);
  expect(expectedUrl.search).toBe("");
  expect(expectedUrl.hash).toBe("#token=secret");
});

test("App closes the host connection when unmounted", async () => {
  const screen = await renderWithProviders(<App />);

  await screen.unmount();

  expect(getCleanupConnectionCallCount()).toBe(1);
});
