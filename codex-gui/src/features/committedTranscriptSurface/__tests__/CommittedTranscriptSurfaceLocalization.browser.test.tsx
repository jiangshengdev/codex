import { expect, test } from "vitest";
import { task6SimplifiedChineseMessages } from "@/__tests__/task6LocaleTestSupport";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  createEmptyTranscriptState,
  type TranscriptState,
} from "@/features/transcriptState/transcriptStateModel";
import {
  threadRuntimeAttached,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

const localizedTranscriptExpectations = [
  {
    locale: "en" as const,
    regionLabel: "Committed transcript",
    emptyState: "No committed messages yet.",
    connectionInterrupted: "Connection interrupted. Reconnect required.",
    turnLabel: (turnId: string) => `Turn ${turnId}`,
    interruptedEntry: "Interrupted.",
    failedEntry: "Failed.",
    intermediateOne: "Intermediate updates · 1 item",
    intermediateTwo: "Intermediate updates · 2 items",
    turnStatuses: {
      completed: "Completed",
      inProgress: "In progress",
      interrupted: "Interrupted",
      failed: "Failed",
    },
  },
  {
    locale: "zh-CN" as const,
    regionLabel: "已提交的对话",
    emptyState: "暂无已提交的消息。",
    connectionInterrupted: "连接已中断，需要重新连接。",
    turnLabel: (turnId: string) => `对话轮次 ${turnId}`,
    interruptedEntry: "已中断。",
    failedEntry: "失败。",
    intermediateOne: "中间更新 · 1 项",
    intermediateTwo: "中间更新 · 2 项",
    turnStatuses: {
      completed: "已完成",
      inProgress: "进行中",
      interrupted: "已中断",
      failed: "失败",
    },
  },
];

const dynamicThreadId = "dynamic-transcript-thread";
const dynamicTranscriptText = "Dynamic transcript content 不翻译";

const createLocalizedTranscriptState = (): TranscriptState => {
  const state = createEmptyTranscriptState();
  const completedTurnId = "dynamic-turn-completed";
  const inProgressTurnId = "dynamic-turn-in-progress";
  const interruptedTurnId = "dynamic-turn-interrupted";
  const failedTurnId = "dynamic-turn-failed";
  const inProgressChunkId = `${inProgressTurnId}:chunk:0`;
  const interruptedChunkId = `${interruptedTurnId}:chunk:0`;

  state.threadId = dynamicThreadId;
  state.turnIds = [completedTurnId, inProgressTurnId, interruptedTurnId, failedTurnId];
  state.turnsById = {
    [completedTurnId]: {
      id: completedTurnId,
      status: "completed",
      leadingPromptEntryId: "dynamic-message-completed",
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    },
    [inProgressTurnId]: {
      id: inProgressTurnId,
      status: "inProgress",
      leadingPromptEntryId: "dynamic-message-in-progress",
      middleChunkIds: [inProgressChunkId],
      middleEntryCount: 1,
      finalAssistantEntryIds: [],
    },
    [interruptedTurnId]: {
      id: interruptedTurnId,
      status: "interrupted",
      leadingPromptEntryId: "dynamic-message-interrupted",
      middleChunkIds: [interruptedChunkId],
      middleEntryCount: 2,
      finalAssistantEntryIds: [],
    },
    [failedTurnId]: {
      id: failedTurnId,
      status: "failed",
      leadingPromptEntryId: "dynamic-message-failed",
      middleChunkIds: [],
      middleEntryCount: 0,
      finalAssistantEntryIds: [],
    },
  };
  state.chunksById = {
    [inProgressChunkId]: {
      id: inProgressChunkId,
      turnId: inProgressTurnId,
      entryIds: ["dynamic-status-interrupted"],
      revision: 0,
    },
    [interruptedChunkId]: {
      id: interruptedChunkId,
      turnId: interruptedTurnId,
      entryIds: ["dynamic-status-failed", "dynamic-message-middle"],
      revision: 0,
    },
  };
  state.entriesById = {
    "dynamic-message-completed": {
      type: "message",
      id: "dynamic-message-completed",
      turnId: completedTurnId,
      role: "user",
      source: dynamicTranscriptText,
      sourceKind: "plainText",
      phase: null,
      revision: 0,
    },
    "dynamic-message-in-progress": {
      type: "message",
      id: "dynamic-message-in-progress",
      turnId: inProgressTurnId,
      role: "user",
      source: "Dynamic in-progress prompt",
      sourceKind: "plainText",
      phase: null,
      revision: 0,
    },
    "dynamic-message-interrupted": {
      type: "message",
      id: "dynamic-message-interrupted",
      turnId: interruptedTurnId,
      role: "user",
      source: "Dynamic interrupted prompt",
      sourceKind: "plainText",
      phase: null,
      revision: 0,
    },
    "dynamic-message-failed": {
      type: "message",
      id: "dynamic-message-failed",
      turnId: failedTurnId,
      role: "user",
      source: "Dynamic failed prompt",
      sourceKind: "plainText",
      phase: null,
      revision: 0,
    },
    "dynamic-message-middle": {
      type: "message",
      id: "dynamic-message-middle",
      turnId: interruptedTurnId,
      role: "assistant",
      source: "Dynamic intermediate response",
      sourceKind: "plainText",
      phase: "commentary",
      revision: 0,
    },
    "dynamic-status-interrupted": {
      type: "status",
      id: "dynamic-status-interrupted",
      turnId: inProgressTurnId,
      status: "interrupted",
      revision: 0,
    },
    "dynamic-status-failed": {
      type: "status",
      id: "dynamic-status-failed",
      turnId: interruptedTurnId,
      status: "failed",
      revision: 0,
    },
  };
  state.entryChunkById = {
    "dynamic-status-interrupted": inProgressChunkId,
    "dynamic-status-failed": interruptedChunkId,
    "dynamic-message-middle": interruptedChunkId,
  };

  return state;
};

test.each(localizedTranscriptExpectations)(
  "renders the empty transcript shell in $locale",
  async ({ emptyState, locale, regionLabel }) => {
    const screen = await renderWithProviders(<CommittedTranscriptSurface />, {
      locale,
      messages: locale === "zh-CN" ? task6SimplifiedChineseMessages : undefined,
    });

    await expect.element(screen.getByRole("region", { name: regionLabel })).toBeVisible();
    await expect.element(screen.getByText(emptyState, { exact: true })).toBeVisible();
  },
);

test.each(localizedTranscriptExpectations)(
  "localizes transcript chrome while preserving machine and dynamic values in $locale",
  async (expectation) => {
    const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />, {
      locale: expectation.locale,
      messages: expectation.locale === "zh-CN" ? task6SimplifiedChineseMessages : undefined,
      preloadedState: { transcriptState: createLocalizedTranscriptState() },
    });

    store.dispatch(
      threadRuntimeManualReconnectRequired({
        reason: "backpressure",
        threadId: dynamicThreadId,
        subscriptionId: "dynamic-subscription-id",
      }),
    );

    await expect
      .element(screen.getByRole("region", { name: expectation.regionLabel }))
      .toBeVisible();
    await expect
      .element(screen.getByText(expectation.connectionInterrupted, { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText(dynamicTranscriptText, { exact: true })).toBeVisible();

    for (const [status, label] of Object.entries(expectation.turnStatuses)) {
      const turnId = `dynamic-turn-${status === "inProgress" ? "in-progress" : status}`;
      const turn = screen.getByRole("article", { name: expectation.turnLabel(turnId) });
      await expect.element(turn).toHaveAttribute("data-turn-status", status);
      await expect.element(turn.getByText(label, { exact: true })).toBeVisible();
    }

    await expect
      .element(screen.getByText(expectation.interruptedEntry, { exact: true }))
      .toBeVisible();
    await expect.element(screen.getByText(expectation.failedEntry, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: expectation.intermediateOne }))
      .toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: expectation.intermediateTwo }))
      .toBeDisabled();
    expect(store.getState().transcriptState.turnsById["dynamic-turn-completed"]?.status).toBe(
      "completed",
    );
    expect(store.getState().transcriptState.turnsById["dynamic-turn-in-progress"]?.status).toBe(
      "inProgress",
    );
    expect(store.getState().transcriptState.turnsById["dynamic-turn-interrupted"]?.status).toBe(
      "interrupted",
    );
    expect(store.getState().transcriptState.turnsById["dynamic-turn-failed"]?.status).toBe(
      "failed",
    );
  },
);

test("renders an empty committed transcript region", async () => {
  const screen = await renderWithProviders(<CommittedTranscriptSurface />);

  await expect.element(screen.getByRole("region", { name: "Committed transcript" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});

test("renders committed user and assistant messages from an attached baseline", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-surface", [
          userMessage("user-surface", [textInput("Hello "), textInput("surface")]),
          agentMessage("agent-surface", "Committed response"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByRole("article", { name: "Turn turn-surface" })).toBeVisible();
  await expect.element(screen.getByText("Hello surface")).toBeVisible();
  await expect.element(screen.getByText("Committed response")).toBeVisible();
  await expect.element(screen.getByText("turn-surface")).not.toBeInTheDocument();
  await expect.element(screen.getByText("user")).not.toBeInTheDocument();
  await expect.element(screen.getByText("assistant")).not.toBeInTheDocument();

  const entries = Array.from(document.querySelectorAll<HTMLElement>(".committed-transcript-entry"));
  expect(
    entries.map((entry) => ({
      isSecondary: entry.classList.contains("card--secondary"),
      text: entry.textContent,
    })),
  ).toStrictEqual([
    { isSecondary: true, text: "Hello surface" },
    { isSecondary: false, text: "Committed response" },
  ]);
});
