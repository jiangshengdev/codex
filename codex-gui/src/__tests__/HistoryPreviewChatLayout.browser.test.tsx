import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";
import {
  attachResponse,
  createGuiHostCommands,
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

function requirePanel(container: HTMLElement): HTMLElement {
  const panel = container.querySelector(".task-bottom-panel");
  if (!(panel instanceof HTMLElement)) throw new Error("Expected a bottom action panel");
  return panel;
}

function panelAppearance(panel: HTMLElement) {
  const style = getComputedStyle(panel);
  return {
    background: style.backgroundColor,
    color: style.color,
    radius: style.borderTopLeftRadius,
    borderColor: style.borderTopColor,
    borderWidth: style.borderTopWidth,
    shadow: style.boxShadow,
  };
}

function expectAligned(first: DOMRect, second: DOMRect) {
  expect(Math.abs(first.left - second.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(first.right - second.right)).toBeLessThanOrEqual(1);
}

test.each([
  [390, "short"],
  [1280, "short"],
  [390, "long"],
  [1280, "long"],
] as const)("aligns preview and chat at %s pixels with %s content", async (width, length) => {
  const originalViewport = { width: window.innerWidth, height: window.innerHeight };
  try {
    await page.viewport(width, 720);
    window.history.replaceState({}, "", `/history/${launchThreadId}`);
    seedBrowserAuthorizationSession({ token: "layout-test-secret" });
    const text =
      length === "long" ? "A line of conversation history.\n".repeat(80) : "A short prompt.";
    const fixture = attachWithTurns(attachResponse, [
      baseTurn("layout-turn", [
        userMessage("layout-user", [textInput(text)]),
        agentMessage(
          "layout-answer",
          "[Last message link](https://example.invalid/last-message)",
          "final_answer",
        ),
      ]),
    ]);
    const commands = createGuiHostCommands();
    vi.mocked(commands.readThread).mockResolvedValue({ thread: fixture.snapshot.thread });
    queueAttachProjectionResponse(commands, fixture);
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/history/${launchThreadId}`] }),
    );
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    initializeHost(getHostOptions(guiHostClientMock.startGuiHostConnection), commands);
    const transcript = screen.getByRole("region", { name: "Committed transcript" });
    const continueAction = screen.getByRole("button", { name: "Continue this task" });
    await expect.element(continueAction).toBeEnabled();
    await expect.element(transcript).toBeVisible();
    await expect.element(screen.getByText("Read-only history", { exact: true })).toBeInViewport();
    await expect.element(screen.getByRole("button", { name: "Back to history" })).toBeInViewport();
    window.scrollTo({ top: 0 });
    await expect.poll(() => window.scrollY).toBe(0);

    const previewPanel = requirePanel(screen.container);
    const previewBounds = transcript.element().getBoundingClientRect();
    const previewCardBounds = previewPanel.getBoundingClientRect();
    const previewAppearance = panelAppearance(previewPanel);
    const previewBottomGap = window.innerHeight - previewCardBounds.bottom;
    const bannerBottom = screen.getByRole("banner").element().getBoundingClientRect().bottom;
    expectAligned(previewBounds, previewCardBounds);
    expect(Math.abs(previewBounds.top - bannerBottom)).toBeLessThanOrEqual(1);
    expect(previewCardBounds.left).toBeGreaterThan(0);
    expect(previewBottomGap).toBeGreaterThan(0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
    const aside = previewPanel.closest("aside");
    expect(aside).not.toBeNull();
    expect(aside?.contains(document.elementFromPoint(2, previewCardBounds.top + 2))).toBe(false);

    const lastLink = screen.getByRole("link", { name: "Last message link" });
    lastLink.element().focus();
    await expect.element(lastLink).toHaveFocus();
    window.scrollTo({ top: document.documentElement.scrollHeight });
    await expect
      .poll(
        () =>
          lastLink.element().getBoundingClientRect().bottom <=
          previewPanel.getBoundingClientRect().top,
      )
      .toBe(true);
    await expect.element(lastLink).toBeInViewport({ ratio: 1 });

    await continueAction.click();
    await expect
      .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
      .toBeVisible();
    await userEvent.unhover(document.body);
    window.scrollTo({ top: 0 });
    await expect.poll(() => window.scrollY).toBe(0);
    const chatPanel = requirePanel(screen.container);
    await expect.poll(() => panelAppearance(chatPanel)).toEqual(previewAppearance);
    const chatBounds = transcript.element().getBoundingClientRect();
    const chatCardBounds = chatPanel.getBoundingClientRect();
    expectAligned(chatBounds, chatCardBounds);
    expectAligned(chatBounds, previewBounds);
    expect(Math.abs(chatBounds.top - previewBounds.top)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(window.innerHeight - chatCardBounds.bottom - previewBottomGap),
    ).toBeLessThanOrEqual(1);
    expect(chatCardBounds.height).toBeGreaterThan(previewCardBounds.height);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
    lastLink.element().focus();
    await expect.element(lastLink).toHaveFocus();
    window.scrollTo({ top: document.documentElement.scrollHeight });
    await expect
      .poll(
        () =>
          lastLink.element().getBoundingClientRect().bottom <=
          chatPanel.getBoundingClientRect().top,
      )
      .toBe(true);
    await expect.element(lastLink).toBeInViewport({ ratio: 1 });
    expect(commands.readThread).toHaveBeenCalledExactlyOnceWith({
      threadId: launchThreadId,
      includeTurns: true,
    });
    expect(commands.attachThreadProjection).toHaveBeenCalledExactlyOnceWith({
      threadId: launchThreadId,
    });
  } finally {
    window.scrollTo({ top: 0 });
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});
