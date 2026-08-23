import { Toast } from "@heroui/react";
import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  attachResponse,
  createGuiHostCommands,
  launchThreadId,
} from "@/__tests__/appBrowserTestSupport";
import { createDeferred } from "@/__tests__/testDeferred";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import type { ActiveThreadOwnerHandle } from "@/features/projectionCoordination/activeThreadOwner";
import { eventTurnCompleted } from "@/features/projection/__tests__/projectionFixtures";
import type {
  SkillCatalogCandidate,
  SkillCatalogState,
} from "@/features/skillCatalog/skillCatalogOwner";
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
  activeSkillCatalogController: ActiveThreadOwnerHandle["skillCatalog"] = skillCatalogController,
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
        skillCatalogController={activeSkillCatalogController}
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

async function arrangeVisualViewportResize({
  composerBottom,
  composerTop,
  initialViewportHeight,
}: {
  composerBottom: number;
  composerTop: number;
  initialViewportHeight: number;
}) {
  const visualViewport = installVisualViewport({ height: initialViewportHeight });
  try {
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
      initialViewportHeight,
    );
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    const screen = await renderAttached();
    const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
    if (!(composerShell instanceof HTMLElement)) {
      throw new Error("composer shell must render");
    }
    vi.spyOn(composerShell, "getBoundingClientRect").mockReturnValue({
      bottom: composerBottom,
      height: composerBottom - composerTop,
      left: 0,
      right: 390,
      top: composerTop,
      width: 390,
      x: 0,
      y: composerTop,
      toJSON: () => ({}),
    });

    return {
      cleanup: visualViewport.restore,
      screen,
      scrollBy,
      async resizeTo(height: number): Promise<void> {
        visualViewport.viewport.height = height;
        expect(visualViewport.dispatchResize()).toBe(true);
        await nextAnimationFrame();
      },
    };
  } catch (error) {
    visualViewport.restore();
    throw error;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("does not scroll after visual viewport resize when composer is already visible", async () => {
  const { cleanup, resizeTo, screen, scrollBy } = await arrangeVisualViewportResize({
    initialViewportHeight: 699,
    composerTop: 209,
    composerBottom: 361,
  });
  try {
    await screen.getByRole("combobox", { name: "Message Codex", exact: true }).click();
    await resizeTo(361);

    expect(scrollBy).not.toHaveBeenCalled();
  } finally {
    cleanup();
  }
});

test("scrolls once after visual viewport resize when composer remains covered", async () => {
  const { cleanup, resizeTo, screen, scrollBy } = await arrangeVisualViewportResize({
    initialViewportHeight: 699,
    composerTop: 547,
    composerBottom: 699,
  });
  try {
    await screen.getByRole("combobox", { name: "Message Codex", exact: true }).click();
    await resizeTo(361);

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 346, behavior: "smooth" });

    await resizeTo(361);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  } finally {
    cleanup();
  }
});

test("does not scroll for visual viewport resize after composer blur", async () => {
  const { cleanup, resizeTo, screen, scrollBy } = await arrangeVisualViewportResize({
    initialViewportHeight: 699,
    composerTop: 547,
    composerBottom: 699,
  });
  try {
    const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
    await composer.click();
    composer.element().blur();
    await resizeTo(361);

    expect(scrollBy).not.toHaveBeenCalled();
  } finally {
    cleanup();
  }
});

test("keeps the compact pending trigger and right Drawer horizontally closed in a narrow viewport", async () => {
  const originalViewport = { height: window.innerHeight, width: window.innerWidth };
  if (eventTurnCompleted.event.type !== "turnCompleted") {
    throw new Error("terminal fixture must complete a turn");
  }
  const activeTurnId = eventTurnCompleted.event.notification.turn.id;
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
    const responsiveSkill: SkillCatalogCandidate = {
      name: "responsive-skill",
      path: "/skills/responsive-skill/SKILL.md",
      description: "Responsive skill candidate",
      scope: "repo",
      interface: {
        displayName: "Responsive Skill",
        iconSmallUrl: null,
        iconLargeUrl: null,
      },
    };
    const responsiveSkillSnapshot: SkillCatalogState = {
      type: "ready",
      candidates: [responsiveSkill],
      partialErrorCount: 0,
    };
    const responsiveSkillController: ActiveThreadOwnerHandle["skillCatalog"] = {
      getSnapshot: () => responsiveSkillSnapshot,
      subscribe: () => () => undefined,
      invalidate: () => false,
      retry: () => false,
    };
    const screen = await renderAttached(commandHandle, controller, responsiveSkillController);
    const composerShell = screen.getByRole("region", { name: "Message composer" }).element();
    const composer = screen.getByRole("combobox", { name: "Message Codex", exact: true });
    const longToken = "x".repeat(240);
    const longOrdinaryText = "Ordinary message after guidance ".repeat(12).trim();

    controller.submitSteer(composerDraftCapture(longToken));
    controller.submitSteer(composerDraftCapture("Additional guiding context ".repeat(12)));
    controller.submit(composerDraftCapture(longOrdinaryText));
    controller.submit(composerDraftCapture("Second ordinary message"));

    const pendingRegion = screen.getByRole("region", { name: "Pending messages", exact: true });
    const trigger = pendingRegion.getByRole("button", {
      name: "Pending: Guide 2, Queued 2",
      exact: true,
    });
    await expect.element(pendingRegion).toBeVisible();
    await expect.element(trigger).toBeVisible();
    const pendingRegionElement = pendingRegion.element();
    const triggerElement = trigger.element();
    await expect
      .element(pendingRegion.getByText(longToken, { exact: true }))
      .not.toBeInTheDocument();

    await trigger.click();
    const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog.getByRole("heading", { name: "Guiding", exact: true }))
      .toBeVisible();
    await expect
      .element(dialog.getByRole("heading", { name: "Queued", exact: true }))
      .toBeVisible();
    const expandLongToken = dialog.getByRole("button", { name: /Expand pending message:/ }).first();
    await expandLongToken.click();
    const longDetail = dialog.getByText(longToken, { exact: true });
    await expect.element(longDetail).toBeVisible();
    await expect
      .poll(() => longDetail.element().scrollWidth <= longDetail.element().clientWidth + 1)
      .toBe(true);

    const editButtons = dialog.getByRole("button", { name: "Edit", exact: true }).all();
    expect(editButtons.length).toBe(3);
    await editButtons[1]?.click();
    const pendingEditor = screen.getByRole("combobox", {
      name: "Edit pending message",
      exact: true,
    });
    await pendingEditor.fill("$res");
    const editDialog = screen.getByRole("dialog", { name: "Edit pending message", exact: true });
    const typeahead = editDialog.getByRole("listbox", { name: "Typeahead menu", exact: true });
    const save = screen.getByRole("button", { name: "Save", exact: true });
    const cancel = screen.getByRole("button", { name: "Cancel", exact: true });
    await expect.element(typeahead).toBeVisible();
    pendingEditor.element().scrollIntoView({ block: "nearest" });
    typeahead.element().scrollIntoView({ block: "nearest" });
    await expect.element(pendingEditor).toBeInViewport();
    await expect.element(typeahead).toBeInViewport();
    save.element().scrollIntoView({ block: "nearest" });
    await expect.element(save).toBeInViewport();
    await expect.element(cancel).toBeInViewport();
    await expect
      .poll(() => ({
        dialogHorizontallyClosed:
          editDialog.element().scrollWidth <= editDialog.element().clientWidth + 1,
        editorHorizontallyClosed:
          pendingEditor.element().scrollWidth <= pendingEditor.element().clientWidth + 1,
        menuHorizontallyClosed:
          typeahead.element().scrollWidth <= typeahead.element().clientWidth + 1,
      }))
      .toEqual({
        dialogHorizontallyClosed: true,
        editorHorizontallyClosed: true,
        menuHorizontallyClosed: true,
      });
    await pendingEditor.fill("Edited narrow ordinary");
    await save.click();

    const listDialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
    const secondOrdinary = listDialog.getByRole("group", {
      name: "Second ordinary message",
      exact: true,
    });
    await secondOrdinary.getByRole("button", { name: "Delete", exact: true }).click();
    const keep = secondOrdinary.getByRole("button", { name: "Keep", exact: true });
    const confirmDelete = secondOrdinary.getByRole("button", { name: "Delete", exact: true });
    keep.element().scrollIntoView({ block: "nearest" });
    await expect.element(keep).toBeInViewport();
    await expect.element(confirmDelete).toBeInViewport();
    await keep.click();

    await listDialog.getByRole("button", { name: "Edit", exact: true }).first().click();
    await expect
      .element(screen.getByRole("combobox", { name: "Edit pending message", exact: true }))
      .toBeVisible();
    controller.observeAcceptedEvent({ notification: eventTurnCompleted, replay: "live" });
    const alert = screen.getByRole("alert");
    await expect.element(alert).toBeVisible();
    alert.element().scrollIntoView({ block: "nearest" });
    await expect.element(alert).toBeInViewport();
    await expect
      .element(
        alert.getByText("The target turn closed before the edit was saved.", { exact: true }),
      )
      .toBeVisible();
    await expect
      .poll(() => ({
        alertHorizontallyClosed: alert.element().scrollWidth <= alert.element().clientWidth + 1,
        dialogHorizontallyClosed:
          listDialog.element().scrollWidth <= listDialog.element().clientWidth + 1,
      }))
      .toEqual({ alertHorizontallyClosed: true, dialogHorizontallyClosed: true });

    await expect
      .poll(() => {
        const documentScroller = document.scrollingElement;
        if (!(documentScroller instanceof HTMLElement)) {
          return null;
        }
        const dialogElement = listDialog.element();
        const dialogBounds = dialogElement.getBoundingClientRect();
        const triggerBounds = triggerElement.getBoundingClientRect();

        return {
          composerHorizontallyClosed: composerShell.scrollWidth <= composerShell.clientWidth + 1,
          dialogHorizontallyClosed: dialogElement.scrollWidth <= dialogElement.clientWidth + 1,
          dialogWithinViewport:
            dialogBounds.left >= -1 && dialogBounds.right <= window.innerWidth + 1,
          documentHorizontallyClosed:
            documentScroller.scrollWidth <= documentScroller.clientWidth + 1,
          pendingHorizontallyClosed:
            pendingRegionElement.scrollWidth <= pendingRegionElement.clientWidth + 1,
          triggerHorizontallyClosed: triggerElement.scrollWidth <= triggerElement.clientWidth + 1,
          triggerWithinViewport:
            triggerBounds.left >= -1 && triggerBounds.right <= window.innerWidth + 1,
        };
      })
      .toEqual({
        composerHorizontallyClosed: true,
        dialogHorizontallyClosed: true,
        dialogWithinViewport: true,
        documentHorizontallyClosed: true,
        pendingHorizontallyClosed: true,
        triggerHorizontallyClosed: true,
        triggerWithinViewport: true,
      });

    const close = listDialog.getByRole("button", { name: "Close", exact: true });
    await expect.element(close).toBeInViewport();
    await close.click();
    await expect.element(listDialog).not.toBeInTheDocument();
    await composer.click();
    await expect.element(composer).toHaveFocus();
  } finally {
    pendingSteer.resolve({ turnId: activeTurnId });
    await page.viewport(originalViewport.width, originalViewport.height);
  }
});
