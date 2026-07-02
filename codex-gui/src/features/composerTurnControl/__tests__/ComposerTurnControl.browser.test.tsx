import { Toast } from "@heroui/react";
import { expect, test, vi } from "vitest";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import type { GuiHostCommands, GuiHostStatus } from "@/features/guiHost/guiHostClient";
import {
  attachBaseline,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import { inProgressTurn } from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { ComposerTurnControl } from "../ComposerTurnControl";

const attachedStatus: GuiHostStatus = { label: "attached" };
const attachResponse = attachBaseline;
const threadId = attachResponse.snapshot.thread.id;

function deferred<T>() {
  const callbacks = {} as {
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
  };
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    callbacks.resolve = promiseResolve;
    callbacks.reject = promiseReject;
  });

  return {
    promise,
    resolve: callbacks.resolve,
    reject: callbacks.reject,
  };
}

async function renderAttached(commandHandle: GuiHostCommands | null = createGuiHostCommands()) {
  const result = await renderWithProviders(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        commands={commandHandle}
        guiHostStatus={attachedStatus}
        launchParams={null}
      />
    </>,
  );
  result.store.dispatch(launchThreadIdRecorded(threadId));
  result.store.dispatch(attachedThreadIdObserved(threadId));
  result.store.dispatch(threadRuntimeAttached(attachResponse));
  return result;
}

const expectComposerDisabled = async (
  screen: Awaited<ReturnType<typeof renderWithProviders>>,
): Promise<void> => {
  await expect.element(screen.getByPlaceholder("Message Codex")).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
};

async function beginPendingSend(draft: string) {
  const pending = deferred<Awaited<ReturnType<GuiHostCommands["startTurn"]>>>();
  const commandHandle = createGuiHostCommands();
  vi.mocked(commandHandle.startTurn).mockReturnValueOnce(pending.promise);
  const screen = await renderAttached(commandHandle);
  const composer = screen.getByPlaceholder("Message Codex");

  await composer.fill(draft);
  await screen.getByRole("button", { name: "Send" }).click();

  return { commandHandle, composer, pending, screen };
}

test("disables controls before attach", async () => {
  expect.hasAssertions();

  const screen = await renderWithProviders(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        commands={createGuiHostCommands()}
        guiHostStatus={{ label: "connecting" }}
        launchParams={null}
      />
    </>,
  );

  await expectComposerDisabled(screen);
});

test("renders a white composer panel with a primary textarea and actions", async () => {
  const screen = await renderAttached();
  const composerShell = screen.container.querySelector('[aria-label="Message composer"]');
  if (!(composerShell instanceof HTMLElement)) {
    throw new Error("composer shell must render");
  }
  const composerPanel = composerShell.firstElementChild;
  if (!(composerPanel instanceof HTMLElement)) {
    throw new Error("composer panel must render");
  }
  const textarea = composerPanel.querySelector('textarea[placeholder="Message Codex"]');
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("composer textarea must render");
  }
  const actions = Array.from(composerPanel.querySelectorAll("button"))
    .map((button) => button.textContent.trim())
    .filter((label) => label.length > 0);

  expect(composerPanel.classList.contains("p-2")).toBe(true);
  expect(composerPanel.classList.contains("p-3")).toBe(false);
  expect(composerShell.classList.contains("px-4")).toBe(false);
  expect(composerShell.classList.contains("pb-0")).toBe(true);
  expect(composerShell.classList.contains("py-3")).toBe(false);
  expect(textarea.classList.contains("textarea--primary")).toBe(true);
  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  await expect.element(qrButton).toBeDisabled();
  await expect.element(qrButton).toHaveClass("button--icon-only");
  expect(actions).toEqual(["Stop", "Send"]);
});

test("sends non-empty draft and clears it after success", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);

  await screen.getByPlaceholder("Message Codex").fill("Hello Codex");
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  await screen.getByRole("button", { name: "Send" }).click();

  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "Hello Codex", text_elements: [] }],
  });
  await expect.element(screen.getByPlaceholder("Message Codex")).toHaveValue("");
});

test("keeps whitespace-only draft from submitting", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = screen.getByPlaceholder("Message Codex");

  await composer.fill("   ");
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await composer.click();
  await screen.user.keyboard("{Enter}");

  expect(commandHandle.startTurn).not.toHaveBeenCalled();
});

test("uses Enter to send and Shift Enter to insert newline", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = screen.getByPlaceholder("Message Codex");

  await composer.fill("Line 1");
  await composer.click();
  await screen.user.keyboard("{Shift>}{Enter}{/Shift}");
  await expect.element(composer).toHaveValue("Line 1\n");

  await composer.fill("Line 1");
  await composer.click();
  await screen.user.keyboard("{Enter}");

  expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);
});

test("keeps composing Enter from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = screen.getByPlaceholder("Message Codex");

  await composer.fill("正在输入");
  await composer.click();
  composer.element().dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    }),
  );

  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  await expect.element(composer).toHaveValue("正在输入");
});

test("active turn disables Send and enables Stop", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const event = eventTurnStarted;
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));

  await screen.getByPlaceholder("Message Codex").fill("Next draft");
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  const stopButton = screen.getByRole("button", { name: "Stop" });
  await expect.element(stopButton).toBeEnabled();
  await expect.element(stopButton).toHaveClass("button--danger-soft");
  await stopButton.click();

  if (event.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  expect(commandHandle.interruptTurn).toHaveBeenCalledWith({
    threadId,
    turnId: event.event.notification.turn.id,
  });
});

test("manual reconnect disables composer operations", async () => {
  expect.hasAssertions();

  const screen = await renderAttached(createGuiHostCommands());
  screen.store.dispatch(
    threadRuntimeManualReconnectRequired({
      reason: "backpressure",
      threadId,
      subscriptionId: attachResponse.subscriptionId,
    }),
  );

  await expectComposerDisabled(screen);
});

test("send failure keeps draft and shows a toast", async () => {
  const commandHandle = createGuiHostCommands();
  vi.mocked(commandHandle.startTurn).mockRejectedValueOnce(new Error("network failed"));
  const screen = await renderAttached(commandHandle);
  const composer = screen.getByPlaceholder("Message Codex");

  await composer.fill("Keep this draft");
  await screen.getByRole("button", { name: "Send" }).click();

  await expect.element(composer).toHaveValue("Keep this draft");
  await expect.element(screen.getByText("Message failed to send")).toBeVisible();
  await expect.element(screen.getByText("network failed")).toBeVisible();
});

test("pending send disables duplicate submission", async () => {
  const { commandHandle, composer, pending, screen } = await beginPendingSend("Send once");
  await expect.element(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  await composer.click();
  await screen.user.keyboard("{Enter}");

  expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);

  pending.resolve({
    turn: inProgressTurn("turn-finished"),
  });
  await expect.element(composer).toHaveValue("");
});

test("pending send keeps newer draft after the submitted draft succeeds", async () => {
  const { composer, pending, screen } = await beginPendingSend("Submitted draft");
  await composer.fill("New draft");

  pending.resolve({
    turn: inProgressTurn("turn-finished"),
  });

  await expect.element(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  await expect.element(composer).toHaveValue("New draft");
});

test("stop failure keeps draft and shows a toast", async () => {
  const commandHandle = createGuiHostCommands();
  vi.mocked(commandHandle.interruptTurn).mockRejectedValueOnce(new Error("interrupt failed"));
  const screen = await renderAttached(commandHandle);
  const event = eventTurnStarted;
  screen.store.dispatch(threadRuntimeEventBuffered({ notification: event, replay: "live" }));
  const composer = screen.getByPlaceholder("Message Codex");

  await composer.fill("Draft while stopping");
  await screen.getByRole("button", { name: "Stop" }).click();

  await expect.element(composer).toHaveValue("Draft while stopping");
  await expect.element(screen.getByText("Stop failed")).toBeVisible();
  await expect.element(screen.getByText("interrupt failed")).toBeVisible();
});
