import { beforeEach, expect, test, vi } from "vitest";
import {
  createGuiHostCommands,
  emitProjectionEvent,
  getHostOptions,
  initializeHost,
  launchThreadId,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import {
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  contextCompaction,
  contextCompactionCompleted,
  itemStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { renderWithProviders } from "@/utils/test-utils";

const guiHostClientMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));

vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: guiHostClientMock.startGuiHostConnection,
}));

const startGuiHostConnectionMock =
  guiHostClientMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

beforeEach(() => {
  resetAppBrowserTestSupport(startGuiHostConnectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
});

test("App routes compression through the session and reuses transcript context pagination", async () => {
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(startGuiHostConnectionMock);
  queueAttachProjectionResponse(commands);
  initializeHost(options, commands);

  const trigger = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  const dialog = screen.getByRole("dialog", { name: "Context usage", exact: true });
  const action = dialog.getByRole("button", { name: "Compress context", exact: true });
  await expect.element(action).toBeEnabled();
  await action.click();

  expect(commands.compactThread).toHaveBeenCalledExactlyOnceWith({ threadId: launchThreadId });
  const pendingTrigger = screen.getByRole("button", {
    name: "Context compression in progress",
    exact: true,
  });
  expect(pendingTrigger.element().textContent).toBe("");
  await expect
    .element(dialog.getByRole("button", { name: "Compressing", exact: true }))
    .toBeDisabled();

  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("expected a turnStarted fixture");
  }
  const turnId = eventTurnStarted.event.notification.turn.id;
  const itemId = "app-session-compaction";
  emitProjectionEvent(options, eventTurnStarted);
  emitProjectionEvent(
    options,
    itemStarted(eventItemStarted, eventItemStarted.commitId, turnId, contextCompaction(itemId)),
  );

  expect(pendingTrigger.element().textContent).toBe("");

  emitProjectionEvent(
    options,
    contextCompactionCompleted(eventItemCompleted, eventItemCompleted.commitId, turnId, itemId),
  );

  const idleTrigger = screen.getByRole("button", {
    name: "Context usage details, 0% used, 120 of 258k tokens",
    exact: true,
  });
  await expect.element(idleTrigger).toBeEnabled();
  await expect.element(screen.getByText("Context compressed", { exact: true })).toBeVisible();
  const pagination = screen.getByRole("navigation", { name: "Transcript context pages" });
  await expect
    .element(pagination.getByRole("button", { name: "Context page 2", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(dialog.getByRole("button", { name: "Compress context", exact: true }))
    .toBeDisabled();

  await screen.unmount();
});
