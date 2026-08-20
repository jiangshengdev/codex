import { Toast } from "@heroui/react";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  attachResponse,
  createGuiHostCommands,
  launchThreadId,
} from "@/__tests__/appBrowserTestSupport";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";

const initializedStatus: GuiHostStatus = { label: "initialized" };
const emptySkillCatalogSnapshot = {
  type: "ready",
  candidates: [],
  partialErrorCount: 0,
} as const;
const skillCatalogController: ActiveThreadOwnerHandle["skillCatalog"] = {
  getSnapshot: () => emptySkillCatalogSnapshot,
  subscribe: () => () => undefined,
  invalidate: () => false,
  retry: () => false,
};

async function renderAttached(
  commandHandle: GuiHostCommands | null = createGuiHostCommands(),
  composerInputQueueController: ComposerInputQueueCoordinator | null = null,
) {
  const result = await renderWithProviders(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        authorizationToken={null}
        commands={commandHandle}
        composerInputQueueController={composerInputQueueController}
        guardCompositionEndEnter={false}
        guiHostStatus={initializedStatus}
        routeTarget={{ type: "currentTask", threadId: launchThreadId }}
        skillCatalogController={skillCatalogController}
      />
    </>,
  );
  result.store.dispatch(launchThreadIdRecorded(launchThreadId));
  result.store.dispatch(attachedThreadIdObserved(launchThreadId));
  result.store.dispatch(threadRuntimeAttached(attachResponse));
  return result;
}

const nextAnimationFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

type MutableVisualViewport = VisualViewport & {
  height: number;
  offsetTop: number;
  pageTop: number;
};

function installVisualViewport({
  height,
  offsetTop = 0,
  pageTop = 0,
}: {
  height: number;
  offsetTop?: number;
  pageTop?: number;
}) {
  const target = new EventTarget();
  const originalVisualViewport = window.visualViewport;
  const viewport = {
    addEventListener: target.addEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    height,
    offsetTop,
    pageTop,
    removeEventListener: target.removeEventListener.bind(target),
  } as MutableVisualViewport;

  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });

  return {
    dispatchResize() {
      return target.dispatchEvent(new Event("resize"));
    },
    restore() {
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: originalVisualViewport,
      });
    },
    viewport,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("does not scroll after visual viewport resize when composer is already visible", async () => {
  const visualViewport = installVisualViewport({ height: 699 });
  try {
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(699);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    const screen = await renderAttached();
    const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
    if (!(composerShell instanceof HTMLElement)) {
      throw new Error("composer shell must render");
    }
    vi.spyOn(composerShell, "getBoundingClientRect").mockReturnValue({
      bottom: 361,
      height: 152,
      left: 0,
      right: 390,
      top: 209,
      width: 390,
      x: 0,
      y: 209,
      toJSON: () => ({}),
    });

    await screen.getByRole("combobox", { name: "Message Codex", exact: true }).click();
    visualViewport.viewport.height = 361;
    expect(visualViewport.dispatchResize()).toBe(true);
    await nextAnimationFrame();

    expect(scrollBy).not.toHaveBeenCalled();
  } finally {
    visualViewport.restore();
  }
});

test("scrolls once after visual viewport resize when composer remains covered", async () => {
  const visualViewport = installVisualViewport({ height: 699 });
  try {
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(699);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    const screen = await renderAttached();
    const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
    if (!(composerShell instanceof HTMLElement)) {
      throw new Error("composer shell must render");
    }
    vi.spyOn(composerShell, "getBoundingClientRect").mockReturnValue({
      bottom: 699,
      height: 152,
      left: 0,
      right: 390,
      top: 547,
      width: 390,
      x: 0,
      y: 547,
      toJSON: () => ({}),
    });

    await screen.getByRole("combobox", { name: "Message Codex", exact: true }).click();
    visualViewport.viewport.height = 361;
    expect(visualViewport.dispatchResize()).toBe(true);
    await nextAnimationFrame();

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 346, behavior: "smooth" });

    expect(visualViewport.dispatchResize()).toBe(true);
    await nextAnimationFrame();
    expect(scrollBy).toHaveBeenCalledTimes(1);
  } finally {
    visualViewport.restore();
  }
});

test("does not scroll for visual viewport resize after composer blur", async () => {
  const visualViewport = installVisualViewport({ height: 699 });
  try {
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(699);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    const screen = await renderAttached();
    const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
    if (!(composerShell instanceof HTMLElement)) {
      throw new Error("composer shell must render");
    }
    vi.spyOn(composerShell, "getBoundingClientRect").mockReturnValue({
      bottom: 699,
      height: 152,
      left: 0,
      right: 390,
      top: 547,
      width: 390,
      x: 0,
      y: 547,
      toJSON: () => ({}),
    });

    const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
    await composer.click();
    composer.element().blur();
    visualViewport.viewport.height = 361;
    expect(visualViewport.dispatchResize()).toBe(true);
    await nextAnimationFrame();

    expect(scrollBy).not.toHaveBeenCalled();
  } finally {
    visualViewport.restore();
  }
});

test("keeps a taller pending-input region accessible and horizontally closed in a narrow viewport", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  const activeTurnId = "viewport-active-turn";
  const pendingSteer = createDeferred<Awaited<ReturnType<GuiHostCommands["steerTurn"]>>>();
  try {
    await page.viewport(390, 700);
    const commandHandle = createGuiHostCommands();
    vi.mocked(commandHandle.steerTurn).mockReturnValue(pendingSteer.promise);
    const controller = createComposerInputQueueCoordinator({
      threadId: launchThreadId,
      activeTurnId,
      startTurn: commandHandle.startTurn,
      steerTurn: commandHandle.steerTurn,
      interruptTurn: commandHandle.interruptTurn,
    });
    const screen = await renderAttached(commandHandle, controller);
    const composerShell = screen.getByRole("region", { name: "Message composer" }).element();
    const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
    const baselineComposerHeight = composerShell.getBoundingClientRect().height;
    const longToken = "x".repeat(160);

    controller.submitSteer([{ type: "text", text: longToken, text_elements: [] }]);
    controller.submitSteer([
      {
        type: "text",
        text: "Additional guiding context ".repeat(12),
        text_elements: [],
      },
    ]);
    controller.submit([
      { type: "text", text: "Ordinary message after guidance", text_elements: [] },
    ]);

    const pendingRegion = screen.getByRole("region", { name: "Pending messages", exact: true });
    await expect.element(pendingRegion).toBeVisible();
    await expect
      .element(pendingRegion.getByRole("heading", { name: "Guiding", exact: true }))
      .toBeVisible();
    await expect
      .element(pendingRegion.getByText("1 message queued", { exact: true }))
      .toBeVisible();
    const longPreview = pendingRegion.getByText(longToken, { exact: true });
    await expect.element(longPreview).toBeVisible();

    await expect
      .poll(() => {
        const documentScroller = document.scrollingElement;
        if (!(documentScroller instanceof HTMLElement)) {
          return null;
        }
        const pendingElement = pendingRegion.element();
        const previewElement = longPreview.element();
        const pendingBounds = pendingElement.getBoundingClientRect();

        return {
          composerGrew: composerShell.getBoundingClientRect().height > baselineComposerHeight,
          composerHorizontallyClosed: composerShell.scrollWidth <= composerShell.clientWidth + 1,
          documentHorizontallyClosed:
            documentScroller.scrollWidth <= documentScroller.clientWidth + 1,
          lineClamp: getComputedStyle(previewElement).webkitLineClamp,
          pendingHorizontallyClosed: pendingElement.scrollWidth <= pendingElement.clientWidth + 1,
          pendingWithinViewport:
            pendingBounds.left >= -1 && pendingBounds.right <= window.innerWidth + 1,
          previewHorizontallyClosed: previewElement.scrollWidth <= previewElement.clientWidth + 1,
        };
      })
      .toEqual({
        composerGrew: true,
        composerHorizontallyClosed: true,
        documentHorizontallyClosed: true,
        lineClamp: "3",
        pendingHorizontallyClosed: true,
        pendingWithinViewport: true,
        previewHorizontallyClosed: true,
      });

    await composer.click();
    await expect.element(composer).toHaveFocus();
  } finally {
    pendingSteer.resolve({ turnId: activeTurnId });
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});
