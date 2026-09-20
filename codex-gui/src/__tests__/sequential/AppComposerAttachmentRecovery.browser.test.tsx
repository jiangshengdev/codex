import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  attachResponse,
  createDeferred,
  emitProjectionEvent,
  launchThreadId,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "@/__tests__/appBrowserTestSupport";
import {
  attachmentFileInput,
  renderActiveComposerQueueApp,
  startTurnParamsAt,
} from "@/__tests__/appComposerQueueBrowserTestSupport";
import { createComposerInputQueueCoordinator } from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { eventTurnCompleted } from "@/features/projection/__tests__/projectionFixtures";
import {
  eventWithEnvelope,
  turnCompleted,
} from "@/features/projection/__tests__/projectionTestBuilders";

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

test("undoing removal of an unfinished upload restores an interrupted attachment, not a stuck upload", async () => {
  const late = createDeferred<Response>();
  vi.spyOn(globalThis, "fetch").mockImplementation(() => late.promise);
  const { screen, composer } = await renderActiveComposerQueueApp(startHost);
  await attachmentFileInput(screen.container).upload(new File(["late"], "late.txt"));
  await composer.getByRole("button", { name: "Remove late.txt", exact: true }).click();
  await expect.element(composer.getByText("late.txt", { exact: true })).not.toBeInTheDocument();
  await userEvent.keyboard(
    navigator.platform.startsWith("Mac") ? "{Meta>}z{/Meta}" : "{Control>}z{/Control}",
  );
  await expect.element(composer.getByText("Upload interrupted", { exact: true })).toBeVisible();
  late.resolve(new Response("/tmp/late.txt", { status: 201 }));
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
});

test("Pending editing restores an attachment and blocks Save and Enter until its new attachment is ready", async () => {
  const secondUpload = createDeferred<Response>();
  const upload = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response("/tmp/a.txt", { status: 201 }))
    .mockImplementationOnce(() => secondUpload.promise);
  const { screen, composer, startTurn, steerTurn, options, activeTurn } =
    await renderActiveComposerQueueApp(startHost);

  await attachmentFileInput(screen.container).upload(new File(["A"], "a.txt"));
  await expect.element(composer.getByText("a.txt", { exact: true })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await screen
    .getByRole("group", { name: "Pending: Queued 1", exact: true })
    .getByRole("button", { name: "Queued 1", exact: true })
    .click();
  const dialog = screen.getByRole("dialog", { name: "Pending details", exact: true });
  await dialog.getByRole("button", { name: "Edit", exact: true }).click();
  const pendingEditor = screen.getByRole("combobox", { name: "Edit pending message", exact: true });
  await expect.element(pendingEditor.getByText("a.txt", { exact: true })).toBeVisible();
  await pendingEditor.getByText("a.txt", { exact: true }).click();
  await userEvent.keyboard("{ArrowRight}");
  await attachmentFileInput(screen.getByRole("dialog").element()).upload(new File(["B"], "b.txt"));
  await expect.element(pendingEditor.getByText("b.txt", { exact: true })).toBeVisible();
  const save = screen.getByRole("button", { name: "Save", exact: true });
  await expect.element(save).toBeDisabled();
  await pendingEditor.click();
  await userEvent.keyboard("{Enter}");
  await expect.element(pendingEditor).toBeVisible();
  await expect.element(pendingEditor.getByText("a.txt", { exact: true })).toBeVisible();
  await expect.element(pendingEditor.getByText("b.txt", { exact: true })).toBeVisible();
  expect(startTurn).not.toHaveBeenCalled();
  expect(steerTurn).not.toHaveBeenCalled();
  expect(upload).toHaveBeenCalledTimes(2);
  expect(new Headers(upload.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe(
    "Bearer secret",
  );

  secondUpload.resolve(new Response("/tmp/b.txt", { status: 201 }));
  await expect.element(save).toBeEnabled();
  await save.click();
  await expect.element(pendingEditor).not.toBeInTheDocument();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect(startTurn).not.toHaveBeenCalled();
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      turnCompleted(eventTurnCompleted, "attachment-edit-terminal", {
        ...activeTurn,
        status: "completed",
      }),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  await expect.poll(() => startTurn.mock.calls.length).toBe(1);
  expect(startTurnParamsAt(startTurn, 0).input).toEqual([
    {
      type: "text",
      text: "/tmp/a.txt /tmp/b.txt",
      text_elements: [
        { byteRange: { start: 0, end: 10 }, placeholder: "a.txt" },
        { byteRange: { start: 11, end: 21 }, placeholder: "b.txt" },
      ],
    },
  ]);
  expect(steerTurn).not.toHaveBeenCalled();
});
