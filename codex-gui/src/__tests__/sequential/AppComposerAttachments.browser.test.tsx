import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, server, userEvent } from "vitest/browser";
import {
  attachResponse,
  createDeferred,
  createGuiHostCommands,
  getHostOptions,
  initializeHost,
  queueAttachProjectionResponse,
  emitProjectionEvent,
  launchThreadId,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "@/__tests__/appBrowserTestSupport";
import {
  attachmentFileInput,
  dispatchGuideShortcut,
  renderActiveComposerQueueApp,
  steerTurnParamsAt,
} from "@/__tests__/appComposerQueueBrowserTestSupport";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { eventItemCompleted } from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  itemCompleted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { AppBrowserRenderHarness as App } from "@/__tests__/appBrowserRenderHarness";
import { renderWithProviders } from "@/utils/test-utils";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));
vi.mock("@/features/composerInputQueue/composerInputQueueCoordinator", { spy: true });
const startHost = host.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

test("preview read retry preserves the uploaded path and recovers without uploading again", async () => {
  const pending = createDeferred<Response>();
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("/tmp/a.txt", { status: 201 }))
    .mockResolvedValueOnce(new Response("/tmp/picture.png", { status: 201 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockImplementationOnce(() => pending.promise);
  const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload([
    new File(["A"], "a.txt"),
    new File([png], "picture.png", { type: "image/png" }),
  ]);
  const retry = composer.getByRole("button", { name: "Retry preview picture.png", exact: true });
  await expect.element(retry).toBeVisible();
  await expect.element(retry).toHaveTextContent(/^$/);
  await retry.click();
  await expect.element(retry).toBeDisabled();
  await expect.element(composer.getByRole("alert")).toHaveTextContent("Preview read failed");
  await expect.element(retry).toHaveFocus();
  await userEvent.keyboard("{Enter}{Enter}");
  expect(request).toHaveBeenCalledTimes(4);
  pending.resolve(new Response(png, { headers: { "Content-Type": "image/png" } }));
  const preview = composer.getByRole("button", { name: "Preview picture.png", exact: true });
  await preview.click();
  await expect
    .element(screen.getByRole("dialog").getByRole("img", { name: "picture.png" }))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(preview).toHaveFocus();
  await expect.element(retry).not.toBeInTheDocument();
  await expect.element(composer.getByRole("alert")).not.toBeInTheDocument();
  expect(request.mock.calls.map(([url, options]) => [url, options?.method ?? "GET"])).toEqual([
    ["/upload?filename=a.txt", "POST"],
    ["/upload?filename=picture.png", "POST"],
    ["/upload/preview?path=%2Ftmp%2Fpicture.png", "GET"],
    ["/upload/preview?path=%2Ftmp%2Fpicture.png", "GET"],
  ]);
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
    {
      type: "text",
      text: "/tmp/a.txt /tmp/picture.png",
      text_elements: [
        { byteRange: { start: 0, end: 10 }, placeholder: "a.txt" },
        { byteRange: { start: 11, end: 27 }, placeholder: "picture.png" },
      ],
    },
    { type: "localImage", path: "/tmp/picture.png" },
  ]);
});

test.each([
  { responseStatus: 503, message: "Preview read failed", retryCount: 1 },
  { responseStatus: 200, message: "Cannot display preview", retryCount: 0 },
])(
  "preview retry ending with $message keeps the image sendable",
  async ({ responseStatus, message, retryCount }) => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("/tmp/picture.png", { status: 201 }))
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response("invalid", { status: responseStatus }));
    const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
    await attachmentFileInput(screen.container).upload(
      new File(["image"], "picture.png", { type: "image/png" }),
    );
    const retry = composer.getByRole("button", { name: "Retry preview picture.png", exact: true });
    await retry.click();
    await expect.element(composer.getByRole("alert")).toHaveTextContent(message);
    await expect.poll(() => retry.all().length).toBe(retryCount);
    await composer
      .getByRole("button", { name: "Failure details for picture.png", exact: true })
      .click();
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await screen.getByRole("button", { name: "Guide", exact: true }).click();
    await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
    expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
      {
        type: "text",
        text: "/tmp/picture.png",
        text_elements: [{ byteRange: { start: 0, end: 16 }, placeholder: "picture.png" }],
      },
      { type: "localImage", path: "/tmp/picture.png" },
    ]);
    expect(request.mock.calls.map(([, options]) => options?.method ?? "GET")).toEqual([
      "POST",
      "GET",
      "GET",
    ]);
  },
);

test("an image can be sent during a preview retry and its late response is cancelled", async () => {
  const pending = createDeferred<Response>();
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("/tmp/picture.png", { status: 201 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockImplementationOnce(() => pending.promise);
  const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload(
    new File(["image"], "picture.png", { type: "image/png" }),
  );
  const retry = composer.getByRole("button", { name: "Retry preview picture.png", exact: true });
  await retry.click();
  await expect.element(retry).toBeDisabled();
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
    {
      type: "text",
      text: "/tmp/picture.png",
      text_elements: [{ byteRange: { start: 0, end: 16 }, placeholder: "picture.png" }],
    },
    { type: "localImage", path: "/tmp/picture.png" },
  ]);
  await expect.poll(() => request.mock.calls[2]?.[1]?.signal?.aborted).toBe(true);
  pending.resolve(new Response("late", { status: 503 }));
  await expect.element(composer.getByText("picture.png", { exact: true })).not.toBeInTheDocument();
});

test("removing a retrying preview cancels the read without affecting another attachment", async () => {
  const pending = createDeferred<Response>();
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("/tmp/picture.png", { status: 201 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockImplementationOnce(() => pending.promise)
    .mockResolvedValueOnce(new Response("/tmp/other.png", { status: 201 }))
    .mockResolvedValueOnce(new Response(png, { headers: { "Content-Type": "image/png" } }));
  const { screen, composer } = await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload(
    new File([png], "picture.png", { type: "image/png" }),
  );
  await composer.getByRole("button", { name: "Retry preview picture.png", exact: true }).click();
  await composer.getByRole("button", { name: "Remove picture.png", exact: true }).click();
  await expect.element(composer).toHaveFocus();
  expect(request.mock.calls[2]?.[1]?.signal?.aborted).toBe(true);
  await attachmentFileInput(screen.container).upload(
    new File([png], "other.png", { type: "image/png" }),
  );
  const preview = composer.getByRole("button", { name: "Preview other.png", exact: true });
  await expect.element(preview).toBeVisible();
  pending.resolve(new Response(png, { headers: { "Content-Type": "image/png" } }));
  await preview.click();
  await expect
    .element(screen.getByRole("dialog").getByRole("img", { name: "other.png", exact: true }))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(composer.getByText("picture.png", { exact: true })).not.toBeInTheDocument();
  await expect.element(preview).toBeVisible();
  expect(request).toHaveBeenCalledTimes(5);
});

test("plain user messages preserve literal text and body typography after completion", async () => {
  const { screen, options, activeTurn } = await renderActiveComposerQueueApp(startHost);
  const first = "原文🙂  **bold**\n\n";
  const second = "<b>literal</b>\n" + "long-user-text-".repeat(60);
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "plain-text-commit",
        activeTurn.id,
        userMessage("plain-text-message", [
          { type: "text", text: first, text_elements: [] },
          { type: "text", text: second, text_elements: [] },
        ]),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  const transcript = screen.getByRole("region", { name: "Committed transcript" });
  const message = transcript.getByText(/^原文🙂/);
  await expect.element(message).toHaveStyle("font-size: 16px; line-height: 24px");
  expect(message.element().textContent).toBe(first + second);
  expect(message.element().querySelector("b, strong")).toBeNull();
  for (const width of [1440, 400]) {
    await page.viewport(width, 900);
    await expect.element(message).toHaveStyle("white-space: pre-wrap");
    expect(message.element().scrollWidth).toBeLessThanOrEqual(message.element().clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  }
});

test("unsupported images block sending and can be removed as a whole", async () => {
  const upload = vi.spyOn(globalThis, "fetch");
  const { screen, composer } = await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload(
    new File(["unsupported"], "photo.heic", { type: "image/heic" }),
  );
  await expect
    .element(composer.getByText("Unsupported image format. Use PNG, JPEG, GIF, or WebP."))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  expect(upload).not.toHaveBeenCalled();
  await composer.getByText("photo.heic", { exact: true }).click();
  await userEvent.keyboard("{Backspace}");
  await expect.element(composer.getByText("photo.heic", { exact: true })).not.toBeInTheDocument();
});

test("user history keeps literal typography and image-only messages after reconnect", async () => {
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(new Response(png, { headers: { "Content-Type": "image/png" } })),
  );
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  const history = attachWithTurns(attachResponse, [
    baseTurn("literal-history", [
      userMessage("literal-prompt", [
        { type: "text", text: "历史🙂  **literal**\n\n", text_elements: [] },
        { type: "text", text: "<b>原文</b>", text_elements: [] },
      ]),
      userMessage("image-only-prompt", [{ type: "localImage", path: "/tmp/only.png" }]),
      userMessage("marked-prompt", [
        {
          type: "text",
          text: "文件🙂 /tmp/history.txt  后文",
          text_elements: [{ byteRange: { start: 11, end: 27 }, placeholder: "历史文件.txt" }],
        },
      ]),
    ]),
  ]);
  queueAttachProjectionResponse(commands, history);
  const options = getHostOptions(startHost);
  initializeHost(options, commands);
  const transcript = screen.getByRole("region", { name: "Committed transcript" });
  const message = transcript.getByText(/^历史🙂/);
  const image = transcript.getByRole("button", { name: "Preview only.png", exact: true });
  for (const reconnect of [false, true]) {
    if (reconnect) {
      options.onCommandsUnavailable?.();
      options.onStatus?.({ label: "closed" });
      await screen.getByRole("button", { name: "Reconnect", exact: true }).click();
      const replacement = createGuiHostCommands();
      queueAttachProjectionResponse(replacement, history);
      initializeHost(getHostOptions(startHost), replacement);
    }
    await expect
      .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
      .toHaveAttribute("contenteditable", "true");
    await expect.element(message).toHaveStyle("font-size: 16px; line-height: 24px");
    expect(message.element().textContent).toBe("历史🙂  **literal**\n\n<b>原文</b>");
    expect(message.element().querySelector("b, strong")).toBeNull();
    await expect.element(image).toBeVisible();
    const marked = transcript.getByText(/^文件🙂/);
    await expect.element(marked).toHaveStyle("font-size: 16px; line-height: 24px");
    expect(marked.element().textContent).toBe("文件🙂 历史文件.txt  后文");
    const file = transcript.getByRole("button", { name: "历史文件.txt", exact: true });
    await file.click();
    await expect.element(screen.getByText("/tmp/history.txt", { exact: true })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(file).toHaveFocus();
    await image.click();
    await expect.element(screen.getByRole("dialog", { name: "only.png" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(image).toHaveFocus();
    await expect
      .element(transcript.getByRole("button", { name: "Remove only.png", exact: true }))
      .not.toBeInTheDocument();
  }
});

test("reloaded image history keeps its filename and reports an unavailable preview", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  queueAttachProjectionResponse(
    commands,
    attachWithTurns(attachResponse, [
      baseTurn("old-image-turn", [
        userMessage("old-image", [
          { type: "localImage", path: "/tmp/image.png" },
          {
            type: "text",
            text: "/tmp/image.png",
            text_elements: [{ byteRange: { start: 0, end: 14 }, placeholder: "original.png" }],
          },
        ]),
      ]),
    ]),
  );
  initializeHost(getHostOptions(startHost), commands);
  await expect
    .element(
      screen.getByText(
        "Could not load the preview of original.png. The file may no longer be available.",
      ),
    )
    .toBeVisible();
});

beforeEach(() => {
  resetAppBrowserTestSupport(startHost);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(1280, 720);
});

test("narrow draft attachments preserve visible keyboard focus beside adjacent controls", async () => {
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );
  vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) =>
    Promise.resolve(
      options?.method === "POST"
        ? new Response("/tmp/focus.png", { status: 201 })
        : new Response(png, { headers: { "Content-Type": "image/png" } }),
    ),
  );
  const { screen, composer } = await renderActiveComposerQueueApp(startHost);
  await page.viewport(400, 876);
  await attachmentFileInput(screen.container).upload([
    new File([png], "first.png", { type: "image/png" }),
    new File([png], "second.png", { type: "image/png" }),
    new File(["unsupported"], "long-failed-image-name-".repeat(8) + ".heic", {
      type: "image/heic",
    }),
  ]);
  const first = composer.getByRole("button", { name: "Preview first.png", exact: true });
  await first.click();
  await userEvent.keyboard("{Escape}");
  await expect.element(first).toHaveFocus();
  await userEvent.tab();
  const remove = composer.getByRole("button", { name: "Remove first.png", exact: true });
  await expect.element(remove).toHaveFocus();
  await expect
    .poll(
      () =>
        remove
          .element()
          .getAnimations()
          .filter((animation) => animation.playState === "running").length,
    )
    .toBe(0);
  const focused = getComputedStyle(remove.element());
  expect(focused.boxShadow).not.toBe("none");
  expect(Number(focused.zIndex)).toBeGreaterThan(
    Number(getComputedStyle(first.element()).zIndex) || 0,
  );
  // Focus shadows extend beyond the control. Measure their actual spread rather than a CSS class.
  const spreads = [
    ...focused.boxShadow.replace(/rgba?\([^)]*\)/g, "").matchAll(/(-?[\d.]+)px/g),
  ].map((match) => Number(match[1]));
  const outset = Math.max(...spreads);
  expect(outset).toBeGreaterThan(0);
  const bounds = remove.element().getBoundingClientRect();
  const editorBounds = composer.element().getBoundingClientRect();
  expect(bounds.left - outset).toBeGreaterThanOrEqual(editorBounds.left);
  expect(bounds.right + outset).toBeLessThanOrEqual(editorBounds.right);
  expect(bounds.top - outset).toBeGreaterThanOrEqual(editorBounds.top);
  expect(bounds.bottom + outset).toBeLessThanOrEqual(editorBounds.bottom);
  const next = composer
    .getByRole("group", { name: "second.png", exact: true })
    .element()
    .getBoundingClientRect();
  expect(bounds.right + outset <= next.left || bounds.bottom + outset <= next.top).toBe(true);
  await expect
    .element(composer.getByText("Unsupported image format. Use PNG, JPEG, GIF, or WebP."))
    .toBeVisible();
  expect(composer.element().scrollWidth).toBeLessThanOrEqual(composer.element().clientWidth);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(400);
  await composer.screenshot({ path: `__screenshots__/attachment-focus-${server.browser}.png` });
});

test("mixed file and image attachments align their bottom edges without overflowing narrow messages", async () => {
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(new Response(png, { headers: { "Content-Type": "image/png" } })),
  );
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  queueAttachProjectionResponse(
    commands,
    attachWithTurns(attachResponse, [
      baseTurn("mixed-attachments", [
        userMessage("mixed-message", [
          {
            type: "text",
            text: "Before\n/tmp/a.txt/tmp/b.png\nbetween /tmp/long.txt\n/tmp/b.png after",
            text_elements: [
              { byteRange: { start: 7, end: 17 }, placeholder: "notes.txt" },
              { byteRange: { start: 17, end: 27 }, placeholder: "picture.png" },
              {
                byteRange: { start: 36, end: 49 },
                placeholder: "a-very-long-attachment-name-".repeat(8) + ".txt",
              },
              { byteRange: { start: 50, end: 60 }, placeholder: "second.png" },
            ],
          },
          { type: "localImage", path: "/tmp/b.png" },
        ]),
        agentMessage("mixed-reply", "Agent typography stays unchanged"),
      ]),
    ]),
  );
  initializeHost(getHostOptions(startHost), commands);
  const transcript = screen.getByRole("region", { name: "Committed transcript" });
  const file = transcript.getByRole("button", { name: "notes.txt", exact: true });
  const image = transcript.getByRole("button", { name: "Preview picture.png", exact: true });
  await expect.element(image).toBeVisible();
  const message = transcript.getByText(/^Before/);
  await expect.element(message).toHaveStyle("font-size: 16px; line-height: 24px");
  await expect
    .element(message)
    .toHaveTextContent(
      `Before notes.txtpicture.png between ${"a-very-long-attachment-name-".repeat(8)}.txt second.png after`,
    );
  await expect
    .element(transcript.getByText("Agent typography stays unchanged", { exact: true }))
    .toHaveStyle("font-size: 16px; line-height: 24px");
  await expect
    .element(screen.getByRole("combobox", { name: "Message Codex", exact: true }))
    .toHaveStyle("font-size: 16px; line-height: 24px");
  for (const width of [1440, 400]) {
    await page.viewport(width, 900);
    await expect
      .poll(() =>
        Math.abs(
          file.element().getBoundingClientRect().bottom -
            image.element().getBoundingClientRect().bottom,
        ),
      )
      .toBeLessThanOrEqual(1);
    expect(image.element().getBoundingClientRect().right).toBeLessThanOrEqual(width);
    expect(file.element().getBoundingClientRect().left).toBeLessThan(
      image.element().getBoundingClientRect().left,
    );
    const thumbnail = image.element().querySelector("img");
    if (thumbnail == null) throw new Error("Missing attachment thumbnail");
    const outer = image.element().getBoundingClientRect();
    const inner = thumbnail.getBoundingClientRect();
    const inset = inner.left - outer.left;
    expect(inner.top - outer.top).toBeCloseTo(inset, 0);
    expect(outer.bottom - inner.bottom).toBeCloseTo(inset, 0);
    expect(
      parseFloat(getComputedStyle(image.element()).borderTopLeftRadius) -
        parseFloat(getComputedStyle(thumbnail).borderTopLeftRadius),
    ).toBeCloseTo(inset, 0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await file.click();
    await expect.element(screen.getByRole("dialog", { name: "notes.txt" })).toBeVisible();
    await expect.element(screen.getByText("/tmp/a.txt", { exact: true })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(file).toHaveFocus();
    await userEvent.tab();
    await expect.element(image).toHaveFocus();
    await expect
      .poll(
        () =>
          image
            .element()
            .getAnimations()
            .filter((a) => a.playState === "running").length,
      )
      .toBe(0);
    const shadow = getComputedStyle(image.element()).boxShadow;
    expect(shadow).not.toBe("none");
    const outset = Math.max(
      ...[...shadow.replace(/rgba?\([^)]*\)/g, "").matchAll(/(-?[\d.]+)px/g)].map((m) =>
        Number(m[1]),
      ),
    );
    expect(outset).toBeGreaterThan(0);
    expect(image.element().getBoundingClientRect().left - outset).toBeGreaterThanOrEqual(
      file.element().getBoundingClientRect().right,
    );
    await userEvent.keyboard("{Enter}");
    await expect.element(screen.getByRole("dialog", { name: "picture.png" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(image).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(file).toHaveFocus();
    const messageBounds = message.element().getBoundingClientRect();
    for (const button of message.getByRole("button").elements()) {
      const bounds = button.getBoundingClientRect();
      expect(bounds.left - outset).toBeGreaterThanOrEqual(messageBounds.left);
      expect(bounds.right + outset).toBeLessThanOrEqual(messageBounds.right);
      expect(bounds.top - outset).toBeGreaterThanOrEqual(messageBounds.top);
      expect(bounds.bottom + outset).toBeLessThanOrEqual(messageBounds.bottom);
    }
    await expect
      .element(transcript.getByRole("button", { name: /^Remove / }))
      .not.toBeInTheDocument();
    await transcript.screenshot({
      path: `__screenshots__/attachment-layout-${server.browser}-${String(width)}-smooth-${String(CSS.supports("corner-shape", "squircle"))}.png`,
    });
  }
  await page.viewport(1280, 720);
});

test("Composer uploads a file, blocks keyboard submission until ready, and displays its authoritative filename and path", async () => {
  const response = createDeferred<Response>();
  const upload = vi.spyOn(globalThis, "fetch").mockImplementation(() => response.promise);
  const { screen, composer, steerTurn, options, activeTurn } =
    await renderActiveComposerQueueApp(startHost);
  await composer.fill("请看🙂 ");
  await attachmentFileInput(screen.container).upload(new File(["original bytes"], "notes.txt"));
  await expect.element(composer.getByText("notes.txt", { exact: true })).toBeVisible();
  await expect.element(composer.getByRole("status")).toHaveTextContent("Uploading");
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await composer.click();
  dispatchGuideShortcut(composer.element());
  expect(steerTurn).not.toHaveBeenCalled();
  expect(upload).toHaveBeenCalledOnce();
  const request = upload.mock.calls[0];
  expect(request?.[0]).toBe("/upload?filename=notes.txt");
  expect(new Headers(request?.[1]?.headers).get("Authorization")).toBe("Bearer secret");
  response.resolve(new Response("/tmp/codex-upload-note.txt", { status: 201 }));
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await expect.element(composer.getByRole("status")).toHaveTextContent("Uploaded");
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  const params = steerTurnParamsAt(steerTurn, 0);
  expect(params.input).toEqual([
    {
      type: "text",
      text: "请看🙂 /tmp/codex-upload-note.txt",
      text_elements: [{ byteRange: { start: 11, end: 37 }, placeholder: "notes.txt" }],
    },
  ]);
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "attachment-commit",
        activeTurn.id,
        userMessage("attachment-message", params.input, params.clientUserMessageId),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  const transcript = screen.getByRole("region", { name: "Committed transcript" });
  await expect
    .element(transcript.getByText(/^请看🙂/))
    .toHaveStyle("font-size: 16px; line-height: 24px");
  await transcript.getByRole("button", { name: "notes.txt", exact: true }).click();
  await expect
    .element(screen.getByText("/tmp/codex-upload-note.txt", { exact: true }))
    .toBeVisible();
});

test("failed attachments retry independently and a removed upload cannot return", async () => {
  const late = createDeferred<Response>();
  const upload = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("failed", { status: 500 }))
    .mockResolvedValueOnce(new Response("/tmp/retried.txt", { status: 201 }))
    .mockImplementationOnce(() => late.promise);
  const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
  const files = attachmentFileInput(screen.container);
  await files.upload(new File(["retry bytes"], "retry.txt"));
  await expect.element(composer.getByText("File upload failed.")).toBeVisible();
  await composer.click();
  dispatchGuideShortcut(composer.element());
  expect(steerTurn).not.toHaveBeenCalled();
  await composer.getByRole("button", { name: "Retry upload retry.txt", exact: true }).click();
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await composer.getByText("retry.txt", { exact: true }).click();
  await userEvent.keyboard("{ArrowRight}");
  await files.upload(new File(["late bytes"], "late.txt"));
  await expect.element(composer.getByText("late.txt", { exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "Remove late.txt", exact: true }).click();
  await expect.element(composer).toHaveFocus();
  late.resolve(new Response("/tmp/late.txt", { status: 201 }));
  await expect.element(composer.getByText("late.txt", { exact: true })).not.toBeInTheDocument();
  await composer.click();
  dispatchGuideShortcut(composer.element());
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
    {
      type: "text",
      text: "/tmp/retried.txt",
      text_elements: [{ byteRange: { start: 0, end: 16 }, placeholder: "retry.txt" }],
    },
  ]);
  expect(upload).toHaveBeenCalledTimes(3);
});

test("upload retry shows only progress and prevents duplicate requests until success", async () => {
  const retried = createDeferred<Response>();
  const upload = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("failed", { status: 500 }))
    .mockImplementationOnce(() => retried.promise);
  const { screen, composer } = await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload(new File(["bytes"], "retry.txt"));
  const retry = composer.getByRole("button", { name: "Retry upload retry.txt", exact: true });
  await expect.element(retry).toBeVisible();
  await expect.element(retry).toHaveTextContent(/^$/);
  await expect
    .element(retry.element().querySelector<HTMLSpanElement>(".button-group__separator"))
    .toBeVisible();
  await retry.click();
  await expect.element(retry).toBeDisabled();
  await expect.element(composer.getByRole("status")).toHaveTextContent(/^Uploading$/);
  await expect.element(composer.getByRole("status")).toHaveClass("chip--accent");
  await expect
    .element(retry.element().querySelector<HTMLSpanElement>(".button-group__separator"))
    .toBeVisible();
  await userEvent.keyboard("{Enter}{Enter}");
  expect(upload).toHaveBeenCalledTimes(2);
  retried.resolve(new Response("/tmp/retry.txt", { status: 201 }));
  await expect.element(composer.getByRole("status")).toHaveTextContent("Uploaded");
  await expect.element(retry).not.toBeInTheDocument();
  await expect
    .element(
      composer
        .getByRole("button", { name: "Remove retry.txt", exact: true })
        .element()
        .querySelector<HTMLSpanElement>(".button-group__separator"),
    )
    .toBeVisible();
});

test.each([
  { state: "loading", status: "Loading preview…" },
  { state: "read", status: "Preview read failed" },
  { state: "decode", status: "Cannot display preview" },
])("$state preview preserves attachment layout and actual sending", async ({ state, status }) => {
  const pending = createDeferred<Response>();
  vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => {
    if (options?.method === "POST") {
      const name =
        new URL(url instanceof Request ? url.url : url, location.href).searchParams.get(
          "filename",
        ) ?? "";
      return Promise.resolve(new Response(`/tmp/${name}`, { status: 201 }));
    }
    return state === "loading"
      ? pending.promise
      : Promise.resolve(new Response("invalid", { status: state === "read" ? 503 : 200 }));
  });
  const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload([
    new File(["A"], "a.txt"),
    new File(["image"], "picture.png", { type: "image/png" }),
  ]);
  const attachment = composer.getByRole("group", { name: "picture.png", exact: true });
  await expect.element(attachment.getByText("picture.png", { exact: true })).toBeVisible();
  await expect.element(attachment.getByText("Uploaded", { exact: true })).toBeVisible();
  await expect.element(attachment.getByText(status, { exact: true })).toBeVisible();
  const remove = attachment.getByRole("button", { name: "Remove picture.png", exact: true });
  for (const width of [1280, 375]) {
    await page.viewport(width, 800);
    await expect.element(remove).toBeVisible();
    const bounds = attachment.element().getBoundingClientRect();
    const controls = attachment.getByRole("button").elements();
    for (const control of controls) {
      await expect
        .element(control.querySelector<HTMLSpanElement>(".button-group__separator"))
        .toBeVisible();
      const rect = control.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(bounds.left);
      expect(rect.right).toBeLessThanOrEqual(bounds.right + 1);
      expect(rect.width).toBeGreaterThanOrEqual(28);
      expect(rect.height).toBeGreaterThanOrEqual(28);
    }
    expect(attachment.element().scrollWidth).toBeLessThanOrEqual(attachment.element().clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  }
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
    {
      type: "text",
      text: "/tmp/a.txt /tmp/picture.png",
      text_elements: [
        { byteRange: { start: 0, end: 10 }, placeholder: "a.txt" },
        { byteRange: { start: 11, end: 27 }, placeholder: "picture.png" },
      ],
    },
    { type: "localImage", path: "/tmp/picture.png" },
  ]);
});

test("reloaded authoritative history retains a filename and its path without a local upload", async () => {
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  queueAttachProjectionResponse(
    commands,
    attachWithTurns(attachResponse, [
      baseTurn("old-attachments", [
        userMessage("old-file", [
          {
            type: "text",
            text: "资料🙂 /tmp/saved.txt",
            text_elements: [{ byteRange: { start: 11, end: 25 }, placeholder: "报告.txt" }],
          },
        ]),
      ]),
    ]),
  );
  initializeHost(getHostOptions(startHost), commands);
  const transcript = screen.getByRole("region", { name: "Committed transcript" });
  await transcript.getByRole("button", { name: "报告.txt", exact: true }).click();
  await expect.element(screen.getByText("/tmp/saved.txt", { exact: true })).toBeVisible();
});

test("a mixed-result batch keeps input order and retries only the failed file", async () => {
  const first = createDeferred<Response>();
  const upload = vi
    .spyOn(globalThis, "fetch")
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValueOnce(new Response("failed", { status: 500 }))
    .mockResolvedValueOnce(new Response("/tmp/b.txt", { status: 201 }));
  const { screen, composer, steerTurn } = await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload([
    new File(["A"], "a.txt"),
    new File(["B"], "b.txt"),
  ]);
  await expect.element(composer.getByText("a.txt", { exact: true })).toBeVisible();
  await expect.element(composer.getByText("File upload failed.")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  first.resolve(new Response("/tmp/a.txt", { status: 201 }));
  await expect.element(composer.getByText("Uploaded", { exact: true })).toBeVisible();
  await composer.click();
  dispatchGuideShortcut(composer.element());
  expect(steerTurn).not.toHaveBeenCalled();
  await composer.getByRole("button", { name: "Retry upload b.txt", exact: true }).click();
  await expect.element(screen.getByRole("button", { name: "Guide", exact: true })).toBeEnabled();
  await composer.click();
  await userEvent.keyboard(
    navigator.platform.startsWith("Mac") ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}",
  );
  const copied = new DataTransfer();
  const copyEvent = new ClipboardEvent("copy", {
    clipboardData: copied,
    bubbles: true,
    cancelable: true,
  });
  // Firefox creates a separate DataTransfer for synthetic clipboard events.
  Object.defineProperty(copyEvent, "clipboardData", { value: copied });
  composer.element().dispatchEvent(copyEvent);
  expect(copied.getData("text/plain")).toBe("/tmp/a.txt /tmp/b.txt");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  expect(steerTurnParamsAt(steerTurn, 0).input).toEqual([
    {
      type: "text",
      text: "/tmp/a.txt /tmp/b.txt",
      text_elements: [
        { byteRange: { start: 0, end: 10 }, placeholder: "a.txt" },
        { byteRange: { start: 11, end: 21 }, placeholder: "b.txt" },
      ],
    },
  ]);
  expect(upload.mock.calls.map(([url]) => url)).toEqual([
    "/upload?filename=a.txt",
    "/upload?filename=b.txt",
    "/upload?filename=b.txt",
  ]);
});

test("an image is previewable in the draft and authoritative history and sends a localImage", async () => {
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
    ),
    (char) => char.charCodeAt(0),
  );
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation((_url, options) =>
      Promise.resolve(
        options?.method === "POST"
          ? new Response("/tmp/codex-upload-image.png", { status: 201 })
          : new Response(png, { headers: { "Content-Type": "image/png" } }),
      ),
    );
  const { screen, composer, steerTurn, activeTurn, options } =
    await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload(
    new File([png], "picture.png", { type: "image/png" }),
  );
  const preview = composer.getByRole("button", { name: "Preview picture.png", exact: true });
  await expect.element(preview).toBeVisible();
  expect(composer.element().textContent.match(/picture\.png/g)).toHaveLength(1);
  await expect.element(preview.getByRole("status")).toHaveTextContent("Uploaded");
  const remove = composer.getByRole("button", { name: "Remove picture.png", exact: true });
  await expect.element(remove).toHaveTextContent(/^$/);
  await preview.click();
  const dialog = screen.getByRole("dialog", { name: "picture.png", exact: true });
  await expect.element(dialog.getByRole("img", { name: "picture.png" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close image preview" }).click();
  await expect.element(preview).toHaveFocus();
  await userEvent.tab();
  await expect.element(remove).toHaveFocus();
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Remove picture.png");
  await userEvent.tab({ shift: true });
  await expect.element(preview).toHaveFocus();
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => steerTurn.mock.calls.length).toBe(1);
  const params = steerTurnParamsAt(steerTurn, 0);
  expect(params.input).toEqual([
    {
      type: "text",
      text: "/tmp/codex-upload-image.png",
      text_elements: [{ byteRange: { start: 0, end: 27 }, placeholder: "picture.png" }],
    },
    { type: "localImage", path: "/tmp/codex-upload-image.png" },
  ]);
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "image-commit",
        activeTurn.id,
        userMessage("image-message", params.input, params.clientUserMessageId),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  await screen
    .getByRole("region", { name: "Committed transcript" })
    .getByRole("button", { name: "Preview picture.png", exact: true })
    .click();
  await expect.element(dialog.getByRole("img", { name: "picture.png" })).toBeVisible();
  expect(
    request.mock.calls
      .filter(([, options]) => options?.method !== "POST")
      .every(
        ([url, options]) =>
          url === "/upload/preview?path=%2Ftmp%2Fcodex-upload-image.png" &&
          new Headers(options?.headers).get("Authorization") === "Bearer secret",
      ),
  ).toBe(true);
});

test.each(["read", "decode"])(
  "%s preview failure details support pointer and keyboard with focus restoration",
  async (state) => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, options) =>
      Promise.resolve(
        options?.method === "POST"
          ? new Response("/tmp/picture.png", { status: 201 })
          : new Response("invalid", { status: state === "read" ? 503 : 200 }),
      ),
    );
    const { screen, composer } = await renderActiveComposerQueueApp(startHost);
    await attachmentFileInput(screen.container).upload(
      new File(["image"], "picture.png", { type: "image/png" }),
    );
    const attachment = composer.getByRole("group", { name: "picture.png", exact: true });
    const remove = attachment.getByRole("button", { name: "Remove picture.png", exact: true });
    const label = "Failure details for picture.png";
    const details = attachment.getByRole("button", { name: label, exact: true });
    await expect.element(details).toHaveTextContent(/^$/);
    await details.click();
    const dialog = screen.getByRole("dialog", { name: label, exact: true });
    await expect.element(dialog).toBeVisible();
    await expect
      .element(dialog)
      .toHaveTextContent(
        state === "read"
          ? "Could not read the image preview. Check the connection and access permissions."
          : "The browser could not decode this image. Remove the attachment and choose another file.",
      );
    await dialog.getByRole("button", { name: "Close failure details", exact: true }).click();
    await expect.element(details).toHaveFocus();
    await userEvent.tab();
    await expect.element(remove).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect.element(screen.getByRole("tooltip")).toHaveTextContent(label);
    await userEvent.keyboard("{Enter}");
    await expect.element(dialog).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(details).toHaveFocus();
  },
);
