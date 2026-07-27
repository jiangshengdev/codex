import { Toast } from "@heroui/react";
import { afterEach, expect, test, vi } from "vitest";
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

async function renderAttached(
  commandHandle: GuiHostCommands | null = createGuiHostCommands(),
  guardCompositionEndEnter = false,
) {
  const result = await renderWithProviders(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        commands={commandHandle}
        guardCompositionEndEnter={guardCompositionEndEnter}
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

async function beginPendingStop(draft: string) {
  const pending = deferred<Awaited<ReturnType<GuiHostCommands["interruptTurn"]>>>();
  const commandHandle = createGuiHostCommands();
  vi.mocked(commandHandle.interruptTurn).mockReturnValueOnce(pending.promise);
  const screen = await renderAttached(commandHandle);
  screen.store.dispatch(
    threadRuntimeEventBuffered({ notification: eventTurnStarted, replay: "live" }),
  );
  const composer = screen.getByPlaceholder("Message Codex");
  const stopButton = screen.getByRole("button", { name: "Stop" });

  await composer.fill(draft);
  await stopButton.click();

  return { commandHandle, composer, pending, screen, stopButton };
}

test("disables controls before attach", async () => {
  expect.hasAssertions();

  const screen = await renderWithProviders(
    <>
      <Toast.Provider placement="top" />
      <ComposerTurnControl
        commands={createGuiHostCommands()}
        guardCompositionEndEnter={false}
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
  expect(composerPanel.classList.contains("pb-5")).toBe(false);
  expect(composerPanel.classList.contains("p-3")).toBe(false);
  expect(composerPanel.classList.contains("composer-panel")).toBe(true);
  expect(composerPanel.classList.contains("rounded-[20px]")).toBe(true);
  expect(composerPanel.classList.contains("shadow-md")).toBe(true);
  expect(composerPanel.classList.contains("shadow-lg")).toBe(false);
  expect(composerShell.classList.contains("composer-shell")).toBe(true);
  expect(composerShell.classList.contains("sticky")).toBe(true);
  expect(composerShell.classList.contains("bottom-0")).toBe(true);
  expect(composerShell.classList.contains("fixed")).toBe(false);
  expect(composerShell.classList.contains("inset-x-0")).toBe(false);
  expect(composerShell.classList.contains("px-4")).toBe(false);
  expect(composerShell.classList.contains("pb-0")).toBe(false);
  expect(composerShell.classList.contains("pb-3")).toBe(true);
  expect(composerShell.classList.contains("py-3")).toBe(false);
  expect(textarea.classList.contains("textarea--primary")).toBe(true);
  const qrButton = screen.getByRole("button", { name: "Scan with phone" });
  await expect.element(qrButton).toBeDisabled();
  await expect.element(qrButton).toHaveClass("button--icon-only");
  expect(actions).toEqual(["Stop", "Send"]);
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
  const eventAllowed = composer.element().dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    }),
  );

  expect(eventAllowed).toBe(true);
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  await expect.element(composer).toHaveValue("正在输入");
});

test("sends completed composition Enter immediately when guard is disabled", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle);
  const composer = screen.getByPlaceholder("Message Codex");
  const textarea = composer.element();
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("composer textarea must render");
  }

  await composer.click();
  textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  textarea.value = "你好呀";
  textarea.dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      data: "你好呀",
    }),
  );
  await expect.element(composer).toHaveValue("你好呀");

  await screen.user.keyboard("{Enter}");
  expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);
  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "你好呀", text_elements: [] }],
  });
});

test("keeps guarded completed composition Enter from sending draft", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle, true);
  const composer = screen.getByPlaceholder("Message Codex");
  const textarea = composer.element();
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("composer textarea must render");
  }

  await composer.click();
  textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  textarea.value = "你好呀";
  textarea.dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      data: "你好呀",
    }),
  );
  await expect.element(composer).toHaveValue("你好呀");

  await screen.user.keyboard("{Enter}");
  expect(commandHandle.startTurn).not.toHaveBeenCalled();
  await expect.element(composer).toHaveValue("你好呀");

  await screen.user.keyboard("{Enter}");
  expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);
  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "你好呀", text_elements: [] }],
  });
});

test("clears completed composition suppression on the next non Enter keydown", async () => {
  const commandHandle = createGuiHostCommands();
  const screen = await renderAttached(commandHandle, true);
  const composer = screen.getByPlaceholder("Message Codex");
  const textarea = composer.element();
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("composer textarea must render");
  }

  await composer.click();
  textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  textarea.value = "你好呀";
  textarea.dispatchEvent(
    new CompositionEvent("compositionend", {
      bubbles: true,
      data: "你好呀",
    }),
  );
  await expect.element(composer).toHaveValue("你好呀");

  const spaceAllowed = textarea.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: " ",
    }),
  );
  expect(spaceAllowed).toBe(true);

  await screen.user.keyboard("{Enter}");

  expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);
  expect(commandHandle.startTurn).toHaveBeenCalledWith({
    threadId,
    clientUserMessageId: null,
    input: [{ type: "text", text: "你好呀", text_elements: [] }],
  });
});

test.each([" ", "Enter"])(
  "keeps completed composition suppression through keyup %s",
  async (key) => {
    const commandHandle = createGuiHostCommands();
    const screen = await renderAttached(commandHandle, true);
    const composer = screen.getByPlaceholder("Message Codex");
    const textarea = composer.element();
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("composer textarea must render");
    }

    await composer.click();
    textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    textarea.value = "你好呀";
    textarea.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "你好呀",
      }),
    );
    await expect.element(composer).toHaveValue("你好呀");

    const keyupAllowed = textarea.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key,
      }),
    );
    expect(keyupAllowed).toBe(true);

    await screen.user.keyboard("{Enter}");

    expect(commandHandle.startTurn).not.toHaveBeenCalled();
    await expect.element(composer).toHaveValue("你好呀");

    await screen.user.keyboard("{Enter}");

    expect(commandHandle.startTurn).toHaveBeenCalledTimes(1);
    expect(commandHandle.startTurn).toHaveBeenCalledWith({
      threadId,
      clientUserMessageId: null,
      input: [{ type: "text", text: "你好呀", text_elements: [] }],
    });
  },
);

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
  composer.element().focus();
  await expect.element(composer).toHaveFocus();
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

test("pending stop disables duplicate interruption until success", async () => {
  const { commandHandle, composer, pending, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  const stopButtonElement = stopButton.element();
  if (!(stopButtonElement instanceof HTMLButtonElement)) {
    throw new Error("Stop control must render as a button");
  }
  stopButtonElement.click();
  expect(commandHandle.interruptTurn).toHaveBeenCalledTimes(1);
  if (eventTurnStarted.event.type !== "turnStarted") {
    throw new Error("fixture must be turnStarted");
  }
  expect(commandHandle.interruptTurn).toHaveBeenCalledWith({
    threadId,
    turnId: eventTurnStarted.event.notification.turn.id,
  });

  pending.resolve({});
  await expect.element(stopButton).toBeEnabled();
  await expect.element(composer).toHaveValue("Draft while stopping");
});

test("stop failure keeps draft and shows a toast", async () => {
  const { commandHandle, composer, pending, screen, stopButton } =
    await beginPendingStop("Draft while stopping");

  await expect.element(stopButton).toBeDisabled();
  pending.reject(new Error("interrupt failed"));

  await expect.element(stopButton).toBeEnabled();
  await expect.element(composer).toHaveValue("Draft while stopping");
  await expect.element(screen.getByText("Stop failed")).toBeVisible();
  await expect.element(screen.getByText("interrupt failed")).toBeVisible();
  expect(commandHandle.interruptTurn).toHaveBeenCalledTimes(1);
});
