import { afterEach, beforeEach, expect, test, vi, type Mock } from "vitest";
import { userEvent } from "vitest/browser";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  attachBaseline,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { turnCompleted } from "@/features/projection/__tests__/projectionTestBuilders";
import { renderComposerTurnControl } from "./composerTurnControlBrowserTestSupport";

const attachResponse = attachBaseline;

const threadId = attachResponse.snapshot.thread.id;

beforeEach(async () => {
  await userEvent.unhover(document.body);
});

const expectStartTurnCalledOnceWithText = (
  startTurn: Mock<GuiHostCommands["startTurn"]>,
  text: string,
): void => {
  expect(startTurn).toHaveBeenCalledOnce();
  const call = startTurn.mock.calls.at(0);
  if (call == null) {
    throw new Error("startTurn must have one recorded call");
  }
  const [params] = call;
  const clientUserMessageId = params.clientUserMessageId;
  expect(typeof clientUserMessageId).toBe("string");
  expect(startTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    clientUserMessageId,
    input: [{ type: "text", text, text_elements: [] }],
  });
};

const composerTextWithoutTrailingBrowserPlaceholders = (
  element: Readonly<Pick<Node, "textContent">>,
): string => (element.textContent ?? "").replace(/[ \n\r\u00a0\u200b]+$/u, "");

afterEach(() => {
  vi.restoreAllMocks();
});

async function beginPendingStop(draft: string) {
  const pending = deferred<Awaited<ReturnType<GuiHostCommands["interruptTurn"]>>>();
  const interruptTurn = vi
    .fn<GuiHostCommands["interruptTurn"]>()
    .mockReturnValueOnce(pending.promise);
  const commandHandle: GuiHostCommands = { ...createGuiHostCommands(), interruptTurn };
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "created", commands: commandHandle },
  });
  const { controller } = view;
  const screen = view;
  const composer = view.composer();
  const stopButton = screen.getByRole("button", { name: "Stop" });

  await composer.fill(draft);
  await userEvent.click(stopButton);

  return { composer, controller, interruptTurn, pending, screen, stopButton };
}

test("submits a non-empty draft through the queue controller and clears it when accepted", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
  });

  const composer = screen.composer();
  await composer.fill("Hello Codex");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  expectStartTurnCalledOnceWithText(startTurn, "Hello Codex");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
});

test("active turn allows queuing and enables Stop", async () => {
  const commandHandle = createGuiHostCommands();
  const view = await renderComposerTurnControl({
    scenario: { type: "activeFixture" },
    queue: { type: "created", commands: commandHandle },
  });
  const { controller, turn } = view;
  const screen = view;
  const composer = view.composer();

  await composer.fill("Next draft");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await expect
    .element(screen.getByRole("button", { name: "Pending: Queued 1", exact: true }))
    .toBeVisible();
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  const stopButton = screen.getByRole("button", { name: "Stop" });
  await expect.element(stopButton).toBeEnabled();
  await stopButton.click();

  expect(commandHandle.interruptTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    turnId: turn.id,
  });
  await expect.poll(() => controller.getSnapshot().interrupt?.phase).toBe("accepted");

  controller.observeAcceptedEvent({
    notification: turnCompleted(eventTurnCompleted, "commit-local-stop", {
      ...turn,
      status: "interrupted",
    }),
    replay: "live",
  });

  await expect.element(screen.getByText("1 message has not been sent")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Continue sending" })).toBeVisible();
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("definite send failure exposes recovery without restoring the submitted draft", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  startTurn.mockRejectedValueOnce(
    new GuiHostCommandError({
      error: new Error("network failed"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
  });
  const composer = screen.composer();

  await composer.fill("Keep this draft");
  await screen.getByRole("button", { name: "Send", exact: true }).click();

  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
  await expect.element(screen.getByText("1 message has not been sent")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Continue sending" })).toBeVisible();
});

test("renders Simplified Chinese composer and recovery copy", async () => {
  const commandHandle = createGuiHostCommands();
  const startTurn = vi.mocked(commandHandle.startTurn);
  startTurn.mockRejectedValueOnce(
    new GuiHostCommandError({
      error: new Error("network failed"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );
  const screen = await renderComposerTurnControl({
    queue: { type: "created", commands: commandHandle },
    locale: "zh-CN",
  });
  const composer = screen.composer("向 Codex 发送消息");

  await expect.element(screen.getByRole("region", { name: "消息输入区" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "停止" })).toBeDisabled();
  await composer.fill("保留这份草稿");
  await screen.getByRole("button", { name: "发送" }).click();

  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("");
  await expect.element(screen.getByText("1 条消息尚未发送")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "继续发送" })).toBeVisible();
});

test("accepted stop remains pending until its matching terminal", async () => {
  const { composer, controller, interruptTurn, pending, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  expect(interruptTurn).toHaveBeenCalledExactlyOnceWith({
    threadId,
    turnId: eventTurnStarted.event.notification.turn.id,
  });

  pending.resolve({});
  await expect.poll(() => controller.getSnapshot().interrupt?.phase).toBe("accepted");
  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");

  controller.observeAcceptedEvent({
    notification: turnCompleted(eventTurnCompleted, "commit-pending-stop", {
      ...eventTurnStarted.event.notification.turn,
      status: "interrupted",
    }),
    replay: "live",
  });

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).not.toHaveAttribute("data-pending");
});

test("unknown stop delivery keeps its pending owner and prevents retry", async () => {
  const { composer, interruptTurn, pending, screen, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  pending.reject(new Error("interrupt failed"));

  await expect.element(stopButton).toBeDisabled();
  await expect.element(stopButton).toHaveAttribute("data-pending", "true");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
  await expect.element(screen.getByText("Stop failed")).not.toBeInTheDocument();
  await expect.element(screen.getByText("interrupt failed")).not.toBeInTheDocument();
  expect(interruptTurn).toHaveBeenCalledTimes(1);
});

test("definite stop failure keeps the draft, reports failure, and allows retry", async () => {
  const { composer, interruptTurn, pending, screen, stopButton } =
    await beginPendingStop("Draft while stopping");

  pending.reject(
    new GuiHostCommandError({
      error: new Error("interrupt rejected"),
      delivery: "definitelyNotAccepted",
      source: "rpc",
    }),
  );

  await expect
    .element(screen.getByRole("status").filter({ hasText: "Stop failed" }))
    .toHaveTextContent("Stop failed");
  await expect.element(stopButton).toBeEnabled();
  await expect.element(stopButton).not.toHaveAttribute("data-pending");
  await expect
    .poll(() => composerTextWithoutTrailingBrowserPlaceholders(composer.element()))
    .toBe("Draft while stopping");
  await expect.element(screen.getByText("interrupt rejected")).not.toBeInTheDocument();
  expect(interruptTurn).toHaveBeenCalledTimes(1);
});
