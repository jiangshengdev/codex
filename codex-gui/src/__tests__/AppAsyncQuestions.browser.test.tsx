import { beforeEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createAppRouter } from "@/router";
import {
  attachResponse,
  createGuiHostCommands,
  createDeferred,
  emitProjectionEvent,
  getHostOptions,
  initializeHost,
  launchThreadId,
  markCommandsUnavailable,
  queueAttachProjectionResponse,
  resetAppBrowserTestSupport,
  type StartGuiHostConnectionMock,
} from "./appBrowserTestSupport";
import { AppBrowserRenderHarness as App } from "./appBrowserRenderHarness";
import { getAppComposer } from "./appProjectionBrowserTestSupport";
import { renderWithProviders } from "@/utils/test-utils";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { GuiHostCommandError } from "@/features/guiHost/guiHostCommandGateway";
import {
  eventItemCompleted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  asyncQuestionMessage,
  attachWithTurns,
  attachWithThreadId,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  textInput,
  baseTurn,
  turnCompleted,
  turnWithStatus,
} from "@/features/projection/__tests__/projectionTestBuilders";

const hostMock = vi.hoisted(() => ({
  startGuiHostConnection: vi.fn<(options: StartGuiHostConnectionOptions) => () => void>(),
}));
vi.mock("@/features/guiHost/guiHostClient", () => ({
  startGuiHostConnection: hostMock.startGuiHostConnection,
}));
const connectionMock = hostMock.startGuiHostConnection as unknown as StartGuiHostConnectionMock;

beforeEach(() => {
  resetAppBrowserTestSupport(connectionMock);
  window.history.replaceState({}, "", `/task/${launchThreadId}#token=secret`);
});

test("answers a live plain-text question as guidance without replacing the composer draft", async () => {
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(connectionMock);
  const turn = inProgressTurn("question-turn");
  queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, [turn]));
  initializeHost(options, commands);
  const composer = getAppComposer(screen);
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  await composer.fill("Keep my bottom draft");
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "question-commit",
        turn.id,
        asyncQuestionMessage("question-message", [{ title: "Which environment?", options: null }]),
      ),
      { parentCommitId: attachResponse.snapshot.headCommitId },
    ),
  );
  const question = screen.getByRole("group", { name: "Which environment?", exact: true });
  await expect
    .element(question.getByRole("button", { name: "Submit answer", exact: true }))
    .toBeDisabled();
  await question.getByRole("textbox", { name: "Answer", exact: true }).fill("Staging");
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect.poll(() => vi.mocked(commands.steerTurn).mock.calls.length).toBe(1);
  expect(vi.mocked(commands.steerTurn).mock.calls[0]?.[0].input).toEqual([
    textInput("> Which environment?\n\nStaging"),
  ]);
  await expect.element(question.getByRole("textbox")).not.toBeInTheDocument();
  await expect.element(composer).toHaveTextContent("Keep my bottom draft");
});

test.each(["completed", "interrupted"] as const)(
  "keeps the answer after a %s turn and submits it as a new turn",
  async (status) => {
    const commands = createGuiHostCommands();
    const screen = await renderWithProviders(<App />);
    const options = getHostOptions(connectionMock);
    const turn = inProgressTurn("question-turn");
    queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, [turn]));
    initializeHost(options, commands);
    await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");
    const item = asyncQuestionMessage("question-message", [
      { title: "Deployment target?", options: null },
    ]);
    emitProjectionEvent(
      options,
      eventWithEnvelope(itemCompleted(eventItemCompleted, "question-commit", turn.id, item), {
        parentCommitId: attachResponse.snapshot.headCommitId,
      }),
    );
    const question = screen.getByRole("group", { name: "Deployment target?", exact: true });
    await question.getByRole("textbox").fill("Preview");
    emitProjectionEvent(
      options,
      eventWithEnvelope(
        turnCompleted(
          eventTurnCompleted,
          "done-commit",
          turnWithStatus(baseTurn(turn.id, [item]), status),
        ),
        {
          parentCommitId: "question-commit",
        },
      ),
    );
    await expect.element(screen.getByRole("button", { name: "Stop", exact: true })).toBeDisabled();
    await expect.element(question.getByRole("textbox")).toHaveValue("Preview");
    await question.getByRole("button", { name: "Submit answer", exact: true }).click();
    await expect.poll(() => vi.mocked(commands.startTurn).mock.calls.length).toBe(1);
    expect(vi.mocked(commands.startTurn).mock.calls[0]?.[0].input).toEqual([
      textInput("> Deployment target?\n\nPreview"),
    ]);
    expect(commands.steerTurn).not.toHaveBeenCalled();
  },
);

test("keeps disconnected questions read-only and does not send or skip them", async () => {
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(connectionMock);
  const turn = inProgressTurn("question-turn");
  queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, [turn]));
  initializeHost(options, commands);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "question-commit",
        turn.id,
        asyncQuestionMessage("question-message", [{ title: "Region?", options: null }]),
      ),
      {
        parentCommitId: attachResponse.snapshot.headCommitId,
      },
    ),
  );
  const question = screen.getByRole("group", { name: "Region?", exact: true });
  await question.getByRole("textbox").fill("Local");
  markCommandsUnavailable(options);
  await expect.element(question.getByRole("textbox")).toHaveAttribute("readonly");
  await expect.element(question.getByRole("textbox")).toHaveValue("Local");
  await expect
    .element(question.getByRole("button", { name: "Submit answer", exact: true }))
    .toBeDisabled();
  await expect
    .element(question.getByRole("button", { name: "Skip question", exact: true }))
    .toBeDisabled();
  expect(commands.steerTurn).not.toHaveBeenCalled();
});

test("snapshot questions remain readable without restoring answer controls", async () => {
  const commands = createGuiHostCommands();
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(connectionMock);
  queueAttachProjectionResponse(
    commands,
    attachWithTurns(attachResponse, [
      baseTurn("old-turn", [
        asyncQuestionMessage("old-question", [
          { title: "Historical question", options: ["Original option"] },
        ]),
      ]),
    ]),
  );
  initializeHost(options, commands);
  await expect.element(getAppComposer(screen)).toHaveAttribute("contenteditable", "true");
  const question = screen.getByRole("group", { name: "Historical question", exact: true });
  await expect.element(question).toBeVisible();
  await expect.element(question.getByText("Original option", { exact: true })).toBeVisible();
  expect(question.getByRole("textbox").all()).toHaveLength(0);
  expect(commands.startTurn).not.toHaveBeenCalled();
});

async function renderLiveQuestion(
  title = "Deployment target?",
  commands = createGuiHostCommands(),
  questions: Parameters<typeof asyncQuestionMessage>[1] = [{ title, options: null }],
) {
  const screen = await renderWithProviders(<App />);
  const options = getHostOptions(connectionMock);
  const turn = inProgressTurn("question-turn");
  queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, [turn]));
  initializeHost(options, commands);
  const composer = getAppComposer(screen);
  await expect.element(composer).toHaveAttribute("contenteditable", "true");
  const item = asyncQuestionMessage("question-message", questions);
  const event = eventWithEnvelope(
    itemCompleted(eventItemCompleted, "question-commit", turn.id, item),
    {
      parentCommitId: attachResponse.snapshot.headCommitId,
    },
  );
  emitProjectionEvent(options, event);
  const question = screen.getByRole("group", { name: title, exact: true });
  await expect.element(question.getByRole("textbox")).toBeVisible();
  return { commands, screen, options, turn, item, event, question, composer };
}

test("selects an option without sending and preserves custom text when switching answers", async () => {
  const { question, commands } = await renderLiveQuestion("Environment?", undefined, [
    { title: "Environment?", options: ["Preview", "Production"] },
  ]);
  await expect.element(question.getByRole("radio", { name: "Preview", exact: true })).toBeChecked();
  expect(commands.steerTurn).not.toHaveBeenCalled();
  await question.getByRole("textbox").fill("Custom environment");
  await expect
    .element(question.getByRole("radio", { name: "Custom answer", exact: true }))
    .toBeChecked();
  await question.getByText("Production", { exact: true }).click();
  await expect.element(question.getByRole("textbox")).toHaveValue("Custom environment");
  expect(commands.steerTurn).not.toHaveBeenCalled();
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect.poll(() => vi.mocked(commands.steerTurn).mock.calls.length).toBe(1);
  expect(vi.mocked(commands.steerTurn).mock.calls[0]?.[0].input).toEqual([
    textInput("> Environment?\n\nProduction"),
  ]);
});

test("submits mixed answers out of order even when question references share a prefix", async () => {
  const prefix = "界".repeat(170);
  const titles = [prefix + "第一题", prefix + "第二题", "Skip only me"] as const;
  const { screen, commands, options, event, turn } = await renderLiveQuestion(
    titles[0],
    undefined,
    [
      { title: titles[0], options: ["First option", "Second option"] },
      { title: titles[1], options: ["Default", "Alternative"] },
      { title: titles[2], options: null },
    ],
  );
  const first = screen.getByRole("group", { name: titles[0], exact: true });
  const second = screen.getByRole("group", { name: titles[1], exact: true });
  const third = screen.getByRole("group", { name: titles[2], exact: true });
  vi.mocked(commands.steerTurn).mockResolvedValue({ turnId: turn.id });
  await first.getByText("Second option", { exact: true }).click();
  await second.getByRole("textbox").fill("Second custom answer");
  emitProjectionEvent(
    options,
    eventWithEnvelope(
      itemCompleted(
        eventItemCompleted,
        "later-question",
        turn.id,
        asyncQuestionMessage("later-message", [
          { title: "Later question", options: ["Later option"] },
        ]),
      ),
      { parentCommitId: event.commitId },
    ),
  );
  await expect
    .element(first.getByRole("radio", { name: "Second option", exact: true }))
    .toBeChecked();
  await expect.element(second.getByRole("textbox")).toHaveValue("Second custom answer");
  await third.getByRole("button", { name: "Skip question", exact: true }).click();
  await second.getByRole("button", { name: "Submit answer", exact: true }).click();
  await first.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect.poll(() => vi.mocked(commands.steerTurn).mock.calls.length).toBe(2);
  expect(vi.mocked(commands.steerTurn).mock.calls.map(([params]) => params.input)).toEqual([
    [textInput("> " + prefix + "\n\nSecond custom answer")],
    [textInput("> " + prefix + "\n\nSecond option")],
  ]);
  await expect
    .element(
      screen.getByRole("group", { name: "Later question", exact: true }).getByRole("textbox"),
    )
    .toBeVisible();
  await expect.element(third.getByText("Question skipped", { exact: true })).toBeVisible();
});

test("custom option rejects blank text and retains the selection when queue handoff fails", async () => {
  const { question, commands, screen } = await renderLiveQuestion("Choice?", undefined, [
    { title: "Choice?", options: ["One", "Two"] },
  ]);
  await question.getByText("Custom answer", { exact: true }).click();
  await question.getByRole("textbox").fill("   ");
  await expect
    .element(question.getByRole("button", { name: "Submit answer", exact: true }))
    .toBeDisabled();
  await question.getByRole("textbox").fill("Retained custom");
  await question.getByText("Two", { exact: true }).click();
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("Storage unavailable");
  });
  try {
    await question.getByRole("button", { name: "Submit answer", exact: true }).click();
    await expect.element(question.getByRole("radio", { name: "Two", exact: true })).toBeChecked();
    await expect.element(question.getByRole("textbox")).toHaveValue("Retained custom");
    expect(commands.steerTurn).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
  await screen.getByRole("button", { name: "Retry saving", exact: true }).click();
  await question.getByText("Custom answer", { exact: true }).click();
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect.poll(() => vi.mocked(commands.steerTurn).mock.calls.length).toBe(1);
  expect(vi.mocked(commands.steerTurn).mock.calls[0]?.[0].input).toEqual([
    textInput("> Choice?\n\nRetained custom"),
  ]);
});

test("keeps option controls disabled until the disconnected task recovers", async () => {
  const { question, options, commands } = await renderLiveQuestion("Offline choice?", undefined, [
    { title: "Offline choice?", options: ["One", "Two"] },
  ]);
  await question.getByText("Two", { exact: true }).click();
  markCommandsUnavailable(options);
  await expect.element(question.getByRole("radio", { name: "Two", exact: true })).toBeDisabled();
  await expect.element(question.getByRole("radio", { name: "Two", exact: true })).toBeChecked();
  await expect.element(question.getByRole("textbox")).toHaveAttribute("readonly");
  await expect
    .element(question.getByRole("button", { name: "Submit answer", exact: true }))
    .toBeDisabled();
  expect(commands.steerTurn).not.toHaveBeenCalled();
});

test("wraps long choices on phones while keeping their labels clickable", async () => {
  await page.viewport(390, 844);
  try {
    const option = "VeryLongOption".repeat(40);
    const { question, commands } = await renderLiveQuestion("Phone options?", undefined, [
      { title: "Phone options?", options: ["Short", option] },
    ]);
    const label = question.getByText(option, { exact: true });
    const rect = label.element().getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    await label.click();
    await expect.element(question.getByRole("radio", { name: option, exact: true })).toBeChecked();
    await question.getByRole("button", { name: "Submit answer", exact: true }).click();
    await expect.poll(() => vi.mocked(commands.steerTurn).mock.calls.length).toBe(1);
  } finally {
    await page.viewport(1280, 720);
  }
});

test("skipping closes only the local entrance and duplicate events do not reopen it", async () => {
  const { commands, question, options, event } = await renderLiveQuestion();
  await question.getByRole("textbox").fill("Unsubmitted draft");
  await question.getByRole("button", { name: "Skip question", exact: true }).click();
  await expect.element(question.getByText("Question skipped", { exact: true })).toBeVisible();
  emitProjectionEvent(options, event);
  emitProjectionEvent(
    options,
    eventWithEnvelope(event, { commitId: "duplicate-item", parentCommitId: event.commitId }),
  );
  await expect.element(question.getByRole("textbox")).not.toBeInTheDocument();
  expect(commands.startTurn).not.toHaveBeenCalled();
  expect(commands.steerTurn).not.toHaveBeenCalled();
});

test("retains the answer when its local queue persistence fails", async () => {
  const { commands, question } = await renderLiveQuestion();
  await question.getByRole("textbox").fill("Keep this answer");
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
    throw new Error("Storage unavailable");
  });
  try {
    await question.getByRole("button", { name: "Submit answer", exact: true }).click();
    await expect.element(question.getByRole("textbox")).toHaveValue("Keep this answer");
    expect(commands.steerTurn).not.toHaveBeenCalled();
  } finally {
    write.mockRestore();
  }
});

test("appends answers behind existing guidance and leaves ordinary messages in their queue", async () => {
  const commands = createGuiHostCommands();
  const first = createDeferred<Awaited<ReturnType<GuiHostCommands["steerTurn"]>>>();
  vi.mocked(commands.steerTurn).mockImplementationOnce(() => first.promise);
  const { question, composer, screen, turn } = await renderLiveQuestion("Continue?", commands);
  await composer.fill("Ordinary message");
  await screen.getByRole("button", { name: "Send", exact: true }).click();
  await composer.fill("Earlier guidance");
  await screen.getByRole("button", { name: "Guide", exact: true }).click();
  await expect.poll(() => vi.mocked(commands.steerTurn).mock.calls.length).toBe(1);
  await question.getByRole("textbox").fill("Yes");
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect.element(question.getByText("Answer submitted", { exact: true })).toBeVisible();
  expect(commands.steerTurn).toHaveBeenCalledTimes(1);
  first.resolve({ turnId: turn.id });
  await expect.poll(() => vi.mocked(commands.steerTurn).mock.calls.length).toBe(2);
  expect(vi.mocked(commands.steerTurn).mock.calls.map(([params]) => params.input)).toEqual([
    [textInput("Earlier guidance")],
    [textInput("> Continue?\n\nYes")],
  ]);
  expect(commands.startTurn).not.toHaveBeenCalled();
});

test("does not resubmit an answer after an unknown delivery result", async () => {
  const commands = createGuiHostCommands();
  vi.mocked(commands.steerTurn).mockRejectedValue(
    new GuiHostCommandError({
      source: "send",
      delivery: "deliveryUnknown",
      error: new Error("Connection lost after sending"),
    }),
  );
  const { question, options, event } = await renderLiveQuestion("Continue?", commands);
  await question.getByRole("textbox").fill("Yes");
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  await expect.element(question.getByText("Answer submitted", { exact: true })).toBeVisible();
  emitProjectionEvent(
    options,
    eventWithEnvelope(event, { commitId: "duplicate-item", parentCommitId: event.commitId }),
  );
  await expect.element(question.getByRole("textbox")).not.toBeInTheDocument();
  expect(commands.steerTurn).toHaveBeenCalledTimes(1);
  expect(commands.startTurn).not.toHaveBeenCalled();
});

test("bounds the question reference on UTF-8 boundaries before flattening line breaks", async () => {
  const title = "a".repeat(507) + "\r\n" + "界" + "🧭 omitted";
  const { commands, question } = await renderLiveQuestion(title);
  await question.getByRole("textbox").fill("Line one\nLine two");
  await question.getByRole("button", { name: "Submit answer", exact: true }).click();
  expect(vi.mocked(commands.steerTurn).mock.calls[0]?.[0].input).toEqual([
    textInput("> " + "a".repeat(507) + "  界\n\nLine one\nLine two"),
  ]);
});

test("keeps a long plain-text question operable within a phone viewport", async () => {
  await page.viewport(390, 844);
  try {
    const { question } = await renderLiveQuestion("Deployment".repeat(30));
    await question.getByRole("textbox").fill("Phone answer");
    const rect = question.element().getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    await question.getByRole("button", { name: "Submit answer", exact: true }).click();
    await expect.element(question.getByText("Answer submitted", { exact: true })).toBeVisible();
  } finally {
    await page.viewport(1280, 720);
  }
});

test.each([false, true])(
  "retains pending question and bottom drafts across task switches (options: %s)",
  async (withOptions) => {
    const secondId = "00000000-0000-0000-0000-000000000002";
    const router = createAppRouter(
      createMemoryHistory({ initialEntries: [`/task/${launchThreadId}`] }),
    );
    const screen = await renderWithProviders(<RouterProvider router={router} />);
    const commands = createGuiHostCommands({ storedThreadIds: [launchThreadId, secondId] });
    const options = getHostOptions(connectionMock);
    const turn = inProgressTurn("question-turn");
    queueAttachProjectionResponse(commands, attachWithTurns(attachResponse, [turn]));
    initializeHost(options, commands);
    const composer = getAppComposer(screen);
    await expect.element(composer).toHaveAttribute("contenteditable", "true");
    emitProjectionEvent(
      options,
      eventWithEnvelope(
        itemCompleted(
          eventItemCompleted,
          "question-commit",
          turn.id,
          asyncQuestionMessage("question-message", [
            { title: "First task question", options: withOptions ? ["One", "Two"] : null },
          ]),
        ),
        {
          parentCommitId: attachResponse.snapshot.headCommitId,
        },
      ),
    );
    const question = screen.getByRole("group", { name: "First task question", exact: true });
    await question.getByRole("textbox").fill("Retained answer");
    if (withOptions) await question.getByText("Two", { exact: true }).click();
    await composer.fill("Retained composer draft");
    queueAttachProjectionResponse(
      commands,
      attachWithThreadId(attachWithTurns(attachResponse, []), secondId),
    );
    await router.navigate({ to: "/task/$threadId", params: { threadId: secondId } });
    await expect.element(question).not.toBeInTheDocument();
    await expect.element(composer).toHaveTextContent("");
    await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
    await expect.element(question.getByRole("textbox")).toHaveValue("Retained answer");
    expect(
      question
        .getByRole("radio", { checked: true })
        .all()
        .map((radio) => radio.element().getAttribute("value")),
    ).toEqual(withOptions ? ["1"] : []);
    await question.getByRole("button", { name: "Submit answer", exact: true }).click();
    await router.navigate({ to: "/task/$threadId", params: { threadId: secondId } });
    await router.navigate({ to: "/task/$threadId", params: { threadId: launchThreadId } });
    await expect.element(composer).toHaveTextContent("Retained composer draft");
    await expect.element(question.getByText("Answer submitted", { exact: true })).toBeVisible();
  },
);

test.each([false, true])(
  "waits for target recovery before editing a retained question and never auto-sends (options: %s)",
  async (withOptions) => {
    const { question, options, item, turn, screen } = await renderLiveQuestion(
      "Recovery?",
      undefined,
      [{ title: "Recovery?", options: withOptions ? ["One", "Two"] : null }],
    );
    await question.getByRole("textbox").fill("Draft before disconnect");
    if (withOptions) await question.getByText("Two", { exact: true }).click();
    markCommandsUnavailable(options);
    options.onStatus?.({ label: "closed" });
    await screen.getByRole("button", { name: "Reconnect", exact: true }).click();
    const recovered = createGuiHostCommands({ loadedThreadIds: [launchThreadId] });
    const recovery = createDeferred<typeof attachResponse>();
    vi.mocked(recovered.attachThreadProjection).mockImplementation(() => recovery.promise);
    initializeHost(getHostOptions(connectionMock), recovered);
    await expect.poll(() => vi.mocked(recovered.attachThreadProjection).mock.calls.length).toBe(1);
    await expect.element(question.getByRole("textbox")).toHaveAttribute("readonly");
    recovery.resolve(attachWithTurns(attachResponse, [baseTurn(turn.id, [item])]));
    await expect.element(question.getByRole("textbox")).not.toHaveAttribute("readonly");
    await expect.element(question.getByRole("textbox")).toHaveValue("Draft before disconnect");
    expect(
      question
        .getByRole("radio", { checked: true })
        .all()
        .map((radio) => radio.element().getAttribute("value")),
    ).toEqual(withOptions ? ["1"] : []);
    expect(recovered.startTurn).not.toHaveBeenCalled();
    await question.getByRole("button", { name: "Submit answer", exact: true }).click();
    await expect.poll(() => vi.mocked(recovered.startTurn).mock.calls.length).toBe(1);
  },
);

test("does not expire or automatically send a question after thirty seconds", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  try {
    const { question, commands } = await renderLiveQuestion();
    await question.getByRole("textbox").fill("Not submitted yet");
    await vi.advanceTimersByTimeAsync(31_000);
    await expect.element(question.getByRole("textbox")).toHaveValue("Not submitted yet");
    expect(commands.steerTurn).not.toHaveBeenCalled();
    expect(commands.startTurn).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
