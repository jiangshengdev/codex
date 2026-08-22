import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import { page } from "vitest/browser";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  type RouteComponent,
} from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  attachResponse,
  attachWithCommittedMessages,
  createDeferred,
  createGuiHostCommands,
  emitSkillsChanged,
  emitProjectionClosed,
  emitProjectionDelta,
  emitProjectionEvent,
  getCleanupConnectionCallCount,
  getConnectionStartCount,
  getHostOptions,
  initializeHost,
  launchThreadId,
  markCommandsUnavailable,
  queueAttachProjectionResponse,
  queueDeferredAttachProjection,
  resetAppBrowserTestSupport,
  seedBrowserAuthorizationSession,
  skillsListResponse,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import RootApp from "@/App";
import { useAppCapabilities } from "@/features/appShell/AppCapabilities";
import {
  CURRENT_TASK_ROUTE_PATH,
  HISTORY_DETAIL_ROUTE_PATH,
  HISTORY_LIST_ROUTE_PATH,
  type GuiRouteTarget,
} from "@/features/browserLaunch/guiRouteTarget";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type {
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import type {
  GuiHostCommands,
  StartGuiHostConnectionOptions,
} from "@/features/guiHost/guiHostClient";
import { CurrentTaskPage } from "@/features/currentTask/CurrentTaskPage";
import { ThreadHistoryDetailPage } from "@/features/threadHistory/ThreadHistoryDetailPage";
import { ThreadHistoryListPage } from "@/features/threadHistory/ThreadHistoryListPage";
import {
  attachReplacement,
  closedBackpressure,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventSubscriptionReplacement,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessageDelta,
  agentMessage,
  attachWithHeadCommitId,
  attachWithThreadId,
  attachWithTurns,
  baseTurn,
  deltaForThreadOwner,
  eventForThreadOwner,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import type { SkillMetadata, SkillsListResponse } from "@codex-protocol/v2";
import { selectThreadIdentityState } from "@/features/threadIdentity/threadIdentitySlice";
import {
  selectTranscriptEntry,
  transcriptEntryIdFor,
} from "@/features/transcriptState/transcriptStateSlice";
import {
  selectThreadRuntimeEventBuffer,
  selectThreadRuntimeRecord,
  selectThreadRuntimeSubscription,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";

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
let threadSwitchProbeActiveOwner: ActiveThreadOwnerHandle | null = null;
let threadSwitchProbeContinueThread: ReturnType<typeof useAppCapabilities>["continueThread"] = null;
let threadSwitchProbePromise: ReturnType<
  NonNullable<ReturnType<typeof useAppCapabilities>["continueThread"]>
> | null = null;

const emptySkillCatalogSnapshot = {
  type: "initialLoading",
  candidates: [],
  partialErrorCount: 0,
} as const;
const getEmptySkillCatalogSnapshot = () => emptySkillCatalogSnapshot;
const subscribeToEmptySkillCatalog = () => () => undefined;

function ThreadSwitchCapabilityProbe() {
  const { activeOwner, continueThread } = useAppCapabilities();
  const skillCatalogSnapshot = useSyncExternalStore(
    activeOwner?.skillCatalog.subscribe ?? subscribeToEmptySkillCatalog,
    activeOwner?.skillCatalog.getSnapshot ?? getEmptySkillCatalogSnapshot,
  );
  useEffect(() => {
    threadSwitchProbeActiveOwner = activeOwner;
    threadSwitchProbeContinueThread = continueThread;
  }, [activeOwner, continueThread]);

  return (
    <section aria-label="Thread switch capability probe">
      <button
        disabled={continueThread == null}
        onClick={() => {
          threadSwitchProbePromise = continueThread?.(candidateThreadId) ?? null;
        }}
        type="button"
      >
        Continue candidate thread
      </button>
      <output aria-label="Active thread owner">{activeOwner?.threadId ?? "none"}</output>
      <output aria-label="Active queue owner">
        {activeOwner?.queueCoordinator.ownerThreadId ?? "none"}
      </output>
      <output aria-label="Active skill catalog status">
        {activeOwner == null ? "none" : skillCatalogSnapshot.type}
      </output>
      <output aria-label="Active skill catalog">
        {skillCatalogSnapshot.candidates.map(({ name }) => name).join(",") || "none"}
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

function App({
  currentTaskComponent = CurrentTaskPage,
  initialEntry = CURRENT_TASK_ROUTE_PATH.replace("$threadId", launchThreadId),
  routeTarget = { type: "currentTask", threadId: launchThreadId },
}: Readonly<{
  currentTaskComponent?: RouteComponent;
  initialEntry?: string;
  routeTarget?: GuiRouteTarget;
}>) {
  const [router] = useState(() => {
    const rootRoute = createRootRoute();
    const appRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: "app",
      component: () => <RootApp routeTarget={routeTarget} />,
    });
    const currentTaskRoute = createRoute({
      getParentRoute: () => appRoute,
      path: CURRENT_TASK_ROUTE_PATH,
      component: currentTaskComponent,
    });
    const historyListRoute = createRoute({
      getParentRoute: () => appRoute,
      path: HISTORY_LIST_ROUTE_PATH,
      component: ThreadHistoryListPage,
    });
    const historyDetailRoute = createRoute({
      getParentRoute: () => appRoute,
      path: HISTORY_DETAIL_ROUTE_PATH,
      component: ThreadHistoryDetailPage,
    });

    return createRouter({
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      routeTree: rootRoute.addChildren([
        appRoute.addChildren([currentTaskRoute, historyListRoute, historyDetailRoute]),
      ]),
    });
  });

  return <RouterProvider router={router} />;
}

const catalogSkill = (name: string, cwd: string, enabled = true): SkillMetadata => ({
  name,
  description: `${name} description`,
  path: `${cwd}/skills/${name}/SKILL.md`,
  scope: "repo",
  enabled,
});

const createQueueCoordinatorMock = (
  threadId: string,
  releaseReadiness: ReturnType<ComposerInputQueueCoordinator["getReleaseReadiness"]> = {
    type: "safe",
  },
) => {
  const reservationRelease = vi.fn<() => void>();
  const observeAcceptedEvent = vi.fn<ComposerInputQueueCoordinator["observeAcceptedEvent"]>();
  const dispose = vi.fn<ComposerInputQueueCoordinator["dispose"]>();
  const coordinator = {
    ownerThreadId: threadId,
    submit: vi.fn<ComposerInputQueueCoordinator["submit"]>().mockReturnValue({ type: "accepted" }),
    submitSteer: vi
      .fn<ComposerInputQueueCoordinator["submitSteer"]>()
      .mockReturnValue({ type: "accepted" }),
    promoteOrdinaryFrontToSteer: vi
      .fn<ComposerInputQueueCoordinator["promoteOrdinaryFrontToSteer"]>()
      .mockReturnValue(false),
    interruptActiveTurn: vi
      .fn<ComposerInputQueueCoordinator["interruptActiveTurn"]>()
      .mockReturnValue(false),
    recover: vi.fn<ComposerInputQueueCoordinator["recover"]>().mockReturnValue(false),
    observeAcceptedEvent,
    getReleaseReadiness: vi
      .fn<ComposerInputQueueCoordinator["getReleaseReadiness"]>()
      .mockReturnValue(releaseReadiness),
    reserveRelease: vi
      .fn<ComposerInputQueueCoordinator["reserveRelease"]>()
      .mockImplementation(() =>
        releaseReadiness.type === "blocked"
          ? releaseReadiness
          : { type: "reserved", reservation: { release: reservationRelease } },
      ),
    readPendingInputPage: vi
      .fn<ComposerInputQueueCoordinator["readPendingInputPage"]>()
      .mockReturnValue({ type: "unavailable" }),
    readPendingInputDetail: vi
      .fn<ComposerInputQueueCoordinator["readPendingInputDetail"]>()
      .mockReturnValue({ type: "unavailable" }),
    getSnapshot: vi.fn<ComposerInputQueueCoordinator["getSnapshot"]>().mockReturnValue({
      ordinaryQueuedCount: 0,
      guidingCount: 0,
      detailRevision: 0,
      recoveryCount: 0,
      recovery: null,
      isRecovering: false,
      rejectedSteers: [],
      hasUnknownSteer: false,
      canStop: false,
      interrupt: null,
    }),
    subscribe: vi
      .fn<ComposerInputQueueCoordinator["subscribe"]>()
      .mockReturnValue(vi.fn<() => void>()),
    dispose,
  } satisfies ComposerInputQueueCoordinator;
  return { coordinator, dispose, observeAcceptedEvent, reservationRelease };
};

const readPendingItems = (
  coordinator: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
  limit = 20,
): readonly ComposerPendingInputPageItem[] => {
  const snapshot = coordinator.getSnapshot();
  const result = coordinator.readPendingInputPage({
    lane,
    revision: snapshot.detailRevision,
    cursor: null,
    limit,
  });
  if (result.type !== "page") {
    throw new Error(`expected ${lane} pending-input page, received ${result.type}`);
  }
  return result.items;
};

const readPendingTextPreviews = (
  coordinator: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
): string[] =>
  readPendingItems(coordinator, lane).map(({ preview }) =>
    preview.type === "text" ? preview.text : "nonText",
  );

const requireThreadSwitchProbeOwner = (): ActiveThreadOwnerHandle => {
  if (threadSwitchProbeActiveOwner == null) {
    throw new Error("thread switch probe must expose an active owner");
  }
  return threadSwitchProbeActiveOwner;
};

const requireThreadSwitchProbePromise = () => {
  if (threadSwitchProbePromise == null) {
    throw new Error("thread switch probe must start a switch");
  }
  return threadSwitchProbePromise;
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
  await expect.poll(() => threadSwitchProbeActiveOwner?.threadId).toBe(launchThreadId);
  return { continueButton, options, screen };
};

const startTurnParamsAt = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  index: number,
): Parameters<GuiHostCommands["startTurn"]>[0] => {
  const call = startTurn.mock.calls.at(index);
  if (call == null) {
    throw new Error(`startTurn call ${String(index + 1)} must be recorded`);
  }
  return call[0];
};

const steerTurnParamsAt = (
  steerTurn: Mock<GuiHostCommands["steerTurn"]>,
  index: number,
): Parameters<GuiHostCommands["steerTurn"]>[0] => {
  const call = steerTurn.mock.calls.at(index);
  if (call == null) {
    throw new Error(`steerTurn call ${String(index + 1)} must be recorded`);
  }
  return call[0];
};

const dispatchGuideShortcut = (element: Element): void => {
  const isMac = navigator.platform.startsWith("Mac");
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: !isMac,
      key: "Enter",
      metaKey: isMac,
    }),
  );
};

const expectStartTurnCalledOnceWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledOnce();
  const params = startTurnParamsAt(startTurn, 0);
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

const expectStartTurnSecondCallWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledTimes(2);
  const params = startTurnParamsAt(startTurn, 1);
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenNthCalledWith(2, {
    threadId: launchThreadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  vi.mocked(createComposerInputQueueCoordinator).mockRestore();
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
  threadSwitchProbeActiveOwner = null;
  threadSwitchProbeContinueThread = null;
  threadSwitchProbePromise = null;
});

const longTranscriptText = (label: string): string =>
  Array.from({ length: 96 }, (_, index) => `${label} line ${String(index + 1)}`).join("\n");

const documentScroller = (): HTMLElement => {
  const scroller = document.scrollingElement;
  if (!(scroller instanceof HTMLElement)) {
    throw new Error("document.scrollingElement must be available");
  }

  return scroller;
};

const scrollToDocumentBottom = (): void => {
  const scroller = documentScroller();
  window.scrollTo({ top: scroller.scrollHeight });
};

const scrollToDocumentTop = (): void => {
  window.scrollTo({ top: 0 });
};

const distanceFromDocumentBottom = (): number => {
  const scroller = documentScroller();
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
};

const expectDocumentAtBottom = (): void => {
  expect(distanceFromDocumentBottom()).toBeLessThanOrEqual(4);
};

const expectElementBottomAlignedWithViewport = (element: HTMLElement): void => {
  const { bottom } = element.getBoundingClientRect();
  expect(Math.abs(window.innerHeight - bottom)).toBeLessThanOrEqual(1);
};

const waitForBrowserFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

const expectDocumentScrollStaysAwayFromBottom = async (maxScrollTop: number): Promise<void> => {
  const startTime = performance.now();

  for (;;) {
    expect(documentScroller().scrollTop).toBeLessThanOrEqual(maxScrollTop);
    expect(distanceFromDocumentBottom()).toBeGreaterThan(40);

    if (performance.now() - startTime >= 150) {
      return;
    }

    await waitForBrowserFrame();
  }
};

const getAppComposer = (screen: Awaited<ReturnType<typeof renderWithProviders>>) =>
  screen.getByRole("combobox", { name: "Message Codex", exact: true });

const renderReadyApp = async (commandHandle = createGuiHostCommands()) => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  queueAttachProjectionResponse(commandHandle);
  initializeHost(options, commandHandle);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");

  return { commandHandle, options, screen };
};

const initializeAppWithProjection = (
  options: StartGuiHostConnectionOptions,
  response = attachResponse,
  commands = createGuiHostCommands(),
): GuiHostCommands => {
  queueAttachProjectionResponse(commands, response);
  initializeHost(options, commands);
  return commands;
};

type ActiveAppCommandOverrides = Partial<{
  interruptTurn: Mock<GuiHostCommands["interruptTurn"]>;
  startTurn: Mock<GuiHostCommands["startTurn"]>;
  steerTurn: Mock<GuiHostCommands["steerTurn"]>;
}>;

const renderActiveApp = async (commandOverrides: ActiveAppCommandOverrides = {}) => {
  const startTurn =
    commandOverrides.startTurn ??
    vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
      turn: inProgressTurn("turn-started-from-app"),
    });
  const steerTurn =
    commandOverrides.steerTurn ??
    vi.fn<GuiHostCommands["steerTurn"]>().mockResolvedValue({
      turnId: "turn-steered-from-app",
    });
  const interruptTurn =
    commandOverrides.interruptTurn ??
    vi.fn<GuiHostCommands["interruptTurn"]>().mockResolvedValue({});
  const commandHandle: GuiHostCommands = {
    ...createGuiHostCommands(),
    interruptTurn,
    startTurn,
    steerTurn,
  };
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const activeTurn = inProgressTurn("turn-active-queue");

  queueAttachProjectionResponse(commandHandle, attachWithTurns(attachResponse, [activeTurn]));
  initializeHost(options, commandHandle);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");
  await expect.poll(() => vi.mocked(createComposerInputQueueCoordinator).mock.calls.length).toBe(1);
  const coordinatorResult = vi.mocked(createComposerInputQueueCoordinator).mock.results.at(0);
  if (coordinatorResult?.type !== "return") {
    throw new Error("active App must create a queue coordinator");
  }

  return {
    activeTurn,
    commandHandle,
    interruptTurn,
    options,
    queueCoordinator: coordinatorResult.value,
    screen,
    startTurn,
    steerTurn,
  };
};

const expectAppComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "false");
  for (const control of [
    screen.getByRole("button", { name: "Send", exact: true }),
    screen.getByRole("button", { name: "Stop" }),
  ]) {
    await expect.element(control).toBeDisabled();
  }
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
  const main = screen.getByRole("main").element();
  const transcriptBottomSentinel = screen.container.querySelector(
    ".committed-transcript-bottom-sentinel",
  );
  const composerShell = screen.container.querySelector('[aria-label="Message composer"]');

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByRole("region", { name: "Message composer" })).toBeVisible();
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByText("GUI host")).not.toBeInTheDocument();
  expect(main.classList.contains("pb-44")).toBe(false);
  expect(main.classList.contains("px-4")).toBe(false);
  expect(main.classList.contains("py-6")).toBe(false);
  expect(main.classList.contains("sm:px-6")).toBe(false);
  expect(main.classList.contains("lg:px-8")).toBe(false);
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
  expectElementBottomAlignedWithViewport(composerShell);
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
    await expect
      .poll(() => Math.abs(composerShell.getBoundingClientRect().bottom - window.innerHeight))
      .toBeLessThanOrEqual(1);

    const scroller = documentScroller();
    const baselineDocumentSize = {
      height: scroller.scrollHeight,
      width: scroller.scrollWidth,
    };
    const baselineDocumentScrollTop = scroller.scrollTop;
    const baselineComposerBottom = composerShell.getBoundingClientRect().bottom;

    await editor.fill("$");
    const listbox = screen.getByRole("listbox", { name: "Typeahead menu" });
    await expect.poll(() => listbox.getByRole("option").length).toBe(20);
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
        const menuGap = panelBounds.top - menuBounds.bottom;
        const availableHeight = Math.max(0, panelBounds.top - viewportTop - 8);
        const maximumHeight = Math.min(viewportHeight * 0.4, 360, availableHeight);
        const currentScroller = documentScroller();

        return {
          composerBottomAligned: Math.abs(composerBottom - window.innerHeight) <= 1,
          composerBottomStable: Math.abs(composerBottom - baselineComposerBottom) <= 1,
          documentHeightStable: currentScroller.scrollHeight <= baselineDocumentSize.height + 1,
          documentWidthStable: currentScroller.scrollWidth <= baselineDocumentSize.width + 1,
          documentWithoutHorizontalOverflow:
            currentScroller.scrollWidth <= currentScroller.clientWidth + 1,
          menuFullyVisible:
            menuBounds.top >= viewportTop - 1 && menuBounds.bottom <= viewportBottom + 1,
          menuHasPanelWidth: Math.abs(menuBounds.width - panelBounds.width) <= 1,
          menuIsNotCaretSized: menuBounds.height > 40 && menuBounds.width > 100,
          menuLeftAligned: Math.abs(menuBounds.left - panelBounds.left) <= 1,
          menuRespectsGap: Math.abs(menuGap - 8) <= 1,
          menuRespectsHeightCap: menuBounds.height <= maximumHeight + 1,
        };
      })
      .toEqual({
        composerBottomAligned: true,
        composerBottomStable: true,
        documentHeightStable: true,
        documentWidthStable: true,
        documentWithoutHorizontalOverflow: true,
        menuFullyVisible: true,
        menuHasPanelWidth: true,
        menuIsNotCaretSized: true,
        menuLeftAligned: true,
        menuRespectsGap: true,
        menuRespectsHeightCap: true,
      });

    const scrollRegion = screen.container.querySelector("[data-skill-menu-scroll-region]");
    if (!(scrollRegion instanceof HTMLElement)) {
      throw new Error("skill menu scroll region must render");
    }
    expect(listbox.element().contains(scrollRegion)).toBe(true);

    await screen.user.keyboard("{ArrowDown}".repeat(19));
    await expect
      .poll(() => {
        const activeOption = listbox
          .element()
          .querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
        if (activeOption == null) {
          return null;
        }
        const activeBounds = activeOption.getBoundingClientRect();
        const scrollBounds = scrollRegion.getBoundingClientRect();
        const menuBounds = listbox.element().getBoundingClientRect();
        const panelBounds = composerPanel.getBoundingClientRect();
        const composerBottom = composerShell.getBoundingClientRect().bottom;
        const currentScroller = documentScroller();
        const visualViewport = window.visualViewport;
        const viewportTop = visualViewport?.offsetTop ?? 0;
        const viewportHeight = visualViewport?.height ?? window.innerHeight;
        const menuGap = panelBounds.top - menuBounds.bottom;
        const availableHeight = Math.max(0, panelBounds.top - viewportTop - 8);
        const maximumHeight = Math.min(viewportHeight * 0.4, 360, availableHeight);

        return {
          activeIsLastResult: activeOption.id === "typeahead-item-19",
          activeVisibleInScrollRegion:
            activeBounds.top >= scrollBounds.top - 1 &&
            activeBounds.bottom <= scrollBounds.bottom + 1,
          composerBottomAligned: Math.abs(composerBottom - window.innerHeight) <= 1,
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
          menuHasPanelWidth: Math.abs(menuBounds.width - panelBounds.width) <= 1,
          menuLeftAligned: Math.abs(menuBounds.left - panelBounds.left) <= 1,
          menuRespectsGap: Math.abs(menuGap - 8) <= 1,
          menuRespectsHeightCap: menuBounds.height <= maximumHeight + 1,
          scrollRegionAdvanced: scrollRegion.scrollTop > 0,
        };
      })
      .toEqual({
        activeIsLastResult: true,
        activeVisibleInScrollRegion: true,
        composerBottomAligned: true,
        composerBottomStable: true,
        documentHeightStable: true,
        documentScrollTopStable: true,
        documentWidthStable: true,
        documentWithoutHorizontalOverflow: true,
        menuFullyVisible: true,
        menuHasPanelWidth: true,
        menuLeftAligned: true,
        menuRespectsGap: true,
        menuRespectsHeightCap: true,
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

test("App keeps the transcript surface flush with the shell padding", async () => {
  const { screen } = await renderReadyApp();
  const transcript = screen.container.querySelector('[aria-label="Committed transcript"]');
  const surface = transcript?.parentElement;

  if (!(surface instanceof HTMLElement)) {
    throw new Error("transcript surface container must render");
  }

  expect(surface.classList.contains("p-4")).toBe(false);
  expect(surface.classList.contains("sm:p-6")).toBe(false);
});

test("App keeps host lifecycle status stable while projection events update runtime", async () => {
  const screen = await renderWithProviders(<App />);
  const { store } = screen;
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();

  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);
  await expect
    .poll(() => selectThreadRuntimeRecord(store.getState())?.threadId)
    .toBe(launchThreadId);
  emitProjectionEvent(options, eventTurnStarted);

  await expect
    .element(screen.getByRole("main"))
    .toHaveAttribute("data-gui-host-status", "initialized");
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: eventTurnStarted, replay: "live" },
  ]);
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
  const activeThread = screen.getByLabelText("Active thread owner");
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

test("App displays GUI host startup errors in the sticky top notices region", async () => {
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
  expect(topNotices.classList.contains("sticky")).toBe(true);
  expect(topNotices.classList.contains("z-20")).toBe(true);
  expect(banner.compareDocumentPosition(topNotices) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(topNotices.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  expect(topNotices.contains(errorTitle)).toBe(true);
  expect(topNotices.contains(errorMessage)).toBe(true);
  await expect.element(getAppComposer(screen)).not.toBeInTheDocument();
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

test("App dispatches accepted host projection payloads into thread runtime", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStarted;
  const threadId = attachResponse.snapshot.thread.id;
  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);
  await expect.poll(() => selectThreadRuntimeRecord(store.getState())?.threadId).toBe(threadId);
  emitProjectionEvent(options, projectionEvent);

  expect(selectThreadIdentityState(store.getState())).toStrictEqual({
    launchThreadId: threadId,
    attachedThreadId: threadId,
    attachStatus: "attached",
  });

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.threadId).toBe(threadId);
  expect(runtime?.sessionId).toBe(attachResponse.snapshot.thread.sessionId);
  expect(runtime?.snapshotTurns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(runtime?.activeTurnId).toBe(projectionEvent.event.notification.turn.id);
  expect(runtime?.eventBuffer).toStrictEqual([
    { type: "projectionEvent", notification: projectionEvent, replay: "live" },
  ]);
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "active",
  });
});

test("App batches accepted projection deltas until the next animation frame", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const screen = await renderWithProviders(<App />);
    const { store } = screen;
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-batch", "");
    const commands = createGuiHostCommands();

    queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, []));
    initializeHost(options, commands);
    await expect
      .poll(() => selectThreadRuntimeRecord(store.getState())?.threadId)
      .toBe(launchThreadId);
    const turnStartedEvent = turnStarted(
      eventTurnStarted,
      "commit-raf-batch-turn",
      inProgressTurn("turn-raf-batch"),
    );
    const itemStartedEvent = eventWithEnvelope(
      itemStarted(eventItemStarted, "commit-raf-batch-started", "turn-raf-batch", initialItem),
      { parentCommitId: turnStartedEvent.commitId },
    );
    emitProjectionEvent(options, turnStartedEvent);
    emitProjectionEvent(options, itemStartedEvent);

    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-batch", "agent-raf-batch", "Hello"),
    );
    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-batch", "agent-raf-batch", " world"),
    );

    const entryId = transcriptEntryIdFor("turn-raf-batch", "agent-raf-batch");
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "live",
      id: "agent-raf-batch",
      key: entryId,
      turnId: "turn-raf-batch",
      itemId: "agent-raf-batch",
      status: "started",
      initialItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();

    vi.advanceTimersToNextFrame();

    await expect.element(screen.getByText("Hello world")).toBeVisible();

    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "live",
      id: "agent-raf-batch",
      key: entryId,
      turnId: "turn-raf-batch",
      itemId: "agent-raf-batch",
      status: "streaming",
      initialItem,
      transientText: "Hello world",
      revision: 1,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual({
      type: "message",
      id: "agent-raf-batch",
      turnId: "turn-raf-batch",
      role: "assistant",
      rendering: { mode: "streamingMarkdown", source: "Hello world" },
      revision: 1,
    });
  } finally {
    vi.useRealTimers();
  }
});

test("App flushes pending projection deltas before structural projection events", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const { store } = await renderWithProviders(<App />);
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-flush-event", "");
    const commands = createGuiHostCommands();

    queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, []));
    initializeHost(options, commands);
    await expect
      .poll(() => selectThreadRuntimeRecord(store.getState())?.threadId)
      .toBe(launchThreadId);
    const turnStartedEvent = turnStarted(
      eventTurnStarted,
      "commit-raf-flush-event-turn",
      inProgressTurn("turn-raf-flush-event"),
    );
    const itemStartedEvent = eventWithEnvelope(
      itemStarted(
        eventItemStarted,
        "commit-raf-flush-event-started",
        "turn-raf-flush-event",
        initialItem,
      ),
      { parentCommitId: turnStartedEvent.commitId },
    );
    const itemCompletedEvent = eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "commit-raf-flush-event-completed",
        "turn-raf-flush-event",
        agentMessage("agent-raf-flush-event", "Completed answer"),
      ),
      { parentCommitId: itemStartedEvent.commitId },
    );
    emitProjectionEvent(options, turnStartedEvent);
    emitProjectionEvent(options, itemStartedEvent);

    emitProjectionDelta(
      options,
      agentMessageDelta(
        eventAgentMessageDelta,
        "turn-raf-flush-event",
        "agent-raf-flush-event",
        "Transient before completion",
      ),
    );
    emitProjectionEvent(options, itemCompletedEvent);

    const entryId = transcriptEntryIdFor("turn-raf-flush-event", "agent-raf-flush-event");
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "message",
      id: "agent-raf-flush-event",
      turnId: "turn-raf-flush-event",
      role: "assistant",
      source: "Completed answer",
      sourceKind: "markdown",
      phase: "final_answer",
      revision: 2,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toStrictEqual({
      type: "message",
      id: "agent-raf-flush-event",
      turnId: "turn-raf-flush-event",
      role: "assistant",
      rendering: { mode: "staticMarkdown", source: "Completed answer" },
      revision: 2,
    });
  } finally {
    vi.useRealTimers();
  }
});

test("App classifies snapshot-ahead projection events as snapshot duplicate replay", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const snapshotAheadAttach = attachWithTurns(attachResponse, [
    eventTurnStarted.event.notification.turn,
  ]);
  const snapshotAheadWithOldHead = attachWithHeadCommitId(
    snapshotAheadAttach,
    eventTurnStarted.parentCommitId,
  );

  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  queueAttachProjectionResponse(commands, snapshotAheadWithOldHead);
  initializeHost(options, commands);
  await expect
    .poll(() => selectThreadRuntimeRecord(store.getState())?.threadId)
    .toBe(launchThreadId);
  emitProjectionEvent(options, eventTurnStarted);

  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.snapshotTurns).toStrictEqual([eventTurnStarted.event.notification.turn]);
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: eventTurnStarted, replay: "snapshotDuplicate" },
  ]);
});

test("App replays startup notifications against the accepted attach baseline", async () => {
  const { store } = await renderWithProviders(<App />);
  if (eventSubscriptionReplacement.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  const oldOnlyTurn = inProgressTurn("old-baseline-only");
  const replacementTurn = eventSubscriptionReplacement.event.notification.turn;
  const replacementAttach = attachWithTurns(attachReplacement, [replacementTurn]);
  const oldOnlyEvent = eventWithEnvelope(
    turnStarted(eventSubscriptionReplacement, "commit-old-baseline-only", oldOnlyTurn),
    { parentCommitId: replacementAttach.snapshot.headCommitId },
  );
  const snapshotDuplicateEvent = eventWithEnvelope(eventSubscriptionReplacement, {
    parentCommitId: oldOnlyEvent.commitId,
  });
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  const pendingAttach = queueDeferredAttachProjection(commands);

  initializeHost(options, commands);
  await expect.poll(pendingAttach.getState).toBe("pending");
  emitProjectionEvent(options, oldOnlyEvent);
  emitProjectionEvent(options, snapshotDuplicateEvent);
  pendingAttach.resolve(replacementAttach);

  await expect
    .poll(() => selectThreadRuntimeRecord(store.getState())?.snapshotTurns)
    .toStrictEqual([replacementTurn]);
  await expect
    .poll(() => selectThreadRuntimeEventBuffer(store.getState()))
    .toStrictEqual([
      { type: "projectionEvent", notification: oldOnlyEvent, replay: "live" },
      {
        type: "projectionEvent",
        notification: snapshotDuplicateEvent,
        replay: "snapshotDuplicate",
      },
    ]);
});

test("App does not publish a late startup owner after commands become unavailable", async () => {
  const commands = createGuiHostCommands();
  const pendingAttach = queueDeferredAttachProjection(commands);
  const screen = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchCapabilityProbe} />,
  );
  const options = getHostOptions(startGuiHostConnectionMock);
  const activeThread = screen.getByLabelText("Active thread owner");
  const continueButton = screen.getByRole("button", { name: "Continue candidate thread" });

  initializeHost(options, commands);
  await expect.poll(pendingAttach.getState).toBe("pending");
  markCommandsUnavailable(options);
  pendingAttach.resolve();

  await expect.element(activeThread).toHaveTextContent("none");
  await expect.element(continueButton).toBeDisabled();
  await expect.poll(() => threadSwitchProbeActiveOwner).toBeNull();
  expect(createComposerInputQueueCoordinator).not.toHaveBeenCalled();
});

test("App sends ordinary Enter through start identity and renders only its live commit", async () => {
  const text = "Ordinary Enter through App";
  const startedTurn = inProgressTurn("turn-enter-from-app");
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockResolvedValue({
    turn: startedTurn,
  });
  const commandHandle: GuiHostCommands = { ...createGuiHostCommands(), startTurn };
  const { options, screen } = await renderReadyApp(commandHandle);
  const composer = getAppComposer(screen);

  await composer.fill(text);
  await composer.click();
  await screen.user.keyboard("{Enter}");

  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  const params = startTurnParamsAt(startTurn, 0);
  expect(typeof params.clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
    clientUserMessageId: params.clientUserMessageId,
    input: [textInput(text)],
  });
  await expect.poll(() => composer.element().textContent.trim()).toBe("");
  await expect.element(screen.getByText(text, { exact: true })).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();

  const started = eventWithEnvelope(
    turnStarted(eventTurnStarted, "commit-enter-turn-started", startedTurn),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  const committedUserMessage = userMessage(
    "user-enter-from-app",
    [textInput(text)],
    params.clientUserMessageId,
  );
  const startedItem = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-enter-user-message-started",
      startedTurn.id,
      committedUserMessage,
    ),
    { parentCommitId: started.commitId },
  );
  emitProjectionEvent(options, started);
  emitProjectionEvent(options, startedItem);
  expect(
    selectTranscriptEntry(
      screen.store.getState(),
      transcriptEntryIdFor(startedTurn.id, committedUserMessage.id),
    ),
  ).toBeNull();
  await expect.element(screen.getByText(text, { exact: true })).not.toBeInTheDocument();

  const completedItem = eventWithEnvelope(
    itemCompleted(
      eventItemCompleted,
      "commit-enter-user-message-completed",
      startedTurn.id,
      committedUserMessage,
    ),
    { parentCommitId: startedItem.commitId },
  );
  emitProjectionEvent(options, completedItem);

  await expect.element(screen.getByText(text, { exact: true })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
});

test("App queues during an active turn and starts exactly once after its live terminal event", async () => {
  const { activeTurn, options, queueCoordinator, screen, startTurn } = await renderActiveApp();
  const transcript = screen.getByRole("region", { name: "Committed transcript" });

  await getAppComposer(screen).fill("Queued from active turn");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  const trigger = screen.getByRole("button", { name: "Pending: Queued 1", exact: true });
  await expect.element(trigger).toBeVisible();
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
  expect(readPendingTextPreviews(queueCoordinator, "ordinary")).toEqual([
    "Queued from active turn",
  ]);
  await expect
    .element(transcript.getByText("Queued from active turn", { exact: true }))
    .not.toBeInTheDocument();
  expect(startTurn).not.toHaveBeenCalled();

  await trigger.click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await expect.element(dialog.getByText("Queued from active turn", { exact: true })).toBeVisible();

  const completed = turnCompleted(eventTurnCompleted, "commit-active-terminal", {
    ...activeTurn,
    status: "completed",
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(completed, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );

  expectStartTurnCalledOnceWithText(startTurn, "Queued from active turn");
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(trigger).not.toBeInTheDocument();
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(0);
  await expect
    .element(transcript.getByText("Queued from active turn", { exact: true }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});

test("App guides explicit input ahead of ordinary FIFO and commits accepted identities independently", async () => {
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const explicitSteer = createDeferred<SteerResponse>();
  const promotedSteer = createDeferred<SteerResponse>();
  const steerTurn = vi
    .fn<GuiHostCommands["steerTurn"]>()
    .mockImplementationOnce(() => explicitSteer.promise)
    .mockImplementationOnce(() => promotedSteer.promise);
  const { activeTurn, options, queueCoordinator, screen, startTurn } = await renderActiveApp({
    steerTurn,
  });
  const composer = getAppComposer(screen);

  await composer.fill("Ordinary A");
  await composer.click();
  await screen.user.keyboard("{Enter}");
  await composer.fill("Ordinary B");
  await screen.user.keyboard("{Enter}");
  await expect.poll(() => queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(2);

  await composer.fill("Explicit steer S");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  const explicitParams = steerTurnParamsAt(steerTurn, 0);
  expect(explicitParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: explicitParams.clientUserMessageId,
    input: [textInput("Explicit steer S")],
  });
  expect(typeof explicitParams.clientUserMessageId).toBe("string");
  expect(startTurn).not.toHaveBeenCalled();

  await expect.poll(() => composer.element().textContent.trim()).toBe("");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual([
    "Explicit steer S",
    "Ordinary A",
  ]);

  explicitSteer.resolve({ turnId: activeTurn.id });
  await expect.poll(() => steerTurn.mock.calls.length).toBe(2);
  const promotedParams = steerTurnParamsAt(steerTurn, 1);
  expect(promotedParams).toEqual({
    threadId: launchThreadId,
    expectedTurnId: activeTurn.id,
    clientUserMessageId: promotedParams.clientUserMessageId,
    input: [textInput("Ordinary A")],
  });
  expect(typeof promotedParams.clientUserMessageId).toBe("string");
  expect(promotedParams.clientUserMessageId).not.toBe(explicitParams.clientUserMessageId);
  promotedSteer.resolve({ turnId: activeTurn.id });
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);

  const committedPromoted = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-promoted-steer",
      activeTurn.id,
      userMessage(
        "user-promoted-steer",
        [textInput("Ordinary A")],
        promotedParams.clientUserMessageId,
      ),
    ),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, committedPromoted);
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(1);
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual(["Explicit steer S"]);
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);

  const committedExplicit = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-explicit-steer",
      activeTurn.id,
      userMessage(
        "user-explicit-steer",
        [textInput("Explicit steer S")],
        explicitParams.clientUserMessageId,
      ),
    ),
    { parentCommitId: committedPromoted.commitId },
  );
  emitProjectionEvent(options, committedExplicit);
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(0);
  expect(readPendingItems(queueCoordinator, "steer")).toEqual([]);
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);
  expect(startTurn).not.toHaveBeenCalled();
  await expect
    .element(screen.getByRole("button", { name: "Pending: Queued 1", exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("Ordinary B", { exact: true })).not.toBeInTheDocument();
});

test("App batch rejects a non-steerable target and restores a failed merged start in order", async () => {
  type StartResponse = Awaited<ReturnType<GuiHostCommands["startTurn"]>>;
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const startRequest = createDeferred<StartResponse>();
  const steerRequest = createDeferred<SteerResponse>();
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>(() => startRequest.promise);
  const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>(() => steerRequest.promise);
  const { activeTurn, options, queueCoordinator, screen } = await renderActiveApp({
    startTurn,
    steerTurn,
  });
  const composer = getAppComposer(screen);

  await composer.fill("Ordinary after rejected steers");
  await composer.click();
  await screen.user.keyboard("{Enter}");
  await composer.fill("Rejected steer A");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  await composer.fill("Rejected steer B");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);
  expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual([
    "Rejected steer A",
    "Rejected steer B",
  ]);

  steerRequest.reject(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("active turn is not steerable"),
      rpcError: {
        code: -32000,
        message: "active turn is not steerable",
        data: {
          message: "active turn is not steerable",
          codexErrorInfo: { activeTurnNotSteerable: { turnKind: "review" } },
          additionalDetails: null,
        },
      },
    }),
  );
  await expect
    .poll(() => queueCoordinator.getSnapshot().rejectedSteers.map(({ preview }) => preview))
    .toEqual([
      { type: "text", text: "Rejected steer A", truncated: false },
      { type: "text", text: "Rejected steer B", truncated: false },
    ]);
  expect(steerTurn).toHaveBeenCalledOnce();
  expect(queueCoordinator.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 1,
    guidingCount: 0,
    recoveryCount: 0,
  });
  expect(readPendingItems(queueCoordinator, "steer")).toEqual([]);
  await expect
    .element(screen.getByRole("button", { name: "Pending: Queued 1", exact: true }))
    .toBeVisible();

  const terminal = eventWithEnvelope(
    turnCompleted(eventTurnCompleted, "commit-non-steerable-terminal", {
      ...activeTurn,
      status: "completed",
    }),
    { parentCommitId: attachResponse.snapshot.headCommitId },
  );
  emitProjectionEvent(options, terminal);
  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  const mergedParams = startTurnParamsAt(startTurn, 0);
  expect(mergedParams).toEqual({
    threadId: launchThreadId,
    clientUserMessageId: mergedParams.clientUserMessageId,
    input: [textInput("Rejected steer A"), textInput("Rejected steer B")],
  });
  expect(queueCoordinator.getSnapshot().ordinaryQueuedCount).toBe(1);

  startRequest.reject(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("synthetic merged start rejected"),
    }),
  );
  await expect
    .poll(() => ({
      ordinaryQueuedCount: queueCoordinator.getSnapshot().ordinaryQueuedCount,
      guidingCount: queueCoordinator.getSnapshot().guidingCount,
      rejectedPreviews: queueCoordinator.getSnapshot().rejectedSteers.map(({ preview }) => preview),
    }))
    .toEqual({
      ordinaryQueuedCount: 1,
      guidingCount: 0,
      rejectedPreviews: [
        { type: "text", text: "Rejected steer A", truncated: false },
        { type: "text", text: "Rejected steer B", truncated: false },
      ],
    });
  expect(startTurn).toHaveBeenCalledOnce();
  expect(steerTurn).toHaveBeenCalledOnce();
});

test.each(["response mismatch", "delivery unknown"] as const)(
  "App keeps a steer %s unknown without sending or retrying its successor",
  async (settlement) => {
    type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
    const steerRequest = createDeferred<SteerResponse>();
    const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>(() => steerRequest.promise);
    const { queueCoordinator, screen } = await renderActiveApp({ steerTurn });
    const composer = getAppComposer(screen);

    await composer.fill("Unknown steer first");
    dispatchGuideShortcut(composer.element());
    await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
    await composer.fill("Unknown steer successor");
    dispatchGuideShortcut(composer.element());
    await expect.poll(() => queueCoordinator.getSnapshot().guidingCount).toBe(2);

    if (settlement === "response mismatch") {
      steerRequest.resolve({ turnId: "turn-response-mismatch" });
    } else {
      steerRequest.reject(
        new GuiHostCommandError({
          source: "missingResult",
          delivery: "deliveryUnknown",
          error: new Error("steer delivery is unknown"),
        }),
      );
    }
    await expect
      .poll(() => queueCoordinator.getSnapshot())
      .toMatchObject({
        guidingCount: 2,
        hasUnknownSteer: true,
      });
    expect(readPendingTextPreviews(queueCoordinator, "steer")).toEqual([
      "Unknown steer first",
      "Unknown steer successor",
    ]);
    expect(queueCoordinator.getReleaseReadiness()).toEqual({
      type: "blocked",
      blockers: [
        { type: "steerQueued", count: 1 },
        { type: "pendingSteers", count: 1, hasUnknown: true },
      ],
    });
    await expect.element(screen.getByText("Guide status unknown", { exact: true })).toBeVisible();
    await steerRequest.promise.catch(() => undefined);
    await Promise.resolve();
    expect(steerTurn).toHaveBeenCalledOnce();
    expect(queueCoordinator.getSnapshot()).toMatchObject({
      guidingCount: 2,
      hasUnknownSteer: true,
    });
  },
);

test("App keeps a local Stop paused until explicit rejected-first and ordinary FIFO recovery", async () => {
  let startedTurnSequence = 0;
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockImplementation(() => {
    startedTurnSequence += 1;
    return Promise.resolve({
      turn: inProgressTurn(`turn-local-recovery-${String(startedTurnSequence)}`),
    });
  });
  const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>().mockRejectedValue(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("local steer rejected"),
    }),
  );
  const { activeTurn, interruptTurn, options, queueCoordinator, screen } = await renderActiveApp({
    startTurn,
    steerTurn,
  });
  const composer = getAppComposer(screen);

  await composer.fill("First ordinary message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Second ordinary message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen.getByRole("button", { name: "Stop" }).click();
  await expect
    .poll(() => interruptTurn.mock.calls)
    .toEqual([[{ threadId: launchThreadId, turnId: activeTurn.id }]]);
  await expect.poll(() => queueCoordinator.getSnapshot().interrupt).toEqual({ phase: "accepted" });
  expect(queueCoordinator.submitSteer(composerDraftCapture("Rejected steer"))).toEqual({
    type: "accepted",
  });
  await expect
    .poll(() => queueCoordinator.getSnapshot().recovery)
    .toEqual({
      reason: "steerDefinitelyNotAccepted",
      count: 1,
    });
  expect(queueCoordinator.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 2,
    guidingCount: 0,
    recoveryCount: 1,
  });
  const queuedTrigger = screen.getByRole("button", { name: "Pending: Queued 2", exact: true });
  await expect.element(queuedTrigger).toBeVisible();

  const interrupted = turnCompleted(eventTurnCompleted, "commit-active-interrupted", {
    ...activeTurn,
    status: "interrupted",
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(interrupted, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );

  await expect.element(screen.getByText("3 messages have not been sent")).toBeVisible();
  expect(queueCoordinator.getSnapshot()).toMatchObject({
    ordinaryQueuedCount: 0,
    guidingCount: 0,
    recoveryCount: 3,
  });
  await expect.element(queuedTrigger).not.toBeInTheDocument();
  expect(startTurn).not.toHaveBeenCalled();
  await composer.fill("Draft preserved during recovery");
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();

  await screen.getByRole("button", { name: "Continue sending" }).click();

  expectStartTurnCalledOnceWithText(startTurn, "Rejected steer");
  const recoveredSteerStarted = turnStarted(
    eventTurnStarted,
    "commit-recovered-steer-started",
    inProgressTurn("turn-local-recovery-1"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSteerStarted, { parentCommitId: interrupted.commitId }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
  await expect.element(composer).toHaveTextContent("Draft preserved during recovery");

  const recoveredSteerCompleted = turnCompleted(
    eventTurnCompleted,
    "commit-recovered-steer",
    baseTurn("turn-local-recovery-1"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSteerCompleted, {
      parentCommitId: recoveredSteerStarted.commitId,
    }),
  );

  expectStartTurnSecondCallWithText(startTurn, "First ordinary message");
  const recoveredFirstOrdinaryStarted = turnStarted(
    eventTurnStarted,
    "commit-recovered-first-ordinary-started",
    inProgressTurn("turn-local-recovery-2"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredFirstOrdinaryStarted, {
      parentCommitId: recoveredSteerCompleted.commitId,
    }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
  const recoveredFirstOrdinaryCompleted = turnCompleted(
    eventTurnCompleted,
    "commit-recovered-first-ordinary",
    baseTurn("turn-local-recovery-2"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredFirstOrdinaryCompleted, {
      parentCommitId: recoveredFirstOrdinaryStarted.commitId,
    }),
  );

  expect(startTurn).toHaveBeenCalledTimes(3);
  const thirdParams = startTurnParamsAt(startTurn, 2);
  expect(startTurn).toHaveBeenNthCalledWith(3, {
    threadId: launchThreadId,
    clientUserMessageId: thirdParams.clientUserMessageId,
    input: [{ type: "text", text: "Second ordinary message", text_elements: [] }],
  });
  const recoveredSecondOrdinaryStarted = turnStarted(
    eventTurnStarted,
    "commit-recovered-second-ordinary-started",
    inProgressTurn("turn-local-recovery-3"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSecondOrdinaryStarted, {
      parentCommitId: recoveredFirstOrdinaryCompleted.commitId,
    }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
  await expect.element(composer).toHaveTextContent("Draft preserved during recovery");
});

test("App auto-recovers a non-local interruption rejected-first before ordinary FIFO", async () => {
  let startedTurnSequence = 0;
  const startTurn = vi.fn<GuiHostCommands["startTurn"]>().mockImplementation(() => {
    startedTurnSequence += 1;
    return Promise.resolve({
      turn: inProgressTurn(`turn-non-local-${String(startedTurnSequence)}`),
    });
  });
  const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>().mockRejectedValue(
    new GuiHostCommandError({
      source: "rpc",
      delivery: "definitelyNotAccepted",
      error: new Error("non-local steer rejected"),
    }),
  );
  const { activeTurn, interruptTurn, options, queueCoordinator, screen } = await renderActiveApp({
    startTurn,
    steerTurn,
  });
  const composer = getAppComposer(screen);

  await composer.fill("Ordinary after non-local interruption");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  expect(queueCoordinator.submitSteer(composerDraftCapture("Non-local rejected steer"))).toEqual({
    type: "accepted",
  });
  await expect
    .poll(() => queueCoordinator.getSnapshot().recovery)
    .toEqual({
      reason: "steerDefinitelyNotAccepted",
      count: 1,
    });

  const interrupted = turnCompleted(eventTurnCompleted, "commit-non-local-interrupted", {
    ...activeTurn,
    status: "interrupted",
  });
  emitProjectionEvent(
    options,
    eventWithEnvelope(interrupted, { parentCommitId: attachResponse.snapshot.headCommitId }),
  );

  expect(interruptTurn).not.toHaveBeenCalled();
  expectStartTurnCalledOnceWithText(startTurn, "Non-local rejected steer");
  const recoveredSteerStarted = turnStarted(
    eventTurnStarted,
    "commit-non-local-recovered-steer-started",
    inProgressTurn("turn-non-local-1"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSteerStarted, { parentCommitId: interrupted.commitId }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
  await expect
    .element(screen.getByRole("button", { name: "Continue sending" }))
    .not.toBeInTheDocument();

  const recoveredSteerCompleted = turnCompleted(
    eventTurnCompleted,
    "commit-non-local-recovered-steer",
    baseTurn("turn-non-local-1"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredSteerCompleted, {
      parentCommitId: recoveredSteerStarted.commitId,
    }),
  );

  expectStartTurnSecondCallWithText(startTurn, "Ordinary after non-local interruption");
  const recoveredOrdinaryStarted = turnStarted(
    eventTurnStarted,
    "commit-non-local-recovered-ordinary-started",
    inProgressTurn("turn-non-local-2"),
  );
  emitProjectionEvent(
    options,
    eventWithEnvelope(recoveredOrdinaryStarted, {
      parentCommitId: recoveredSteerCompleted.commitId,
    }),
  );
  await expect.poll(() => queueCoordinator.getSnapshot().canStop).toBe(true);
});

test("App enables Stop for the current active turn", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);
  const projectionEvent = eventTurnStarted;
  emitProjectionEvent(options, projectionEvent);

  if (projectionEvent.event.type !== "turnStarted") {
    throw new Error("fixture must contain a turnStarted projection event");
  }

  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  await screen.getByRole("button", { name: "Stop" }).click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledWith({
    threadId: launchThreadId,
    turnId: projectionEvent.event.notification.turn.id,
  });
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

test("App renders committed transcript messages from an attached projection", async () => {
  const screen = await renderWithProviders(<App />);

  const options = getHostOptions(startGuiHostConnectionMock);
  initializeAppWithProjection(options, attachWithCommittedMessages());

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("Hello from App")).toBeVisible();
  await expect.element(screen.getByText("Committed App response")).toBeVisible();
});

test("App keeps the document pinned to the bottom after attaching a long transcript", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  scrollToDocumentBottom();
  initializeAppWithProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-attach", [
        agentMessage("agent-scroll-attach", longTranscriptText("Attached transcript")),
      ]),
    ]),
  );

  await expect.element(screen.getByText("Attached transcript line 96")).toBeVisible();
  await vi.waitFor(expectDocumentAtBottom);
});

test("App keeps the document pinned to the bottom after a live committed message", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  initializeAppWithProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live", [
        agentMessage("agent-scroll-live-existing", longTranscriptText("Existing transcript")),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Existing transcript line 96")).toBeVisible();
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "commit-scroll-live-new",
        "turn-scroll-live",
        agentMessage("agent-scroll-live-new", "Live sticky bottom message"),
      ),
      {
        // attachResponse.snapshot.headCommitId is null, so override the fixture parent to test
        // sticky-bottom behavior rather than the commit-chain mismatch path.
        parentCommitId: null,
      },
    ),
  );

  await expect.element(screen.getByText("Live sticky bottom message")).toBeVisible();
  await vi.waitFor(expectDocumentAtBottom);
});

test("App does not force the document to the bottom after a live message when the user scrolled up", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  initializeAppWithProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-away", [
        agentMessage("agent-scroll-away-existing", longTranscriptText("Scrollable transcript")),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Scrollable transcript line 96")).toBeVisible();
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  const scroller = documentScroller();
  scrollToDocumentTop();
  await waitForBrowserFrame();
  await waitForBrowserFrame();
  const scrollTopBeforeMessage = scroller.scrollTop;
  expect(distanceFromDocumentBottom()).toBeGreaterThan(40);

  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "commit-scroll-away-new",
        "turn-scroll-away",
        agentMessage("agent-scroll-away-new", "Message while reading history"),
      ),
      {
        // attachResponse.snapshot.headCommitId is null, so override the fixture parent to test
        // sticky-bottom behavior rather than the commit-chain mismatch path.
        parentCommitId: null,
      },
    ),
  );

  await expect.element(screen.getByText("Message while reading history")).toBeVisible();
  await expectDocumentScrollStaysAwayFromBottom(scrollTopBeforeMessage + 4);
});

test("App keeps the document pinned to the bottom after a live assistant delta", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  initializeAppWithProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live-delta-history", [
        agentMessage(
          "agent-scroll-live-delta-existing",
          longTranscriptText("Existing delta transcript"),
        ),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Existing delta transcript line 96")).toBeVisible();

  const turnStartedEvent = turnStarted(
    eventTurnStarted,
    "commit-scroll-live-delta-turn",
    inProgressTurn("turn-scroll-live-delta"),
  );
  const itemStartedEvent = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-scroll-live-delta-started",
      "turn-scroll-live-delta",
      agentMessage("agent-scroll-live-delta", ""),
    ),
    { parentCommitId: turnStartedEvent.commitId },
  );

  emitProjectionEvent(options, eventWithEnvelope(turnStartedEvent, { parentCommitId: null }));
  emitProjectionEvent(options, itemStartedEvent);
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  const scrollToSpy = vi.spyOn(documentScroller(), "scrollTo");
  try {
    emitProjectionDelta(
      options,
      agentMessageDelta(
        eventAgentMessageDelta,
        "turn-scroll-live-delta",
        "agent-scroll-live-delta",
        longTranscriptText("Streaming delta transcript"),
      ),
    );
    await waitForBrowserFrame();

    await expect.element(screen.getByText("Streaming delta transcript line 96")).toBeVisible();
    await vi.waitFor(() => {
      expect(scrollToSpy).toHaveBeenCalled();
    });
    await vi.waitFor(expectDocumentAtBottom);
  } finally {
    scrollToSpy.mockRestore();
  }
});

test("App does not force the document to the bottom after a live assistant delta when the user scrolled up", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);

  initializeAppWithProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-scroll-live-delta-away-history", [
        agentMessage(
          "agent-scroll-live-delta-away-existing",
          longTranscriptText("Readable delta transcript"),
        ),
      ]),
    ]),
  );
  await expect.element(screen.getByText("Readable delta transcript line 96")).toBeVisible();

  const turnStartedEvent = turnStarted(
    eventTurnStarted,
    "commit-scroll-live-delta-away-turn",
    inProgressTurn("turn-scroll-live-delta-away"),
  );
  const itemStartedEvent = eventWithEnvelope(
    itemStarted(
      eventItemStarted,
      "commit-scroll-live-delta-away-started",
      "turn-scroll-live-delta-away",
      agentMessage("agent-scroll-live-delta-away", ""),
    ),
    { parentCommitId: turnStartedEvent.commitId },
  );

  emitProjectionEvent(options, eventWithEnvelope(turnStartedEvent, { parentCommitId: null }));
  emitProjectionEvent(options, itemStartedEvent);
  scrollToDocumentBottom();
  await waitForBrowserFrame();

  const scroller = documentScroller();
  scrollToDocumentTop();
  await waitForBrowserFrame();
  await waitForBrowserFrame();
  const scrollTopBeforeDelta = scroller.scrollTop;
  expect(distanceFromDocumentBottom()).toBeGreaterThan(40);

  emitProjectionDelta(
    options,
    agentMessageDelta(
      eventAgentMessageDelta,
      "turn-scroll-live-delta-away",
      "agent-scroll-live-delta-away",
      longTranscriptText("Streaming while reading history"),
    ),
  );
  await waitForBrowserFrame();

  await expect.element(screen.getByText("Streaming while reading history line 96")).toBeVisible();
  await expectDocumentScrollStaysAwayFromBottom(scrollTopBeforeDelta + 4);
});

test("App rejects a startup attach that returns a different thread identity", async () => {
  const screen = await renderWithProviders(<App />);
  const { store } = screen;
  const mismatchedThreadId = "00000000-0000-0000-0000-000000000999";
  const mismatchedAttach = attachWithThreadId(attachResponse, mismatchedThreadId);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();

  queueAttachProjectionResponse(commands, mismatchedAttach);
  initializeHost(options, commands);

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("thread/projection/attach returned a different thread identity");
  expect(selectThreadRuntimeRecord(store.getState())).toBeNull();
  expect(createComposerInputQueueCoordinator).not.toHaveBeenCalled();
});

test("App stops forwarding runtime events after backpressure requires manual reconnect", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventTurnStarted;
  const projectionClosed = closedBackpressure;

  const options = getHostOptions(startGuiHostConnectionMock);
  initializeAppWithProjection(options);
  emitProjectionClosed(options, projectionClosed);
  emitProjectionEvent(options, projectionEvent);

  await expect
    .poll(() => selectThreadRuntimeSubscription(store.getState())?.state)
    .toBe("manualReconnectRequired");
  const runtime = selectThreadRuntimeRecord(store.getState());
  expect(runtime?.threadId).toBe(launchThreadId);
  expect(runtime?.snapshotTurns).toStrictEqual(attachResponse.snapshot.thread.turns);
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "manualReconnectRequired",
    reason: "backpressure",
    subscriptionId: attachResponse.subscriptionId,
  });
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
});

test("App disables composer after projection backpressure requires reconnect", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);
  const projectionClosed = closedBackpressure;
  emitProjectionClosed(options, projectionClosed);

  await expectAppComposerDisabled(screen);
});

test("App disables composer when host commands become unavailable", async () => {
  const commandHandle = createGuiHostCommands();
  const { options, screen } = await renderReadyApp(commandHandle);
  const composer = screen.getByRole("region", { name: "Message composer" });
  const input = getAppComposer(screen);
  const qrButton = screen.getByRole("button", { name: "Scan with phone" });

  await expect.element(input).toHaveAttribute("contenteditable", "true");
  options.onCommandsUnavailable?.();

  await expect.element(composer).not.toBeInTheDocument();
  await expect.element(input).not.toBeInTheDocument();
  await expect.element(qrButton).not.toBeInTheDocument();
});

test("App records manual reconnect when a projection event breaks the baseline", async () => {
  const { store } = await renderWithProviders(<App />);
  const projectionEvent = eventItemStarted;

  const options = getHostOptions(startGuiHostConnectionMock);
  initializeAppWithProjection(options);
  emitProjectionEvent(options, projectionEvent);

  await expect
    .poll(() => selectThreadRuntimeSubscription(store.getState())?.state)
    .toBe("manualReconnectRequired");
  expect(selectThreadRuntimeSubscription(store.getState())).toStrictEqual({
    state: "manualReconnectRequired",
    reason: "commitChainMismatch",
    subscriptionId: attachResponse.subscriptionId,
  });
  expect(selectThreadRuntimeEventBuffer(store.getState())).toStrictEqual([]);
});

test("App closes the host connection when unmounted", async () => {
  const screen = await renderWithProviders(<App />);

  await screen.unmount();

  expect(getCleanupConnectionCallCount()).toBe(1);
});

test("App isolates a disposed coordinator late steer settlement from its replacement owner", async () => {
  type SteerResponse = Awaited<ReturnType<GuiHostCommands["steerTurn"]>>;
  const oldSteerRequest = createDeferred<SteerResponse>();
  const oldSteerTurn = vi.fn<GuiHostCommands["steerTurn"]>(() => oldSteerRequest.promise);
  const commands: GuiHostCommands = { ...createGuiHostCommands(), steerTurn: oldSteerTurn };
  const screen = await renderWithProviders(
    <App currentTaskComponent={ThreadSwitchComposerProbe} />,
  );
  const options = getHostOptions(startGuiHostConnectionMock);
  const activeTurn = inProgressTurn("turn-active-owner-switch");
  queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, [activeTurn]));
  initializeHost(options, commands);
  await expect.poll(() => vi.mocked(createComposerInputQueueCoordinator).mock.calls.length).toBe(1);
  const oldCoordinatorResult = vi.mocked(createComposerInputQueueCoordinator).mock.results.at(0);
  if (oldCoordinatorResult?.type !== "return") {
    throw new Error("initial App owner must create a queue coordinator");
  }
  const oldCoordinator = oldCoordinatorResult.value;
  vi.spyOn(oldCoordinator, "reserveRelease").mockReturnValue({
    type: "reserved",
    reservation: { release: vi.fn<() => void>() },
  });
  const composer = getAppComposer(screen);
  const oldIssuingText = "Old issuing steer ".repeat(12).trim();

  await composer.fill(oldIssuingText);
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => oldSteerTurn.mock.calls.length).toBe(1);
  await composer.fill("Old queued successor");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => oldCoordinator.getSnapshot().guidingCount).toBe(2);
  const oldRevision = oldCoordinator.getSnapshot().detailRevision;
  const oldPage = oldCoordinator.readPendingInputPage({
    lane: "steer",
    revision: oldRevision,
    cursor: null,
    limit: 1,
  });
  if (oldPage.type !== "page" || oldPage.nextCursor == null || oldPage.items[0] == null) {
    throw new Error("old owner must expose a bounded steer page");
  }
  const oldDetailKey = oldPage.items[0].key;
  expect(
    oldCoordinator.readPendingInputDetail({ key: oldDetailKey, revision: oldRevision }),
  ).toEqual({
    type: "detail",
    key: oldDetailKey,
    revision: oldRevision,
    text: oldIssuingText,
  });
  await screen.getByRole("button", { name: "Pending: Guide 2", exact: true }).click();
  const oldDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await oldDialog.getByRole("button", { name: /Expand pending message:/ }).click();
  await expect.element(oldDialog.getByText(oldIssuingText, { exact: true })).toBeVisible();

  const replacementTurn = inProgressTurn("turn-replacement-owner");
  const candidateAttach = attachWithThreadId(
    attachWithTurns(attachResponse, [replacementTurn]),
    candidateThreadId,
  );
  queueAttachProjectionResponse(commands, candidateAttach);
  const continueThread = threadSwitchProbeContinueThread;
  if (continueThread == null) {
    throw new Error("thread switch probe must expose continueThread");
  }
  threadSwitchProbePromise = continueThread(candidateThreadId);
  await threadSwitchProbePromise;
  await expect.poll(() => vi.mocked(createComposerInputQueueCoordinator).mock.calls.length).toBe(2);
  await expect.element(oldDialog).not.toBeInTheDocument();
  await expect.element(composer).toHaveFocus();
  await expect
    .poll(() => oldCoordinator.getReleaseReadiness())
    .toEqual({
      type: "blocked",
      blockers: [{ type: "disposed" }],
    });
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await expect
    .poll(() => selectThreadRuntimeRecord(screen.store.getState())?.snapshotTurns)
    .toStrictEqual([replacementTurn]);
  const replacementResult = vi.mocked(createComposerInputQueueCoordinator).mock.results.at(1);
  if (replacementResult?.type !== "return") {
    throw new Error("replacement App owner must create a queue coordinator");
  }
  const replacementCoordinator = replacementResult.value;
  expect(replacementCoordinator.ownerThreadId).toBe(candidateThreadId);
  const replacementSnapshot = replacementCoordinator.getSnapshot();
  const replacementTranscript = screen.store.getState().transcriptState;
  expect(
    replacementCoordinator.readPendingInputPage({
      lane: "steer",
      revision: replacementSnapshot.detailRevision,
      cursor: oldPage.nextCursor,
      limit: 1,
    }),
  ).toEqual({ type: "stale", revision: replacementSnapshot.detailRevision });
  expect(
    replacementCoordinator.readPendingInputDetail({
      key: oldDetailKey,
      revision: replacementSnapshot.detailRevision,
    }),
  ).toEqual({ type: "missing", revision: replacementSnapshot.detailRevision });
  expect(
    oldCoordinator.readPendingInputDetail({ key: oldDetailKey, revision: oldRevision }),
  ).toEqual({ type: "unavailable" });

  oldSteerRequest.resolve({ turnId: activeTurn.id });
  await oldSteerRequest.promise;
  await Promise.resolve();

  expect(oldSteerTurn).toHaveBeenCalledOnce();
  expect(commands.startTurn).not.toHaveBeenCalled();
  expect(replacementCoordinator.getSnapshot()).toBe(replacementSnapshot);
  expect(screen.store.getState().transcriptState).toBe(replacementTranscript);
  await expect.element(screen.getByText(oldIssuingText, { exact: true })).not.toBeInTheDocument();
  await expect
    .element(screen.getByText("Old queued successor", { exact: true }))
    .not.toBeInTheDocument();
});

test("App owns one queue coordinator for the matching attached launch thread until cleanup", async () => {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);
  const commands = createGuiHostCommands();
  const createQueueCoordinator = vi.mocked(createComposerInputQueueCoordinator);
  const queue = createQueueCoordinatorMock(launchThreadId);
  createQueueCoordinator.mockReturnValue(queue.coordinator);
  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);

  await expect.poll(() => createQueueCoordinator.mock.calls.length).toBe(1);
  expect(createQueueCoordinator).toHaveBeenCalledWith({
    threadId: launchThreadId,
    activeTurnId: null,
    startTurn: commands.startTurn,
    steerTurn: commands.steerTurn,
    interruptTurn: commands.interruptTurn,
  });
  emitProjectionEvent(options, eventTurnStarted);

  expect(queue.observeAcceptedEvent).toHaveBeenCalledOnce();
  expect(queue.observeAcceptedEvent).toHaveBeenCalledWith({
    notification: eventTurnStarted,
    replay: "live",
  });

  markCommandsUnavailable(options);

  expect(createQueueCoordinator).toHaveBeenCalledOnce();
  expect(queue.dispose).toHaveBeenCalledOnce();

  await screen.unmount();

  expect(queue.dispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);

  emitProjectionEvent(options, eventTurnStarted);

  expect(queue.observeAcceptedEvent).toHaveBeenCalledOnce();
  expect(createQueueCoordinator).toHaveBeenCalledOnce();
});

test("App publishes a completed thread switch atomically across capabilities and Redux", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId);
  const candidateQueue = createQueueCoordinatorMock(candidateThreadId);
  vi.mocked(createComposerInputQueueCoordinator).mockImplementation(({ threadId }) =>
    threadId === launchThreadId ? initialQueue.coordinator : candidateQueue.coordinator,
  );
  const pendingAttach =
    createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
  const candidateItem = agentMessage("candidate-switch-item", "");
  const candidateAttach = attachWithThreadId(
    attachWithTurns(attachReplacement, [inProgressTurn("candidate-switch-turn")]),
    candidateThreadId,
  );
  const commands = createGuiHostCommands();
  const { continueButton, options, screen } = await renderThreadSwitchProbe(commands);
  vi.mocked(commands.attachThreadProjection).mockReturnValueOnce(pendingAttach.promise);
  const activeThread = screen.getByLabelText("Active thread owner");
  const activeQueue = screen.getByLabelText("Active queue owner");
  const initialOwner = requireThreadSwitchProbeOwner();
  const initialProjectionDispose = vi.spyOn(initialOwner.projectionOwner, "dispose");

  await expect.element(activeThread).toHaveTextContent(launchThreadId);
  await expect.element(activeQueue).toHaveTextContent(launchThreadId);
  await continueButton.click();
  await expect.poll(() => vi.mocked(commands.attachThreadProjection).mock.calls.length).toBe(2);
  expect(commands.attachThreadProjection).toHaveBeenNthCalledWith(2, {
    threadId: candidateThreadId,
  });

  const oldItem = agentMessage("old-switch-item", "");
  const oldTurnEvent = turnStarted(
    eventTurnStarted,
    "commit-old-switch-turn",
    inProgressTurn("old-switch-turn"),
  );
  const oldItemEvent = eventWithEnvelope(
    itemStarted(eventItemStarted, "commit-old-switch-item", "old-switch-turn", oldItem),
    { parentCommitId: oldTurnEvent.commitId },
  );
  const oldDelta = agentMessageDelta(
    eventAgentMessageDelta,
    "old-switch-turn",
    oldItem.id,
    "Old owner stayed live",
  );
  const candidateOwner = {
    threadId: candidateThreadId,
    subscriptionId: candidateAttach.subscriptionId,
  };
  const candidateEvent = eventForThreadOwner(
    eventWithEnvelope(
      itemStarted(
        eventItemStarted,
        "commit-candidate-switch-item",
        "candidate-switch-turn",
        candidateItem,
      ),
      { parentCommitId: candidateAttach.snapshot.headCommitId },
    ),
    candidateOwner,
  );
  const candidateDelta = deltaForThreadOwner(
    agentMessageDelta(
      eventAgentMessageDelta,
      "candidate-switch-turn",
      candidateItem.id,
      "Candidate notification replayed",
    ),
    candidateOwner,
  );
  emitProjectionEvent(options, oldTurnEvent);
  emitProjectionEvent(options, oldItemEvent);
  emitProjectionDelta(options, oldDelta);
  emitProjectionEvent(options, candidateEvent);
  emitProjectionDelta(options, candidateDelta);

  await expect
    .poll(() =>
      selectTranscriptEntry(
        screen.store.getState(),
        transcriptEntryIdFor("old-switch-turn", oldItem.id),
      ),
    )
    .toStrictEqual({
      type: "message",
      id: oldItem.id,
      turnId: "old-switch-turn",
      role: "assistant",
      rendering: { mode: "streamingMarkdown", source: "Old owner stayed live" },
      revision: 1,
    });
  await expect.element(activeThread).toHaveTextContent(launchThreadId);
  expect(requireThreadSwitchProbeOwner()).toBe(initialOwner);
  expect(selectThreadRuntimeEventBuffer(screen.store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: oldTurnEvent, replay: "live" },
    { type: "projectionEvent", notification: oldItemEvent, replay: "live" },
  ]);
  expect(
    selectTranscriptEntry(
      screen.store.getState(),
      transcriptEntryIdFor("candidate-switch-turn", candidateItem.id),
    ),
  ).toBeNull();
  pendingAttach.resolve(candidateAttach);
  await expect(requireThreadSwitchProbePromise()).resolves.toMatchObject({ type: "switched" });

  await expect.element(activeThread).toHaveTextContent(candidateThreadId);
  await expect.element(activeQueue).toHaveTextContent(candidateThreadId);
  await expect
    .poll(() =>
      selectTranscriptEntry(
        screen.store.getState(),
        transcriptEntryIdFor("candidate-switch-turn", candidateItem.id),
      ),
    )
    .toStrictEqual({
      type: "message",
      id: candidateItem.id,
      turnId: "candidate-switch-turn",
      role: "assistant",
      rendering: { mode: "streamingMarkdown", source: "Candidate notification replayed" },
      revision: 1,
    });
  await expect.poll(() => threadSwitchProbeActiveOwner?.threadId).toBe(candidateThreadId);
  const activeCandidateOwner = requireThreadSwitchProbeOwner();
  const candidateProjectionDispose = vi.spyOn(activeCandidateOwner.projectionOwner, "dispose");
  expect(activeCandidateOwner.queueCoordinator).toBe(candidateQueue.coordinator);
  expect(activeCandidateOwner.subscriptionId).toBe(candidateAttach.subscriptionId);
  expect(selectThreadIdentityState(screen.store.getState())).toStrictEqual({
    launchThreadId: candidateThreadId,
    attachedThreadId: candidateThreadId,
    attachStatus: "attached",
  });
  expect(selectThreadRuntimeRecord(screen.store.getState())?.threadId).toBe(candidateThreadId);
  expect(selectThreadRuntimeSubscription(screen.store.getState())).toStrictEqual({
    state: "active",
  });
  expect(screen.store.getState().transcriptState.threadId).toBe(candidateThreadId);
  expect(selectThreadRuntimeEventBuffer(screen.store.getState())).toStrictEqual([
    { type: "projectionEvent", notification: candidateEvent, replay: "live" },
  ]);
  expect(candidateQueue.observeAcceptedEvent).toHaveBeenCalledExactlyOnceWith({
    notification: candidateEvent,
    replay: "live",
  });
  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(initialProjectionDispose).toHaveBeenCalledOnce();
  expect(candidateQueue.dispose).not.toHaveBeenCalled();
  expect(commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
  });

  await screen.unmount();

  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(initialProjectionDispose).toHaveBeenCalledOnce();
  expect(candidateQueue.dispose).toHaveBeenCalledOnce();
  expect(candidateProjectionDispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);
});

test("App keeps the initial owner when its queue blocks a thread switch", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId, {
    type: "blocked",
    blockers: [{ type: "ordinaryQueued", count: 1 }],
  });
  vi.mocked(createComposerInputQueueCoordinator).mockReturnValue(initialQueue.coordinator);
  const commands = createGuiHostCommands();
  const { continueButton, screen } = await renderThreadSwitchProbe(commands);
  const initialOwner = requireThreadSwitchProbeOwner();

  await continueButton.click();
  await expect(requireThreadSwitchProbePromise()).resolves.toMatchObject({
    type: "blocked",
    reason: { type: "queueReleaseBlocked" },
  });

  expect(commands.resumeThread).not.toHaveBeenCalled();
  expect(commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: launchThreadId,
  });
  expect(requireThreadSwitchProbeOwner()).toBe(initialOwner);
  await expect
    .element(screen.getByLabelText("Active thread owner"))
    .toHaveTextContent(launchThreadId);
  expect(initialQueue.dispose).not.toHaveBeenCalled();
  expect(createComposerInputQueueCoordinator).toHaveBeenCalledOnce();
});

test("App keeps the initial owner when attaching the switch candidate fails", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId);
  vi.mocked(createComposerInputQueueCoordinator).mockReturnValue(initialQueue.coordinator);
  const error = new Error("candidate attach failed");
  const commands = createGuiHostCommands();
  const { continueButton, screen } = await renderThreadSwitchProbe(commands);
  vi.mocked(commands.attachThreadProjection).mockRejectedValueOnce(error);
  const initialOwner = requireThreadSwitchProbeOwner();

  await continueButton.click();
  await expect(requireThreadSwitchProbePromise()).resolves.toMatchObject({
    type: "failed",
    phase: "attach",
    error,
  });

  expect(commands.resumeThread).toHaveBeenCalledOnce();
  expect(commands.attachThreadProjection).toHaveBeenCalledTimes(2);
  expect(commands.attachThreadProjection).toHaveBeenNthCalledWith(2, {
    threadId: candidateThreadId,
  });
  expect(commands.detachThreadProjection).not.toHaveBeenCalled();
  expect(requireThreadSwitchProbeOwner()).toBe(initialOwner);
  await expect
    .element(screen.getByLabelText("Active thread owner"))
    .toHaveTextContent(launchThreadId);
  expect(initialQueue.reservationRelease).toHaveBeenCalledOnce();
  expect(initialQueue.dispose).not.toHaveBeenCalled();
});

test("App cleans up once on unmount and ignores a late switch candidate completion", async () => {
  const initialQueue = createQueueCoordinatorMock(launchThreadId);
  vi.mocked(createComposerInputQueueCoordinator).mockReturnValue(initialQueue.coordinator);
  const pendingAttach =
    createDeferred<Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>>();
  const candidateAttach = attachWithThreadId(attachReplacement, candidateThreadId);
  const commands = createGuiHostCommands();
  const { continueButton, screen } = await renderThreadSwitchProbe(commands);
  vi.mocked(commands.attachThreadProjection).mockReturnValueOnce(pendingAttach.promise);
  const initialOwner = requireThreadSwitchProbeOwner();
  const initialProjectionDispose = vi.spyOn(initialOwner.projectionOwner, "dispose");

  await continueButton.click();
  await expect.poll(() => vi.mocked(commands.attachThreadProjection).mock.calls.length).toBe(2);
  expect(commands.attachThreadProjection).toHaveBeenNthCalledWith(2, {
    threadId: candidateThreadId,
  });
  const switching = requireThreadSwitchProbePromise();
  await screen.unmount();

  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(initialProjectionDispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);
  pendingAttach.resolve(candidateAttach);
  await expect(switching).resolves.toMatchObject({
    type: "blocked",
    reason: { type: "disposed" },
  });

  expect(createComposerInputQueueCoordinator).toHaveBeenCalledOnce();
  expect(initialQueue.dispose).toHaveBeenCalledOnce();
  expect(initialProjectionDispose).toHaveBeenCalledOnce();
  expect(getCleanupConnectionCallCount()).toBe(1);
  expect(commands.detachThreadProjection).toHaveBeenCalledExactlyOnceWith({
    threadId: candidateThreadId,
  });
  expect(selectThreadIdentityState(screen.store.getState())).toStrictEqual({
    launchThreadId,
    attachedThreadId: launchThreadId,
    attachStatus: "attached",
  });
  expect(selectThreadRuntimeRecord(screen.store.getState())?.threadId).toBe(launchThreadId);
  expect(screen.store.getState().transcriptState.threadId).toBe(launchThreadId);
});

test("App cancels pending projection delta frame dispatch when unmounted", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  try {
    const screen = await renderWithProviders(<App />);
    const { store } = screen;
    const options = getHostOptions(startGuiHostConnectionMock);
    const initialItem = agentMessage("agent-raf-cleanup", "");

    initializeAppWithProjection(options, attachWithTurns(attachResponse, []));
    const turnStartedEvent = turnStarted(
      eventTurnStarted,
      "commit-raf-cleanup-turn",
      inProgressTurn("turn-raf-cleanup"),
    );
    const itemStartedEvent = eventWithEnvelope(
      itemStarted(eventItemStarted, "commit-raf-cleanup-started", "turn-raf-cleanup", initialItem),
      { parentCommitId: turnStartedEvent.commitId },
    );
    emitProjectionEvent(options, turnStartedEvent);
    emitProjectionEvent(options, itemStartedEvent);
    emitProjectionDelta(
      options,
      agentMessageDelta(eventAgentMessageDelta, "turn-raf-cleanup", "agent-raf-cleanup", "Lost"),
    );

    const entryId = transcriptEntryIdFor("turn-raf-cleanup", "agent-raf-cleanup");
    await expect
      .poll(() => store.getState().transcriptState.entriesById[entryId])
      .toMatchObject({ type: "live", status: "started" });
    await screen.unmount();
    vi.advanceTimersToNextFrame();

    expect(getCleanupConnectionCallCount()).toBe(1);
    expect(store.getState().transcriptState.entriesById[entryId]).toStrictEqual({
      type: "live",
      id: "agent-raf-cleanup",
      key: entryId,
      turnId: "turn-raf-cleanup",
      itemId: "agent-raf-cleanup",
      status: "started",
      initialItem,
      transientText: "",
      revision: 0,
    });
    expect(selectTranscriptEntry(store.getState(), entryId)).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test("App does not render optimistic user messages after send", async () => {
  const commandHandle = createGuiHostCommands();
  const { screen } = await renderReadyApp(commandHandle);

  await getAppComposer(screen).fill("Not optimistic");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  await expect.element(screen.getByText("Not optimistic")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
