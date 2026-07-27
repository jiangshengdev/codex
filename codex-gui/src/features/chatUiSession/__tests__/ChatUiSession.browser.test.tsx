import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  attachProjection,
  attachResponse,
  createGuiHostCommands,
  emitProjectionEvent,
  getHostOptions,
  markCommandsReady,
  markHostAttached,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "@/__tests__/appBrowserTestSupport";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { useChatUiSession } from "@/features/chatUiSession/ChatUiSessionContext";
import { ChatUiSessionProvider } from "@/features/chatUiSession/ChatUiSessionProvider";
import { useCommittedTranscriptStickyBottom } from "@/features/appShell/useCommittedTranscriptStickyBottom";
import { eventItemCompleted } from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  itemCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { createAppRouter } from "@/router";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

const renderReadyChat = async () => {
  const history = createMemoryHistory({ initialEntries: ["/"] });
  const router = createAppRouter({ history });
  const screen = await renderWithProviders(<RouterProvider router={router} />);
  const options = getHostOptions(startGuiHostConnectionMock);

  markHostAttached(options);
  markCommandsReady(options, createGuiHostCommands());

  return { options, router, screen };
};

const emitCommittedMessage = (
  options: StartGuiHostConnectionOptions,
  {
    commitId,
    itemId,
    parentCommitId,
    text,
    turnId,
  }: {
    commitId: string;
    itemId: string;
    parentCommitId: string | null;
    text: string;
    turnId: string;
  },
): void => {
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        commitId,
        turnId,
        agentMessage(itemId, text),
      ),
      { parentCommitId },
    ),
  );
};

function ChatUiSessionProbe() {
  const {
    captureScrollSnapshot,
    completeScrollRestore,
    consumeScrollRestore,
    draft,
    setDraft,
  } = useChatUiSession();
  const [restoreDescription, setRestoreDescription] = useState("No restore");

  return (
    <section aria-label="Chat UI session probe">
      <label>
        Session draft
        <input
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          value={draft}
        />
      </label>
      <button
        onClick={() => {
          captureScrollSnapshot({ isStickyBottom: true, scrollTop: 900 });
        }}
        type="button"
      >
        Capture sticky bottom
      </button>
      <button
        onClick={() => {
          captureScrollSnapshot({ isStickyBottom: false, scrollTop: 475 });
        }}
        type="button"
      >
        Capture scroll position
      </button>
      <button
        onClick={() => {
          const restore = consumeScrollRestore();
          setRestoreDescription(
            restore == null
              ? "No restore"
              : restore.type === "stickyBottom"
                ? "Restore sticky bottom"
                : `Restore scroll top ${String(restore.scrollTop)}`,
          );
        }}
        type="button"
      >
        Consume restore
      </button>
      <button
        onClick={() => {
          completeScrollRestore();
        }}
        type="button"
      >
        Complete restore
      </button>
      <output aria-live="polite">{restoreDescription}</output>
    </section>
  );
}

function StickyBottomSurface({
  contentHeight,
  onUnmount,
}: {
  contentHeight: number;
  onUnmount: () => void;
}) {
  const { captureScrollSnapshot, transcriptBottomRef } =
    useCommittedTranscriptStickyBottom();

  return (
    <>
      <button
        onClick={() => {
          captureScrollSnapshot();
          onUnmount();
        }}
        style={{ position: "fixed", right: 0, top: 0, zIndex: 1 }}
        type="button"
      >
        Capture and unmount
      </button>
      <section
        aria-label="Test transcript surface"
        style={{ minHeight: `${String(contentHeight)}px` }}
      >
        <p>Transcript content</p>
        <div aria-hidden="true" ref={transcriptBottomRef} />
      </section>
    </>
  );
}

function ScrollRestoreHarness() {
  const [chatMounted, setChatMounted] = useState(true);
  const [contentHeight, setContentHeight] = useState(2_400);

  return (
    <>
      <nav
        aria-label="Scroll restore controls"
        style={{ left: 0, position: "fixed", top: 0, zIndex: 1 }}
      >
        <button
          onClick={() => {
            setContentHeight((currentHeight) => currentHeight + 1_200);
          }}
          type="button"
        >
          Add transcript content
        </button>
        <button
          onClick={() => {
            setChatMounted(true);
          }}
          type="button"
        >
          Remount chat
        </button>
      </nav>
      {chatMounted ? (
        <StickyBottomSurface
          contentHeight={contentHeight}
          onUnmount={() => {
            setChatMounted(false);
          }}
        />
      ) : (
        <main aria-label="Test settings surface" />
      )}
    </>
  );
}

const documentScroller = (): HTMLElement => {
  const scroller = document.scrollingElement;
  if (!(scroller instanceof HTMLElement)) {
    throw new Error("document.scrollingElement must be available");
  }

  return scroller;
};

const waitForBrowserFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

const distanceFromDocumentBottom = (): number => {
  const scroller = documentScroller();
  return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
};

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
});

afterEach(() => {
  window.scrollTo({ top: 0 });
});

test("keeps the chat session and projection current while the chat route DOM is unmounted", async () => {
  const { options, router, screen } = await renderReadyChat();
  attachProjection(
    options,
    attachWithTurns(attachResponse, [
      baseTurn("turn-chat-session", [
        agentMessage("agent-chat-session-existing", "Message before opening settings"),
      ]),
    ]),
  );
  const composer = screen.getByPlaceholder("Message Codex");

  await expect.element(screen.getByText("Message before opening settings")).toBeVisible();
  await composer.fill("Draft kept while changing settings");
  await router.navigate({ to: "/settings" });

  expect(router.state.location.pathname).toBe("/settings");
  await expect.element(screen.getByPlaceholder("Message Codex")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("region", { name: "Committed transcript" }))
    .not.toBeInTheDocument();

  emitCommittedMessage(options, {
    commitId: "commit-chat-session-settings",
    itemId: "agent-chat-session-settings",
    parentCommitId: null,
    text: "Message received while settings were open",
    turnId: "turn-chat-session",
  });
  await router.navigate({ to: "/" });

  await expect
    .element(screen.getByPlaceholder("Message Codex"))
    .toHaveValue("Draft kept while changing settings");
  await expect
    .element(screen.getByText("Message received while settings were open"))
    .toBeVisible();
});

test("exposes a sticky-bottom restore exactly once through the session hook", async () => {
  const screen = await renderWithProviders(
    <ChatUiSessionProvider>
      <ChatUiSessionProbe />
    </ChatUiSessionProvider>,
  );

  await screen.getByRole("button", { name: "Capture sticky bottom" }).click();
  await screen.getByRole("button", { name: "Consume restore" }).click();
  await expect.element(screen.getByText("Restore sticky bottom")).toBeVisible();

  await screen.getByRole("button", { name: "Consume restore" }).click();
  await expect.element(screen.getByText("No restore")).toBeVisible();
});

test("exposes a captured non-sticky scroll top exactly once through the session hook", async () => {
  const screen = await renderWithProviders(
    <ChatUiSessionProvider>
      <ChatUiSessionProbe />
    </ChatUiSessionProvider>,
  );

  await screen.getByRole("textbox", { name: "Session draft" }).fill("Persistent draft");
  await screen.getByRole("button", { name: "Capture scroll position" }).click();
  await screen.getByRole("button", { name: "Consume restore" }).click();
  await expect.element(screen.getByText("Restore scroll top 475")).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Session draft" }))
    .toHaveValue("Persistent draft");

  await screen.getByRole("button", { name: "Complete restore" }).click();
  await screen.getByRole("button", { name: "Consume restore" }).click();
  await expect.element(screen.getByText("No restore")).toBeVisible();
});

test("the real sticky-bottom hook restores a remounted chat to the latest bottom", async () => {
  const screen = await renderWithProviders(
    <ChatUiSessionProvider>
      <ScrollRestoreHarness />
    </ChatUiSessionProvider>,
  );
  const scroller = documentScroller();
  await expect
    .element(screen.getByRole("region", { name: "Test transcript surface" }))
    .toBeVisible();

  window.scrollTo({ top: scroller.scrollHeight });
  await waitForBrowserFrame();
  await screen.getByRole("button", { name: "Capture and unmount" }).click();
  await expect
    .element(screen.getByRole("region", { name: "Test transcript surface" }))
    .not.toBeInTheDocument();

  await screen.getByRole("button", { name: "Add transcript content" }).click();
  await screen.getByRole("button", { name: "Remount chat" }).click();

  await expect
    .element(screen.getByRole("region", { name: "Test transcript surface" }))
    .toBeVisible();
  await vi.waitFor(() => {
    expect(distanceFromDocumentBottom()).toBeLessThanOrEqual(4);
  });
});

test("the real sticky-bottom hook restores a saved position once without later jumping", async () => {
  const screen = await renderWithProviders(
    <ChatUiSessionProvider>
      <ScrollRestoreHarness />
    </ChatUiSessionProvider>,
  );
  screen.store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachResponse, [baseTurn("turn-scroll-restore-signal", [])]),
    ),
  );
  await waitForBrowserFrame();
  await waitForBrowserFrame();
  const scroller = documentScroller();
  const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
  expect(maxScrollTop).toBeGreaterThan(80);
  window.scrollTo({ top: Math.floor(maxScrollTop / 2) });
  await waitForBrowserFrame();
  const savedScrollTop = scroller.scrollTop;
  expect(savedScrollTop).toBeGreaterThan(0);
  expect(distanceFromDocumentBottom()).toBeGreaterThan(40);

  await screen.getByRole("button", { name: "Capture and unmount" }).click();
  await screen.getByRole("button", { name: "Add transcript content" }).click();
  await screen.getByRole("button", { name: "Remount chat" }).click();

  await vi.waitFor(() => {
    expect(Math.abs(scroller.scrollTop - savedScrollTop)).toBeLessThanOrEqual(4);
    expect(distanceFromDocumentBottom()).toBeGreaterThan(40);
  });

  const scrollTopAfterRestore = savedScrollTop + 160;
  window.scrollTo({ top: scrollTopAfterRestore });
  await waitForBrowserFrame();
  screen.store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-scroll-restore-signal",
        "turn-scroll-restore-signal",
        agentMessage("agent-scroll-restore-signal", "Live signal after restore"),
      ),
      replay: "live",
    }),
  );
  await waitForBrowserFrame();

  expect(Math.abs(scroller.scrollTop - scrollTopAfterRestore)).toBeLessThanOrEqual(4);
  expect(distanceFromDocumentBottom()).toBeGreaterThan(40);
});
