import { Toast } from "@heroui/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  attachResponse,
  createGuiHostCommands,
  launchThreadId,
} from "@/__tests__/appBrowserTestSupport";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import { threadRuntimeAttached } from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { ComposerTurnControl } from "@/features/composerTurnControl/ComposerTurnControl";

const initializedStatus: GuiHostStatus = { label: "initialized" };

async function renderAttached(commandHandle: GuiHostCommands | null = createGuiHostCommands()) {
  const result = await renderWithProviders(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        authorizationToken={null}
        commands={commandHandle}
        guardCompositionEndEnter={false}
        guiHostStatus={initializedStatus}
        routeTarget={{ type: "currentTask", threadId: launchThreadId }}
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

    await screen.getByPlaceholder("Message Codex").click();
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

    await screen.getByPlaceholder("Message Codex").click();
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

    const composer = screen.getByPlaceholder("Message Codex");
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
