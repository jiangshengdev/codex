import { expect, vi, type Mock } from "vitest";
import {
  attachResponse,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  queueAttachProjectionResponse,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import type {
  ComposerPendingInputCursor,
  ComposerPendingInputLane,
  ComposerPendingInputPageItem,
} from "@/features/composerInputQueue/composerInputQueueContracts";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachWithTurns,
  inProgressTurn,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { renderWithProviders } from "@/utils/test-utils";

type ActiveAppCommandOverrides = Partial<{
  interruptTurn: Mock<GuiHostCommands["interruptTurn"]>;
  startTurn: Mock<GuiHostCommands["startTurn"]>;
  steerTurn: Mock<GuiHostCommands["steerTurn"]>;
}>;

const getAppComposer = (screen: Awaited<ReturnType<typeof renderWithProviders>>) =>
  screen.getByRole("combobox", { name: "Message Codex", exact: true });

export const renderActiveComposerQueueApp = async (
  startGuiHostConnectionMock: StartGuiHostConnectionMock,
  commandOverrides: ActiveAppCommandOverrides = {},
) => {
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
  const composer = getAppComposer(screen);
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await expect.poll(() => vi.mocked(createComposerInputQueueCoordinator).mock.calls.length).toBe(1);
  const coordinatorResult = vi.mocked(createComposerInputQueueCoordinator).mock.results.at(0);
  if (coordinatorResult?.type !== "return") {
    throw new Error("active App must create a queue coordinator");
  }

  return {
    activeTurn,
    commandHandle,
    composer,
    interruptTurn,
    options,
    queueCoordinator: coordinatorResult.value,
    screen,
    startTurn,
    steerTurn,
  };
};

export const readAllPendingItems = (
  coordinator: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
): readonly ComposerPendingInputPageItem[] => {
  const revision = coordinator.getSnapshot().detailRevision;
  const items: ComposerPendingInputPageItem[] = [];
  let cursor: ComposerPendingInputCursor | null = null;

  for (;;) {
    const result = coordinator.readPendingInputPage({
      lane,
      revision,
      cursor,
      limit: 20,
    });
    if (result.type !== "page") {
      throw new Error(`expected ${lane} pending-input page, received ${result.type}`);
    }
    if (result.revision !== revision) {
      throw new Error(
        `expected ${lane} pending-input revision ${String(revision)}, received ${String(result.revision)}`,
      );
    }
    const currentRevision = coordinator.getSnapshot().detailRevision;
    if (currentRevision !== revision) {
      throw new Error(
        `expected ${lane} pending-input revision ${String(revision)} to remain current, received ${String(currentRevision)}`,
      );
    }
    items.push(...result.items);
    if (result.nextCursor == null) {
      return items;
    }
    cursor = result.nextCursor;
  }
};

export const readPendingTextPreviews = (
  coordinator: ComposerInputQueueCoordinator,
  lane: ComposerPendingInputLane,
): string[] =>
  readAllPendingItems(coordinator, lane).map(({ preview }) =>
    preview.type === "text" ? preview.text : "nonText",
  );

export const startTurnParamsAt = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  index: number,
): Parameters<GuiHostCommands["startTurn"]>[0] => {
  const call = startTurn.mock.calls.at(index);
  if (call == null) {
    throw new Error(`startTurn call ${String(index + 1)} must be recorded`);
  }
  return call[0];
};

export const steerTurnParamsAt = (
  steerTurn: Mock<GuiHostCommands["steerTurn"]>,
  index: number,
): Parameters<GuiHostCommands["steerTurn"]>[0] => {
  const call = steerTurn.mock.calls.at(index);
  if (call == null) {
    throw new Error(`steerTurn call ${String(index + 1)} must be recorded`);
  }
  return call[0];
};

export const readGuiHostCommandCallCounts = (
  commands: GuiHostCommands,
): Record<keyof GuiHostCommands, number> => ({
  compactThread: vi.mocked(commands.compactThread).mock.calls.length,
  attachThreadProjection: vi.mocked(commands.attachThreadProjection).mock.calls.length,
  listSkills: vi.mocked(commands.listSkills).mock.calls.length,
  listThreads: vi.mocked(commands.listThreads).mock.calls.length,
  readThread: vi.mocked(commands.readThread).mock.calls.length,
  resumeThread: vi.mocked(commands.resumeThread).mock.calls.length,
  detachThreadProjection: vi.mocked(commands.detachThreadProjection).mock.calls.length,
  startTurn: vi.mocked(commands.startTurn).mock.calls.length,
  steerTurn: vi.mocked(commands.steerTurn).mock.calls.length,
  interruptTurn: vi.mocked(commands.interruptTurn).mock.calls.length,
});

export const dispatchGuideShortcut = (element: Element): void => {
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
