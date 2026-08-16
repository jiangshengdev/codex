import { expect, test } from "vitest";
import { makeStore } from "@/app/store";
import {
  agentMessage,
  agentMessageDelta,
  attachWithTurns,
  baseTurn,
  collabAgentState,
  collabAgentToolCall,
  failedTurn,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  subAgentActivity,
  textInput,
  turnCompleted,
  turnStarted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  eventAgentMessageDelta,
  eventItemCompleted,
  eventItemStarted,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  threadRuntimeAttached,
  threadRuntimeDeltasAccepted,
  threadRuntimeEventBuffered,
  threadRuntimeManualReconnectRequired,
} from "@/features/threadRuntime/threadRuntimeSlice";
import {
  selectCommittedTranscriptScrollCommitKey,
  selectTranscriptEntry,
  TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  transcriptEntryIdFor,
} from "@/features/transcriptState/transcriptStateSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

const quotaErrorMessage = [
  "unexpected status 403 Forbidden: token quota is not enough, token remain quota: ¥0.064714, need quota: ¥0.072198 (request id: 202608140209338062200938268d9d60dAEpcHp), url:",
  "https://shapi.vip/v1/responses",
].join("\n");

const quotaError = {
  message: quotaErrorMessage,
  codexErrorInfo: "usageLimitExceeded",
  additionalDetails: null,
} satisfies NonNullable<ReturnType<typeof failedTurn>["error"]>;

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

test("renders an attached failed-turn error after the turn content", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-attached-failed-error";

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        failedTurn(turnId, quotaError, [
          userMessage("user-attached-failed-error", [textInput("Use the remaining quota")]),
          agentMessage("agent-attached-failed-error", "Final response before the request failed"),
        ]),
      ]),
    ),
  );

  const turn = screen.getByRole("article", { name: `Turn ${turnId}` });
  const failedStatus = turn.getByText("Failed", { exact: true });
  const finalMessage = turn.getByText("Final response before the request failed", {
    exact: true,
  });
  const errorAlert = turn.getByRole("alert");
  await expect.element(turn).toBeVisible();
  await expect.element(failedStatus).toBeVisible();
  await expect.element(finalMessage).toBeVisible();
  await expect.element(errorAlert).toBeVisible();
  await expect.element(errorAlert.getByText("Request failed", { exact: true })).toBeVisible();
  await expect
    .element(errorAlert.getByText("202608140209338062200938268d9d60dAEpcHp", { exact: false }))
    .toBeVisible();
  await expect
    .element(errorAlert.getByText("https://shapi.vip/v1/responses", { exact: false }))
    .toBeVisible();
  expect(errorAlert.element().textContent).toBe(`Request failed${quotaErrorMessage}`);
  expect(
    failedStatus.element().compareDocumentPosition(finalMessage.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expect(
    finalMessage.element().compareDocumentPosition(errorAlert.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
});

test("renders one error alert for a repeated live error-only turn completion", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-live-error-only";
  const failedNotification = turnCompleted(
    eventTurnCompleted,
    "commit-live-error-only",
    failedTurn(turnId, quotaError),
  );

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(threadRuntimeEventBuffered({ notification: failedNotification, replay: "live" }));
  store.dispatch(threadRuntimeEventBuffered({ notification: failedNotification, replay: "live" }));

  const turn = screen.getByRole("article", { name: `Turn ${turnId}` });
  const errorAlert = turn.getByRole("alert");
  await expect.element(turn).toBeVisible();
  await expect.element(turn.getByText("Failed", { exact: true })).toBeVisible();
  await expect.element(errorAlert).toBeVisible();
  await expect.element(errorAlert.getByText("Request failed", { exact: true })).toBeVisible();
  expect(errorAlert.element().textContent).toBe(`Request failed${quotaErrorMessage}`);
  expect(turn.getByRole("alert").elements()).toHaveLength(1);
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
});

test("renders accessible sub-agent activity and folds it after the final answer", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-sub-agent-activity-surface";
  const startedTitle = "Started agents/browser-starter";
  const spawnedTitle = "Spawned agents/browser-reviewer (gpt-5 high)";
  const interactedTitle = "Interacted with agents/browser-reviewer";
  const interruptedTitle = "Interrupted agents/browser-worker";
  const activityTitles = [
    startedTitle,
    spawnedTitle,
    interactedTitle,
    interactedTitle,
    interruptedTitle,
  ];

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          userMessage("user-sub-agent-activity-surface", [textInput("Inspect activity")]),
          subAgentActivity(
            "activity-sub-agent-started-surface",
            "started",
            "agents/browser-starter",
          ),
          collabAgentToolCall("activity-collab-spawned-surface", "spawnAgent", "completed", {
            receiverThreadIds: ["agents/browser-reviewer"],
            prompt: "Review browser activity",
            model: "gpt-5",
            reasoningEffort: "high",
          }),
          subAgentActivity(
            "activity-sub-agent-interacted-surface",
            "interacted",
            "agents/browser-reviewer",
          ),
          subAgentActivity(
            "activity-sub-agent-interacted-again-surface",
            "interacted",
            "agents/browser-reviewer",
          ),
          subAgentActivity(
            "activity-sub-agent-interrupted-surface",
            "interrupted",
            "agents/browser-worker",
          ),
        ]),
      ]),
    ),
  );

  const startedActivity = screen.getByRole("article", { name: startedTitle });
  const spawnedActivity = screen.getByRole("article", { name: spawnedTitle });
  const interactedActivities = screen.getByRole("article", { name: interactedTitle });
  const interactedActivity = interactedActivities.nth(0);
  const repeatedInteractedActivity = interactedActivities.nth(1);
  const interruptedActivity = screen.getByRole("article", { name: interruptedTitle });
  const activities = [
    startedActivity,
    spawnedActivity,
    interactedActivity,
    repeatedInteractedActivity,
    interruptedActivity,
  ];
  for (const activity of activities) {
    await expect.element(activity).toBeVisible();
    await expect.element(activity).not.toHaveAccessibleDescription();
  }
  for (const [activity, agentPath] of [
    [startedActivity, "agents/browser-starter"],
    [interactedActivity, "agents/browser-reviewer"],
    [repeatedInteractedActivity, "agents/browser-reviewer"],
    [interruptedActivity, "agents/browser-worker"],
  ] as const) {
    const tagGroup = activity.getByRole("grid", { name: agentPath });
    const tag = tagGroup.getByRole("row", { name: agentPath });
    await expect.element(tagGroup).toBeVisible();
    await expect.element(tag).toBeVisible();
    await expect.element(tag).toHaveTextContent(agentPath);
    await expect.element(tag).toHaveAttribute("tabindex", "0");
    await expect.element(tag).not.toHaveAttribute("aria-selected");
    await expect.element(tagGroup.getByRole("button")).not.toBeInTheDocument();
    await expect.element(tagGroup.getByRole("link")).not.toBeInTheDocument();
  }
  await expect
    .element(spawnedActivity.getByRole("grid", { name: "agents/browser-reviewer" }))
    .not.toBeInTheDocument();
  const activityGroup = startedActivity
    .element()
    .closest<HTMLElement>(".committed-transcript-activity-group");
  expect(activityGroup).not.toBeNull();
  expect(activityGroup?.classList.contains("card--default")).toBe(true);
  expect(activityGroup?.classList.contains("card--transparent")).toBe(false);
  expect(activityGroup?.firstElementChild?.classList.contains("gap-2")).toBe(true);
  expect(
    activities.every(
      (activity) =>
        activity.element().closest(".committed-transcript-activity-group") === activityGroup,
    ),
  ).toBe(true);
  expect(activities.every((activity) => activity.element().classList.contains("gap-2"))).toBe(true);
  expect(activityGroup?.textContent).not.toMatch(/[•└`]/u);
  await expect.element(spawnedActivity.getByText("Review browser activity")).toBeVisible();
  for (const activity of [
    startedActivity,
    interactedActivity,
    repeatedInteractedActivity,
    interruptedActivity,
  ]) {
    await expect.element(activity.getByText("Review browser activity")).not.toBeInTheDocument();
  }
  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 5 items" }))
    .toBeDisabled();

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-sub-agent-surface-final",
        turnId,
        agentMessage("agent-sub-agent-surface-final", "Visible final answer", "final_answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  for (const activity of activities) {
    await expect.element(activity).not.toBeInTheDocument();
  }

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 5 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  const turnEntries = screen.getByRole("article", { name: `Turn ${turnId}` }).getByRole("article");
  for (const [index, title] of activityTitles.entries()) {
    await expect.element(turnEntries.nth(index + 1)).toHaveAccessibleName(title);
  }
});

test("separates activity groups around middle messages", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-activity-message-boundary";
  const beforeTitle = "Started agents/before-message";
  const afterTitle = "Closed agents/after-message";

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          subAgentActivity("activity-before-message", "started", "agents/before-message"),
          agentMessage("agent-activity-boundary", "Activity boundary message", "commentary"),
          collabAgentToolCall("activity-after-message", "closeAgent", "completed", {
            receiverThreadIds: ["agents/after-message"],
          }),
        ]),
      ]),
    ),
  );

  const before = screen.getByRole("article", { name: beforeTitle });
  const boundary = screen.getByText("Activity boundary message");
  const after = screen.getByRole("article", { name: afterTitle });
  await expect.element(before).toBeVisible();
  await expect.element(boundary).toBeVisible();
  await expect.element(after).toBeVisible();

  const beforeGroup = before.element().closest(".committed-transcript-activity-group");
  const afterGroup = after.element().closest(".committed-transcript-activity-group");
  expect(beforeGroup).not.toBeNull();
  expect(afterGroup).not.toBeNull();
  expect(beforeGroup).not.toBe(afterGroup);
  expect(
    boundary.element().closest("article")?.closest(".committed-transcript-activity-group"),
  ).toBeNull();

  const entries = screen.getByRole("article", { name: `Turn ${turnId}` }).getByRole("article");
  await expect.element(entries.nth(0)).toHaveAccessibleName(beforeTitle);
  await expect.element(entries.nth(1)).toHaveTextContent("Activity boundary message");
  await expect.element(entries.nth(2)).toHaveAccessibleName(afterTitle);
});

test("separates activity groups around middle status entries", async () => {
  const turnId = "turn-activity-status-boundary";
  const chunkId = `${turnId}:chunk:0`;
  const beforeTitle = "Started agents/before-status";
  const afterTitle = "Interrupted agents/after-status";
  const sourceStore = makeStore();
  sourceStore.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          subAgentActivity("activity-before-status", "started", "agents/before-status"),
          subAgentActivity("activity-after-status", "interrupted", "agents/after-status"),
        ]),
      ]),
    ),
  );

  const transcriptState = structuredClone(sourceStore.getState().transcriptState);
  const chunk = transcriptState.chunksById[chunkId];
  const turn = transcriptState.turnsById[turnId];
  if (chunk == null || turn == null) {
    throw new Error("Expected the activity fixture to create one transcript chunk");
  }
  const statusEntryId = transcriptEntryIdFor(turnId, "status-activity-boundary");
  chunk.entryIds.splice(1, 0, statusEntryId);
  transcriptState.entriesById[statusEntryId] = {
    type: "status",
    id: "status-activity-boundary",
    turnId,
    status: "interrupted",
    revision: 0,
  };
  transcriptState.entryChunkById[statusEntryId] = chunkId;
  turn.middleEntryCount += 1;

  const screen = await renderWithProviders(<CommittedTranscriptSurface />, {
    store: makeStore({ transcriptState }),
  });
  const before = screen.getByRole("article", { name: beforeTitle });
  const status = screen.getByText("Interrupted.");
  const after = screen.getByRole("article", { name: afterTitle });
  await expect.element(before).toBeVisible();
  await expect.element(status).toBeVisible();
  await expect.element(after).toBeVisible();

  const beforeGroup = before.element().closest(".committed-transcript-activity-group");
  const afterGroup = after.element().closest(".committed-transcript-activity-group");
  expect(beforeGroup).not.toBeNull();
  expect(afterGroup).not.toBeNull();
  expect(beforeGroup).not.toBe(afterGroup);
  expect(
    status.element().closest("article")?.closest(".committed-transcript-activity-group"),
  ).toBeNull();

  const entries = screen.getByRole("article", { name: `Turn ${turnId}` }).getByRole("article");
  await expect.element(entries.nth(0)).toHaveAccessibleName(beforeTitle);
  await expect.element(entries.nth(1)).toHaveTextContent("Interrupted.");
  await expect.element(entries.nth(2)).toHaveAccessibleName(afterTitle);
});

test("renders terminal collab activity accessibly and restores its order after expansion", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-collab-activity-surface";
  const spawnTitle = "Spawned agent-builder (gpt-5 high)";
  const closeTitle = "Closed agent-reviewer";

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          userMessage("user-collab-surface", [textInput("Delegate work")]),
          collabAgentToolCall("collab-spawn-surface", "spawnAgent", "completed", {
            receiverThreadIds: ["agent-builder"],
            prompt: "Build the feature",
            model: "gpt-5",
            reasoningEffort: "high",
          }),
          collabAgentToolCall("collab-close-surface", "closeAgent", "failed", {
            receiverThreadIds: ["agent-reviewer"],
          }),
        ]),
      ]),
    ),
  );

  const spawn = screen.getByRole("article", { name: spawnTitle });
  const close = screen.getByRole("article", { name: closeTitle });
  await expect.element(spawn).toBeVisible();
  await expect.element(close).toBeVisible();
  await expect.element(close).not.toHaveAccessibleDescription();
  const title = spawn.getByText(spawnTitle).element();
  const detail = spawn.getByText("Build the feature").element();
  expect(title.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  for (const activity of [spawn, close]) {
    expect(
      activity
        .element()
        .querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).toHaveLength(0);
  }

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-collab-surface-final",
        turnId,
        agentMessage("agent-collab-surface-final", "Visible final answer", "final_answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect.element(spawn).not.toBeInTheDocument();
  await expect.element(close).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Intermediate updates · 2 items" });
  await trigger.click();
  const entries = screen.getByRole("article", { name: `Turn ${turnId}` }).getByRole("article");
  await expect.element(entries.nth(1)).toHaveAccessibleName(spawnTitle);
  await expect.element(entries.nth(2)).toHaveAccessibleName(closeTitle);
});

test("localizes transcript copy without rebuilding semantic activity views", async () => {
  const turnId = "turn-locale-surface";
  const activityId = "activity-locale-surface";
  const interactedActivityId = "activity-interacted-locale-surface";
  const waitId = "collab-wait-locale-surface";
  const agentPath = "agents/locale-worker";
  const agentThreadId = "thread-locale-worker";
  const rawMessage = "Server completion message stays raw";
  const store = makeStore();

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          subAgentActivity(activityId, "started", agentPath),
          subAgentActivity(interactedActivityId, "interacted", agentPath),
          collabAgentToolCall(waitId, "wait", "completed", {
            agentsStates: {
              [agentThreadId]: collabAgentState("completed", rawMessage),
            },
          }),
        ]),
      ]),
    ),
  );

  const waitEntryId = transcriptEntryIdFor(turnId, waitId);
  const semanticView = selectTranscriptEntry(store.getState(), waitEntryId);
  expect(semanticView).not.toBeNull();

  const englishScreen = await renderWithProviders(<CommittedTranscriptSurface />, { store });
  const englishRegion = englishScreen.getByRole("region", { name: "Committed transcript" });
  const englishTurn = englishRegion.getByRole("article", { name: `Turn ${turnId}` });

  await expect.element(englishRegion).toBeVisible();
  await expect.element(englishTurn).toHaveTextContent("Completed");
  await expect
    .element(englishTurn.getByRole("button", { name: "Intermediate updates · 3 items" }))
    .toBeDisabled();
  const englishStartedActivity = englishTurn.getByRole("article", {
    name: `Started ${agentPath}`,
  });
  const englishAgentTag = englishStartedActivity
    .getByRole("grid", { name: agentPath })
    .getByRole("row", { name: agentPath });
  await expect.element(englishStartedActivity).toBeVisible();
  await expect.element(englishAgentTag).toBeVisible();
  expect(englishStartedActivity.element().textContent).toBe(`Started ${agentPath}`);
  const englishInteractedActivity = englishTurn.getByRole("article", {
    name: `Interacted with ${agentPath}`,
  });
  const englishInteractedAgentTag = englishInteractedActivity
    .getByRole("grid", { name: agentPath })
    .getByRole("row", { name: agentPath });
  await expect.element(englishInteractedActivity).toBeVisible();
  await expect.element(englishInteractedAgentTag).toBeVisible();
  expect(englishInteractedActivity.element().textContent).toBe(`Interacted with ${agentPath}`);
  await expect
    .element(englishTurn.getByRole("article", { name: "Finished waiting" }))
    .toHaveTextContent(`${agentThreadId}: Completed - ${rawMessage}`);

  await englishScreen.unmount();

  const chineseScreen = await renderWithProviders(<CommittedTranscriptSurface />, {
    locale: "zh-CN",
    store,
  });
  const chineseRegion = chineseScreen.getByRole("region", { name: "已提交的对话记录" });
  const chineseTurn = chineseRegion.getByRole("article", { name: `轮次 ${turnId}` });

  await expect.element(chineseRegion).toBeVisible();
  await expect.element(chineseTurn).toHaveTextContent("已完成");
  await expect.element(chineseTurn.getByRole("button", { name: "中间更新 · 3 项" })).toBeDisabled();
  const chineseStartedActivity = chineseTurn.getByRole("article", {
    name: `已启动 ${agentPath}`,
  });
  const chineseAgentTag = chineseStartedActivity
    .getByRole("grid", { name: agentPath })
    .getByRole("row", { name: agentPath });
  await expect.element(chineseStartedActivity).toBeVisible();
  await expect.element(chineseAgentTag).toBeVisible();
  expect(chineseStartedActivity.element().textContent).toBe(`已启动${agentPath}`);
  const chineseInteractedActivity = chineseTurn.getByRole("article", {
    name: `已与 ${agentPath} 交互`,
  });
  const chineseInteractedAgentTag = chineseInteractedActivity
    .getByRole("grid", { name: agentPath })
    .getByRole("row", { name: agentPath });
  await expect.element(chineseInteractedActivity).toBeVisible();
  await expect.element(chineseInteractedAgentTag).toBeVisible();
  expect(chineseInteractedActivity.element().textContent).toBe(`已与${agentPath}交互`);
  await expect
    .element(chineseTurn.getByRole("article", { name: "等待结束" }))
    .toHaveTextContent(`${agentThreadId}：已完成：${rawMessage}`);

  expect(selectTranscriptEntry(store.getState(), waitEntryId)).toBe(semanticView);
});

test("settles one started wait article in place across intermediate disclosure states", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-started-wait-surface";
  const itemId = "collab-started-wait-surface";

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemStarted(
        eventItemStarted,
        "commit-started-wait-surface",
        turnId,
        collabAgentToolCall(itemId, "wait", "inProgress"),
      ),
      replay: "live",
    }),
  );

  const turn = screen.getByRole("article", { name: `Turn ${turnId}` });
  const activity = turn.getByRole("article", { name: /Waiting for agents|Finished waiting/ });
  await expect.element(activity).toHaveAccessibleName("Waiting for agents");
  await expect
    .element(turn.getByRole("button", { name: "Intermediate updates · 1 item" }))
    .toBeDisabled();

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-between-started-wait",
        turnId,
        agentMessage("agent-between-started-wait", "Between activity", "commentary"),
      ),
      replay: "live",
    }),
  );
  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-terminal-wait-surface",
        turnId,
        collabAgentToolCall(itemId, "wait", "completed"),
      ),
      replay: "live",
    }),
  );

  await expect.element(activity).toHaveAccessibleName("Finished waiting");
  await expect.element(activity.getByText("No agents completed yet")).toBeVisible();
  await expect
    .element(turn.getByRole("article", { name: /Waiting|Finished/ }).nth(1))
    .not.toBeInTheDocument();

  store.dispatch(
    threadRuntimeEventBuffered({
      notification: itemCompleted(
        eventItemCompleted,
        "commit-final-started-wait",
        turnId,
        agentMessage("agent-final-started-wait", "Final after wait", "final_answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Final after wait")).toBeVisible();
  await expect.element(activity).not.toBeInTheDocument();
  const trigger = turn.getByRole("button", { name: "Intermediate updates · 2 items" });
  await trigger.click();
  const entries = turn.getByRole("article");
  await expect.element(entries.nth(0)).toHaveAccessibleName("Finished waiting");
  await expect.element(entries.nth(1)).toHaveTextContent("Between activity");
});

test("keeps same raw item ids isolated between turns", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-shared-item-first", [
          agentMessage("agent-shared-item", "First turn payload", "commentary"),
        ]),
        baseTurn("turn-shared-item-second", [
          agentMessage("agent-shared-item", "Second turn payload", "commentary"),
        ]),
      ]),
    ),
  );

  const firstTurn = screen.getByRole("article", { name: "Turn turn-shared-item-first" });
  const secondTurn = screen.getByRole("article", { name: "Turn turn-shared-item-second" });

  await expect.element(firstTurn.getByText("First turn payload")).toBeVisible();
  await expect.element(firstTurn.getByText("Second turn payload")).not.toBeInTheDocument();
  await expect.element(secondTurn.getByText("Second turn payload")).toBeVisible();
  await expect.element(secondTurn.getByText("First turn payload")).not.toBeInTheDocument();
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
        agentMessage("agent-started", "Draft answer", "final_answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Draft answer")).not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
  await expect
    .element(screen.getByRole("article", { name: "Turn turn-live" }))
    .not.toBeInTheDocument();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).toBeNull();

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
  await expect.element(screen.getByText("No committed messages yet.")).not.toBeInTheDocument();
  const turn = screen.getByRole("article", { name: "Turn turn-live" });
  await expect.element(turn).toBeVisible();
  await expect
    .element(turn.getByRole("button", { name: /Intermediate updates/ }))
    .not.toBeInTheDocument();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).not.toBeNull();
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
        agentMessage("agent-started", "Final answer", "final_answer"),
      ),
      replay: "live",
    }),
  );

  await expect.element(screen.getByText("Streaming")).not.toBeInTheDocument();
  await expect.element(screen.getByText("Final answer")).toBeVisible();
  await expect
    .element(turn.getByRole("button", { name: /Intermediate updates/ }))
    .not.toBeInTheDocument();
  expect(document.querySelector(".committed-transcript-live-assistant-message")).toBeNull();
});

test("keeps middle message order stable while live messages settle out of order", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  const turn = screen.getByRole("article", { name: "Turn turn-middle-order" });
  const messages = turn.getByRole("article");
  const startLiveMessage = (itemId: string) => {
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemStarted(
          eventItemStarted,
          `commit-middle-order-start-${itemId}`,
          "turn-middle-order",
          agentMessage(itemId, "", "commentary"),
        ),
        replay: "live",
      }),
    );
  };
  const appendLiveMessageDelta = (itemId: string, source: string) => {
    store.dispatch(
      threadRuntimeDeltasAccepted({
        notifications: [
          agentMessageDelta(eventAgentMessageDelta, "turn-middle-order", itemId, source),
        ],
      }),
    );
  };
  const completeMessage = (itemId: string, source: string) => {
    store.dispatch(
      threadRuntimeEventBuffered({
        notification: itemCompleted(
          eventItemCompleted,
          `commit-middle-order-complete-${itemId}`,
          "turn-middle-order",
          agentMessage(itemId, source, "commentary"),
        ),
        replay: "live",
      }),
    );
  };
  const expectMessageOrder = async (sources: string[]) => {
    for (const [index, source] of sources.entries()) {
      await expect.element(messages.nth(index)).toHaveTextContent(source);
    }
    await expect.element(messages.nth(sources.length)).not.toBeInTheDocument();
  };

  startLiveMessage("agent-middle-order-a");
  startLiveMessage("agent-middle-order-b");
  await expect.element(turn).not.toBeInTheDocument();

  appendLiveMessageDelta("agent-middle-order-b", "Live B");
  await expectMessageOrder(["Live B"]);

  appendLiveMessageDelta("agent-middle-order-a", "Live A");
  await expectMessageOrder(["Live A", "Live B"]);

  completeMessage("agent-middle-order-b", "Committed B");
  await expectMessageOrder(["Live A", "Committed B"]);

  completeMessage("agent-middle-order-a", "Committed A");
  await expectMessageOrder(["Committed A", "Committed B"]);
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
  const activityItems = Array.from(
    { length: TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1 },
    (_, index) =>
      subAgentActivity(
        `activity-cross-chunk-${String(index)}`,
        "started",
        `agents/cross-chunk-${String(index)}`,
      ),
  );
  const firstActivityTitle = "Started agents/cross-chunk-0";
  const lastActivityTitle = `Started agents/cross-chunk-${String(
    TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
  )}`;

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-temporary-cross-chunk", [
          ...activityItems,
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
  await expect
    .element(screen.getByRole("article", { name: firstActivityTitle }))
    .not.toBeInTheDocument();

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".committed-transcript-temporary-trigger"),
  );
  expect(triggers.map((trigger) => trigger.textContent)).toStrictEqual([
    `Intermediate updates · ${String(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1)} items`,
  ]);
  expect(triggers.map((trigger) => trigger.classList.contains("button--outline"))).toStrictEqual([
    true,
  ]);
  expect(triggers.map((trigger) => trigger.classList.contains("button--secondary"))).toStrictEqual([
    false,
  ]);

  const trigger = screen.getByRole("button", {
    name: `Intermediate updates · ${String(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1)} items`,
  });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  const firstActivity = screen.getByRole("article", { name: firstActivityTitle });
  const lastActivity = screen.getByRole("article", { name: lastActivityTitle });
  await expect.element(firstActivity).toBeVisible();
  await expect.element(lastActivity).toBeVisible();
  const activityGroups = Array.from(
    document.querySelectorAll<HTMLElement>(".committed-transcript-activity-group"),
  );
  expect(activityGroups).toHaveLength(2);
  expect(activityGroups.map((group) => group.querySelectorAll("article").length)).toStrictEqual([
    TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT,
    1,
  ]);
  expect(firstActivity.element().closest(".committed-transcript-activity-group")).toBe(
    activityGroups[0],
  );
  expect(lastActivity.element().closest(".committed-transcript-activity-group")).toBe(
    activityGroups[1],
  );
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
