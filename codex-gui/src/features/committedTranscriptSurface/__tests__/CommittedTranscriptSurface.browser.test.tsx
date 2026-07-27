import { expect, test } from "vitest";
import { task6SimplifiedChineseMessages } from "@/__tests__/task6LocaleTestSupport";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  collabAgentToolCall,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  subAgentActivity,
  textInput,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  createEmptyTranscriptState,
  type TranscriptState,
} from "@/features/transcriptState/transcriptStateModel";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { selectCommittedTranscriptScrollCommitKey } from "@/features/transcriptState/transcriptStateSlice";
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

test("renders ordered transparent sub-agent activity cards without exposing private ids", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-sub-agent-activity", [
          userMessage("user-before-activity", [textInput("Review the activity")]),
          subAgentActivity("activity-started-private", "started", "/root/reviewer", {
            agentThreadId: "agent-thread-started-private",
          }),
          agentMessage("agent-between-activity", "Checking the transcript", "commentary"),
          subAgentActivity("activity-interacted-private", "interacted", "/root/reviewer", {
            agentThreadId: "agent-thread-interacted-private",
          }),
          subAgentActivity("activity-interrupted-private", "interrupted", "/root/reviewer", {
            agentThreadId: "agent-thread-interrupted-private",
          }),
        ]),
      ]),
    ),
  );

  const activityTitles = [
    "Started /root/reviewer",
    "Interacted with /root/reviewer",
    "Interrupted /root/reviewer",
  ];
  for (const title of activityTitles) {
    const activity = screen.getByRole("article", { name: title });
    await expect.element(activity).toBeVisible();
    await expect.element(activity).toHaveClass("card--transparent");
  }

  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 4 items" }))
    .toBeDisabled();
  for (const privateId of [
    "activity-started-private",
    "activity-interacted-private",
    "activity-interrupted-private",
    "agent-thread-started-private",
    "agent-thread-interacted-private",
    "agent-thread-interrupted-private",
  ]) {
    await expect.element(screen.getByText(privateId)).not.toBeInTheDocument();
  }

  const entries = Array.from(document.querySelectorAll<HTMLElement>(".committed-transcript-entry"));
  expect(entries.map((entry) => entry.textContent)).toStrictEqual([
    "Review the activity",
    "Started /root/reviewer",
    "Checking the transcript",
    "Interacted with /root/reviewer",
    "Interrupted /root/reviewer",
  ]);
  expect(entries[0]?.classList.contains("card--secondary")).toBe(true);
  expect(entries[2]?.classList.contains("card--default")).toBe(true);

  const activityCards = Array.from(
    document.querySelectorAll<HTMLElement>(".committed-transcript-entry-activity"),
  );
  expect(activityCards).toHaveLength(3);
  for (const activityCard of activityCards) {
    expect(activityCard.querySelector(".card__description")).toBeNull();
    expect(
      activityCard.querySelector(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).toBeNull();
  }
});

test("updates one committed wait activity from started to completed in place", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: turnStarted(eventTurnStarted, "commit-turn-wait", inProgressTurn("turn-wait")),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-wait-started",
        "turn-wait",
        collabAgentToolCall("wait-browser", "wait", "inProgress", {
          senderThreadId: "sender-thread-private",
        }),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByRole("article", { name: "Waiting for agents" })).toBeVisible();
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 1 item" }))
    .toBeDisabled();
  for (const privateId of ["wait-browser", "sender-thread-private"]) {
    await expect.element(screen.getByText(privateId)).not.toBeInTheDocument();
  }

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-after-wait",
        "turn-wait",
        agentMessage("agent-after-wait", "After waiting marker", "commentary"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("After waiting marker")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 2 items" }))
    .toBeDisabled();
  expect(
    Array.from(document.querySelectorAll<HTMLElement>(".committed-transcript-entry")).map(
      (entry) => entry.textContent,
    ),
  ).toStrictEqual(["Waiting for agents", "After waiting marker"]);

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-wait-completed",
        "turn-wait",
        collabAgentToolCall("wait-browser", "wait", "completed", {
          senderThreadId: "sender-thread-private",
        }),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Waiting for agents")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("article", { name: "Finished waiting" })).toBeVisible();
  await expect.element(screen.getByText("No agents completed yet")).toBeVisible();
  expect(document.querySelectorAll(".committed-transcript-entry-activity")).toHaveLength(1);
  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 2 items" }))
    .toBeDisabled();
  const completedEntries = Array.from(
    document.querySelectorAll<HTMLElement>(".committed-transcript-entry"),
  );
  expect(completedEntries).toHaveLength(2);
  expect(completedEntries[0]?.querySelector(".card__title")?.textContent).toBe("Finished waiting");
  expect(completedEntries[0]?.querySelector(".card__description")?.textContent).toBe(
    "No agents completed yet",
  );
  expect(completedEntries[1]?.textContent).toBe("After waiting marker");
});

test("keeps ordered activity entries unmounted until the final-answer disclosure expands", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-collapsed-activity", [
          userMessage("user-collapsed-activity", [textInput("Initial prompt")]),
          subAgentActivity("activity-collapsed-started", "started", "/root/reviewer"),
          agentMessage("agent-collapsed-commentary", "Working note", "commentary"),
          subAgentActivity("activity-collapsed-interacted", "interacted", "/root/reviewer"),
          agentMessage("agent-collapsed-final", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect.element(screen.getByText("Started /root/reviewer")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Working note")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Interacted with /root/reviewer")).not.toBeInTheDocument();
  expect(document.querySelectorAll(".committed-transcript-entry-activity")).toHaveLength(0);

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 3 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect
    .element(screen.getByRole("article", { name: "Started /root/reviewer" }))
    .toBeVisible();
  await expect.element(screen.getByText("Working note")).toBeVisible();
  await expect
    .element(screen.getByRole("article", { name: "Interacted with /root/reviewer" }))
    .toBeVisible();

  const entries = Array.from(document.querySelectorAll<HTMLElement>(".committed-transcript-entry"));
  expect(entries.map((entry) => entry.textContent)).toStrictEqual([
    "Initial prompt",
    "Started /root/reviewer",
    "Working note",
    "Interacted with /root/reviewer",
    "Visible final answer",
  ]);
});

test("renders assistant transcript markdown", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-markdown", [
          agentMessage(
            "agent-markdown",
            [
              "# Heading",
              "",
              "> Quoted text",
              "",
              "- First item",
              "- Second item",
              "",
              "1. First ordered item",
              "2. Second ordered item",
              "",
              "Soft line one",
              "Soft line two",
              "",
              "Use `inline code` here.",
              "",
              "[Allowed link](https://example.invalid/docs)",
              "",
              "```ts",
              'const value: string = "fenced code";',
              "console.log(value);",
              "```",
            ].join("\n"),
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByRole("heading", { name: "Heading" })).toBeVisible();
  await expect.element(screen.getByText("Quoted text")).toBeVisible();
  await expect.element(screen.getByText("First item")).toBeVisible();
  await expect.element(screen.getByText("Second item")).toBeVisible();
  await expect.element(screen.getByText("First ordered item")).toBeVisible();
  await expect.element(screen.getByText("Second ordered item")).toBeVisible();

  const markdown = document.querySelector<HTMLElement>(".committed-transcript-entry-markdown");
  expect(markdown).not.toBeNull();
  if (!markdown) {
    return;
  }

  expect(markdown.querySelector("blockquote")?.textContent).toContain("Quoted text");
  expect(markdown.querySelector("ul")?.textContent).toContain("First item");
  expect(markdown.querySelector("ol")?.textContent).toContain("First ordered item");
  const softBreakParagraph = Array.from(markdown.querySelectorAll("p")).find((paragraph) =>
    paragraph.textContent.includes("Soft line one"),
  );
  expect(softBreakParagraph?.textContent).toContain("Soft line one\nSoft line two");
  expect(softBreakParagraph ? window.getComputedStyle(softBreakParagraph).whiteSpace : null).toBe(
    "pre-wrap",
  );
  const inlineCode = markdown.querySelector("p code");
  expect(inlineCode?.textContent).toContain("inline code");

  const fencedCodeBlock = markdown.querySelector("pre");
  expect(fencedCodeBlock?.textContent).toContain('const value: string = "fenced code";');
  expect(fencedCodeBlock?.textContent).toContain("console.log(value);");
  const fencedCode = fencedCodeBlock?.querySelector<HTMLElement>("code");
  expect(fencedCode).not.toBeNull();
  if (!fencedCode) {
    throw new Error("Expected fenced code element to render");
  }
  expect(fencedCode.className).not.toContain("counter-reset:line");
  const codeLines = Array.from(fencedCode.querySelectorAll<HTMLElement>(":scope > span"));
  expect(codeLines.length).toBeGreaterThanOrEqual(2);
  for (const codeLine of codeLines) {
    expect(codeLine.className).not.toContain("before:content-[counter(line)]");
    expect(window.getComputedStyle(codeLine).display).toBe("block");
  }
  const clipboardWriteAvailable =
    window.isSecureContext &&
    typeof (navigator as Partial<Pick<Navigator, "clipboard">>).clipboard?.writeText === "function";
  const codeCopyButton = markdown.querySelector('[data-streamdown="code-block-copy-button"]');
  expect(codeCopyButton !== null).toBe(clipboardWriteAvailable);

  const allowedLink = markdown.querySelector<HTMLAnchorElement>(
    'a[href="https://example.invalid/docs"]',
  );
  expect(allowedLink).not.toBeNull();
  expect(allowedLink?.textContent).toContain("Allowed link");
});

test("keeps user markdown syntax as plain text", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-user-markdown-literal", [
          userMessage("user-markdown-literal", [textInput("# User heading\n- User item")]),
          agentMessage("agent-user-markdown-literal", "Assistant response"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("# User heading\n- User item")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "User heading" }))
    .not.toBeInTheDocument();
});

test("keeps raw html and images inactive while allowing markdown links", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-markdown-safety", [
          agentMessage(
            "agent-markdown-safety",
            [
              "Before <strong>raw html</strong> and <em>raw emphasis</em> after.",
              "",
              '<a href="https://example.invalid/raw">raw link</a>',
              "",
              "![blocked image](https://example.invalid/image.png)",
              "",
              "[blocked link](https://example.invalid)",
            ].join("\n"),
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText(/Before/)).toBeVisible();
  expect(document.querySelector(".committed-transcript-entry-markdown strong")).toBeNull();
  expect(
    document.querySelector('.committed-transcript-entry-markdown [data-streamdown="strong"]'),
  ).toBeNull();
  expect(document.querySelector(".committed-transcript-entry-markdown em")).toBeNull();
  expect(document.querySelector(".committed-transcript-entry-markdown img")).toBeNull();
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(".committed-transcript-entry-markdown a"),
  );
  expect(links.find((link) => link.textContent === "raw link")).toBeUndefined();
  const allowedLink = links.find((link) => link.textContent === "blocked link");
  expect(allowedLink).not.toBeNull();
  expect(allowedLink?.getAttribute("href")).toContain("https://example.invalid");
  expect(allowedLink?.textContent).toBe("blocked link");
});

test("updates committed message text after snapshot reattach with stable ids", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-reattach", [agentMessage("agent-reattach", "Before reconnect")]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Before reconnect")).toBeVisible();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-reattach", [agentMessage("agent-reattach", "After reconnect")]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Before reconnect")).not.toBeInTheDocument();
  await expect.element(screen.getByText("After reconnect")).toBeVisible();
});

test("renders live assistant text between intermediate updates and final answers", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const attachScrollKey = selectCommittedTranscriptScrollCommitKey(store.getState());
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: turnStarted(eventTurnStarted, "commit-turn-live", inProgressTurn("turn-live")),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-started",
        "turn-live",
        agentMessage("agent-started", "Draft answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Draft answer")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
  await expect.element(screen.getByRole("article", { name: "Turn turn-live" })).toBeVisible();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).not.toBeNull();

  store.dispatch(
    threadRuntimeDeltasAccepted({
      notifications: [
        agentMessageDelta(
          eventAgentMessageDelta,
          "turn-live",
          "agent-started",
          "**Streaming** answer",
        ),
      ],
    }),
  );

  await expect.element(screen.getByText("Streaming")).toBeVisible();
  await expect.element(screen.getByText("answer")).toBeVisible();
  expect(
    document.querySelector(
      '.committed-transcript-live-assistant-message [data-streamdown="strong"]',
    ),
  ).not.toBeNull();
  expect(selectCommittedTranscriptScrollCommitKey(store.getState())).toBe(attachScrollKey);

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-completed",
        "turn-live",
        agentMessage("agent-started", "Final answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Streaming")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Final answer")).toBeVisible();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).toBeNull();
});

test("renders manual reconnect interruption status", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const attach = attachWithTurns(attachBaseline, []);

  store.dispatch(threadRuntimeAttached(attach));
  store.dispatch(
    threadRuntimeManualReconnectRequired({
      reason: "backpressure",
      threadId: attach.snapshot.thread.id,
      subscriptionId: attach.subscriptionId,
    }),
  );

  await expect
    .element(screen.getByText("Connection interrupted. Reconnect required."))
    .toBeVisible();
});

test("renders temporary content forced open until a final answer exists", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-open", [
          agentMessage("agent-commentary-open", "Working before final", "commentary"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Working before final")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 1 item" }))
    .toBeDisabled();
});

test("renders temporary content collapsed beside the final answer once final answer exists", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-collapsed", [
          agentMessage("agent-commentary-collapsed", "Hidden working note", "commentary"),
          agentMessage("agent-final-collapsed", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect.element(screen.getByText("Hidden working note")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 1 item" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Hidden working note")).toBeVisible();
});

test("renders collapsed temporary disclosure without module gap spacing", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-spacing", [
          agentMessage("agent-commentary-spacing", "Hidden spacing note", "commentary"),
          agentMessage("agent-final-spacing", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect.element(screen.getByText("Hidden spacing note")).not.toBeInTheDocument();

  const temporaryModule = document.querySelector<HTMLElement>(
    ".committed-transcript-temporary-module",
  );
  expect(temporaryModule?.classList.contains("gap-2")).toBe(false);
});

test("does not mount collapsed temporary markdown before expansion", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-collapsed-markdown", [
          agentMessage("agent-collapsed-markdown", "# Hidden markdown heading", "commentary"),
          agentMessage("agent-collapsed-markdown-final", "Visible final answer", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect
    .element(screen.getByRole("heading", { name: "Hidden markdown heading" }))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("# Hidden markdown heading")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 1 item" });
  await trigger.click();

  await expect
    .element(screen.getByRole("heading", { name: "Hidden markdown heading" }))
    .toBeVisible();
});

test("renders one collapsed temporary module for a turn split across chunks", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const commentaryMessages = Array.from({ length: 101 }, (_, index) =>
    agentMessage(
      `agent-cross-chunk-commentary-${String(index)}`,
      `Cross chunk working note ${String(index)}`,
      "commentary",
    ),
  );

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-cross-chunk", [
          ...commentaryMessages,
          agentMessage(
            "agent-cross-chunk-final",
            "Visible final answer after chunk boundary",
            "final_answer",
          ),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Visible final answer after chunk boundary")).toBeVisible();
  await expect.element(screen.getByText("Cross chunk working note 0")).not.toBeInTheDocument();

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".committed-transcript-temporary-trigger"),
  );
  expect(triggers.map((trigger) => trigger.textContent)).toStrictEqual([
    "Intermediate updates · 101 items",
  ]);
  expect(triggers.map((trigger) => trigger.classList.contains("button--outline"))).toStrictEqual([
    true,
  ]);
  expect(triggers.map((trigger) => trigger.classList.contains("button--secondary"))).toStrictEqual([
    false,
  ]);

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 101 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Cross chunk working note 0")).toBeVisible();
});

test("renders later user messages inside the intermediate disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-middle-user", [
          userMessage("user-leading-middle", [textInput("Initial prompt")]),
          agentMessage("agent-middle-user-note", "Working note", "commentary"),
          userMessage("user-middle-follow-up", [textInput("Follow-up input")]),
          agentMessage("agent-middle-user-final", "Final response", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Initial prompt")).toBeVisible();
  await expect.element(screen.getByText("Final response")).toBeVisible();
  await expect.element(screen.getByText("Working note")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Follow-up input")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 2 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Working note")).toBeVisible();
  await expect.element(screen.getByText("Follow-up input")).toBeVisible();
});

test("renders multiple final assistant messages outside the intermediate disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-multi-final-surface", [
          userMessage("user-multi-final-surface", [textInput("Prompt")]),
          agentMessage("agent-final-surface-one", "First final", "final_answer"),
          agentMessage("agent-final-surface-two", "Second final", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Prompt")).toBeVisible();
  await expect.element(screen.getByText("First final")).toBeVisible();
  await expect.element(screen.getByText("Second final")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: /Intermediate updates/ }))
    .not.toBeInTheDocument();
});

test("renders legacy assistant messages inside the intermediate disclosure", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-legacy-phase", [
          agentMessage("agent-legacy", "Legacy assistant text", null),
          agentMessage("agent-final-legacy", "Final after legacy", "final_answer"),
        ]),
      ]),
    ),
  );

  await expect.element(screen.getByText("Final after legacy")).toBeVisible();
  await expect.element(screen.getByText("Legacy assistant text")).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 1 item" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  await expect.element(screen.getByText("Legacy assistant text")).toBeVisible();
});
