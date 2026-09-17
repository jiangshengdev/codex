import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
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
} from "./appBrowserTestSupport";
import {
  dispatchGuideShortcut,
  renderActiveComposerQueueApp,
  steerTurnParamsAt,
} from "./appComposerQueueBrowserTestSupport";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { eventItemCompleted } from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithTurns,
  baseTurn,
  eventWithEnvelope,
  itemCompleted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import { renderWithProviders } from "@/utils/test-utils";

const host = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: host.startGuiHostConnection,
}));
vi.mock("@/features/composerInputQueue/composerInputQueueCoordinator", { spy: true });
const startHost = host.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

beforeEach(() => {
  resetAppBrowserTestSupport(startHost);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
  vi.mocked(createComposerInputQueueCoordinator).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("Composer uploads a file, blocks keyboard submission until ready, and displays its authoritative filename and path", async () => {
  const response = createDeferred<Response>();
  const upload = vi.spyOn(globalThis, "fetch").mockImplementation(() => response.promise);
  const { screen, composer, steerTurn, options, activeTurn } =
    await renderActiveComposerQueueApp(startHost);
  await composer.fill("请看🙂 ");
  await screen
    .getByLabelText("Attach files", { exact: true })
    .upload(new File(["original bytes"], "notes.txt"));
  await expect.element(composer.getByText("notes.txt", { exact: true })).toBeVisible();
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
  const files = screen.getByLabelText("Attach files", { exact: true });
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
