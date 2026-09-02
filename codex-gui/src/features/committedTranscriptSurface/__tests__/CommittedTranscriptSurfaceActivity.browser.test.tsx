import { expect, test } from "vitest";
import { makeStore } from "@/app/store";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedQueueFact,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjection";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  collabAgentState,
  collabAgentToolCall,
  itemCompleted,
  itemStarted,
  subAgentActivity,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  selectTranscriptEntry,
  transcriptEntryIdFor,
} from "@/features/transcriptState/transcriptStateSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedQueueFact) =>
  readModelAction({ type: "eventAccepted", payload });

test.each([
  [
    "started",
    "/root/desktop_context_usage",
    "Desktop context usage",
    "Started Desktop context usage",
  ],
  [
    "interacted",
    "/root/gui_composer_surface",
    "Gui composer surface",
    "Interacted with Gui composer surface",
  ],
  ["interrupted", "/root/gui_usage_ingress", "Gui usage ingress", "Interrupted Gui usage ingress"],
  ["completed", "/root/gui_test_run", "Gui test run", "Completed Gui test run"],
] as const)(
  "formats the %s sub-agent activity action",
  async (kind, agentPath, taskName, accessibleName) => {
    const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

    store.dispatch(
      threadRuntimeAttached(
        attachWithTurns(attachBaseline, [
          baseTurn(`turn-sub-agent-${kind}`, [
            subAgentActivity(`activity-sub-agent-${kind}`, kind, agentPath),
          ]),
        ]),
      ),
    );

    const activity = screen.getByRole("article", { name: accessibleName, exact: true });
    await expect.element(activity).toBeVisible();
    await expect.element(activity.getByText(taskName, { exact: true })).toBeVisible();
    await expect.element(screen.getByText("Updated", { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByText("已更新", { exact: true })).not.toBeInTheDocument();
  },
);

test.each([1, 2, 3, 4])("aggregates %s adjacent started activities in order", async (count) => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const labels = ["Agent a", "Agent b", "Agent c", "Agent d"];
  const visibleLabels = labels.slice(0, Math.min(count, 3));
  const omittedCount = Math.max(0, count - 3);
  const accessibleName = [
    "Started",
    ...visibleLabels,
    ...(omittedCount === 0 ? [] : [`and ${String(omittedCount)} more sub-agent`]),
  ].join(" ");

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(
          `turn-adjacent-started-${String(count)}`,
          labels
            .slice(0, count)
            .map((_, index) =>
              subAgentActivity(
                `activity-adjacent-started-${String(count)}-${String(index)}`,
                "started",
                `/root/agent_${String.fromCharCode(97 + index)}`,
                { agentThreadId: `thread-${String(index)}` },
              ),
            ),
        ),
      ]),
    ),
  );

  const activity = screen.getByRole("article", { name: accessibleName, exact: true });
  await expect.element(activity).toBeVisible();
  for (const label of visibleLabels) {
    await expect.element(activity.getByText(label, { exact: true })).toBeVisible();
  }
  for (const omittedLabel of labels.slice(3, count)) {
    await expect.element(screen.getByText(omittedLabel, { exact: true })).not.toBeInTheDocument();
  }
  const visibleElements = visibleLabels.map((label) =>
    activity.getByText(label, { exact: true }).element(),
  );
  for (let index = 1; index < visibleElements.length; index += 1) {
    const previous = visibleElements[index - 1];
    const next = visibleElements[index];
    if (previous == null || next == null) {
      throw new Error("Expected visible sub-agent labels to preserve activity order");
    }
    expect(previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  }
});

test("keeps started and completed rows separate and limits completed chips", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-started-completed-row-boundary";

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          subAgentActivity("activity-started", "started", "/root/starter"),
          ...["a", "b", "c", "d"].map((agentName) =>
            subAgentActivity(
              `activity-completed-${agentName}`,
              "completed",
              `/root/agent_${agentName}`,
            ),
          ),
        ]),
      ]),
    ),
  );

  const turn = screen.getByRole("article", { name: `Turn ${turnId}`, exact: true });
  const startedActivity = turn.getByRole("article", { name: "Started Starter", exact: true });
  const completedActivity = turn.getByRole("article", {
    name: "Completed Agent a Agent b Agent c and 1 more sub-agent",
    exact: true,
  });
  await expect.element(startedActivity).toBeVisible();
  await expect.element(completedActivity).toBeVisible();
  for (const label of ["Agent a", "Agent b", "Agent c"]) {
    await expect.element(completedActivity.getByText(label, { exact: true })).toBeVisible();
  }
  await expect.element(turn.getByText("Agent d", { exact: true })).not.toBeInTheDocument();
  expect(
    startedActivity.element().compareDocumentPosition(completedActivity.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
});

test("localizes completed sub-agent activity with an omitted count", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />, {
    locale: "zh-CN",
  });

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(
          "turn-omitted-completed-zh-cn",
          ["a", "b", "c", "d"].map((agentName) =>
            subAgentActivity(
              `activity-omitted-completed-${agentName}`,
              "completed",
              `/root/${agentName}`,
            ),
          ),
        ),
      ]),
    ),
  );

  const activity = screen.getByRole("article", {
    name: "以下子代理已完成工作： A B C 及其他 1 个子代理",
    exact: true,
  });
  await expect.element(activity).toBeVisible();
  for (const visibleAgent of ["A", "B", "C"]) {
    await expect.element(activity.getByText(visibleAgent, { exact: true })).toBeVisible();
  }
  await expect.element(screen.getByText("D", { exact: true })).not.toBeInTheDocument();
});

test("localizes omitted interacted sub-agent activity in natural order", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />, {
    locale: "zh-CN",
  });

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(
          "turn-omitted-interacted-zh-cn",
          ["a", "b", "c", "d"].map((agentName) =>
            subAgentActivity(
              `activity-omitted-interacted-${agentName}`,
              "interacted",
              `/root/${agentName}`,
            ),
          ),
        ),
      ]),
    ),
  );

  const activity = screen.getByRole("article", {
    name: "已与 A B C 及其他 1 个子代理交互",
    exact: true,
  });
  await expect.element(activity).toBeVisible();
  for (const visibleAgent of ["A", "B", "C"]) {
    await expect.element(activity.getByText(visibleAgent, { exact: true })).toBeVisible();
  }
  await expect.element(screen.getByText("D", { exact: true })).not.toBeInTheDocument();
});

test("keeps repeated paths and disambiguates colliding leaves with the shortest parent", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-sub-agent-labels", [
          subAgentActivity("activity-repeat-a", "started", "/root/shared_worker", {
            agentThreadId: "thread-repeat",
          }),
          subAgentActivity("activity-repeat-b", "started", "/root/shared_worker", {
            agentThreadId: "thread-repeat",
          }),
          subAgentActivity("activity-backend", "interacted", "/root/backend/validation", {
            agentThreadId: "thread-backend",
          }),
          subAgentActivity("activity-frontend", "interacted", "/root/frontend/validation", {
            agentThreadId: "thread-frontend",
          }),
        ]),
      ]),
    ),
  );

  const repeated = screen.getByRole("article", {
    name: "Started Shared worker Shared worker",
    exact: true,
  });
  await expect.element(repeated).toBeVisible();
  expect(repeated.getByText("Shared worker", { exact: true }).elements()).toHaveLength(2);

  const disambiguated = screen.getByRole("article", {
    name: "Interacted with Backend / Validation Frontend / Validation",
    exact: true,
  });
  await expect.element(disambiguated).toBeVisible();
  await expect
    .element(disambiguated.getByText("Backend / Validation", { exact: true }))
    .toBeVisible();
  await expect
    .element(disambiguated.getByText("Frontend / Validation", { exact: true }))
    .toBeVisible();
});

test("breaks sub-agent rows on a different kind and collab activity", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-sub-agent-row-boundaries";

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          subAgentActivity("activity-start-a", "started", "/root/agent_a"),
          subAgentActivity("activity-start-b", "started", "/root/agent_b"),
          subAgentActivity("activity-interact-c", "interacted", "/root/agent_c"),
          subAgentActivity("activity-start-d", "started", "/root/agent_d"),
          collabAgentToolCall("activity-collab-boundary", "spawnAgent", "completed", {
            receiverThreadIds: ["agent-boundary"],
          }),
          subAgentActivity("activity-start-e", "started", "/root/agent_e"),
          subAgentActivity("activity-start-f", "started", "/root/agent_f"),
        ]),
      ]),
    ),
  );

  const expectedNames = [
    "Started Agent a Agent b",
    "Interacted with Agent c",
    "Started Agent d",
    "Spawned agent-boundary",
    "Started Agent e Agent f",
  ];
  const turn = screen.getByRole("article", { name: `Turn ${turnId}`, exact: true });
  const entryLocators = expectedNames.map((name) =>
    turn.getByRole("article", { name, exact: true }),
  );
  for (const entry of entryLocators) {
    await expect.element(entry).toBeVisible();
  }
  const entries = entryLocators.map((entry) => entry.element());
  for (let index = 1; index < entries.length; index += 1) {
    const previous = entries[index - 1];
    const next = entries[index];
    if (previous == null || next == null) {
      throw new Error("Expected every activity boundary row to exist");
    }
    expect(previous.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  }
});

test("renders non-interactive aggregated sub-agent activity and folds it after the final answer", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-sub-agent-activity-surface";
  const startedTitle = "Started Browser starter";
  const spawnedTitle = "Spawned agents/browser-reviewer (gpt-5 high)";
  const interactedTitle = "Interacted with Browser reviewer Browser reviewer";
  const interruptedTitle = "Interrupted Browser worker";
  const completedTitle = "Completed Browser finisher";
  const activityTitles = [
    startedTitle,
    spawnedTitle,
    interactedTitle,
    interruptedTitle,
    completedTitle,
  ];

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          userMessage("user-sub-agent-activity-surface", [textInput("Inspect activity")]),
          subAgentActivity(
            "activity-sub-agent-started-surface",
            "started",
            "/root/browser_starter",
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
            "/root/browser_reviewer",
          ),
          subAgentActivity(
            "activity-sub-agent-interacted-again-surface",
            "interacted",
            "/root/browser_reviewer",
          ),
          subAgentActivity(
            "activity-sub-agent-interrupted-surface",
            "interrupted",
            "/root/browser_worker",
          ),
          subAgentActivity(
            "activity-sub-agent-completed-surface",
            "completed",
            "/root/browser_finisher",
          ),
        ]),
      ]),
    ),
  );

  const startedActivity = screen.getByRole("article", { name: startedTitle, exact: true });
  const spawnedActivity = screen.getByRole("article", { name: spawnedTitle, exact: true });
  const interactedActivity = screen.getByRole("article", { name: interactedTitle, exact: true });
  const interruptedActivity = screen.getByRole("article", {
    name: interruptedTitle,
    exact: true,
  });
  const completedActivity = screen.getByRole("article", {
    name: completedTitle,
    exact: true,
  });
  const activities = [
    startedActivity,
    spawnedActivity,
    interactedActivity,
    interruptedActivity,
    completedActivity,
  ];
  for (const activity of activities) {
    await expect.element(activity).toBeVisible();
    await expect.element(activity).not.toHaveAccessibleDescription();
    await expect.element(activity).not.toHaveAttribute("aria-selected");
    await expect.element(activity).not.toHaveAttribute("tabindex");
    await expect.element(activity.getByRole("button")).not.toBeInTheDocument();
    await expect.element(activity.getByRole("grid")).not.toBeInTheDocument();
    await expect.element(activity.getByRole("link")).not.toBeInTheDocument();
    await expect.element(activity.getByRole("row")).not.toBeInTheDocument();
    expect(
      activity
        .element()
        .querySelectorAll(
          'a, button, input, select, textarea, [role="grid"], [role="row"], [aria-selected], [tabindex]',
        ),
    ).toHaveLength(0);
  }
  await expect.element(startedActivity.getByText("Browser starter", { exact: true })).toBeVisible();
  expect(interactedActivity.getByText("Browser reviewer", { exact: true }).elements()).toHaveLength(
    2,
  );
  await expect
    .element(interruptedActivity.getByText("Browser worker", { exact: true }))
    .toBeVisible();
  await expect
    .element(completedActivity.getByText("Browser finisher", { exact: true }))
    .toBeVisible();
  await expect.element(spawnedActivity.getByText("Review browser activity")).toBeVisible();
  for (const activity of [startedActivity, interactedActivity, interruptedActivity]) {
    await expect.element(activity.getByText("Review browser activity")).not.toBeInTheDocument();
  }
  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 6 items" }))
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

  const trigger = screen.getByRole("button", { name: "Intermediate updates · 6 items" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  const turnEntries = screen
    .getByRole("article", { name: `Turn ${turnId}`, exact: true })
    .getByRole("article");
  for (const [index, title] of activityTitles.entries()) {
    await expect.element(turnEntries.nth(index + 1)).toHaveAccessibleName(title);
  }
});

test("separates activity groups around middle messages", async () => {
  const { store, ...screen } = await renderWithProviders(<CommittedTranscriptSurface />);
  const turnId = "turn-activity-message-boundary";
  const beforeTitle = "Started Before message";
  const afterTitle = "Closed agents/after-message";

  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          subAgentActivity("activity-before-message", "started", "/root/before_message"),
          agentMessage("agent-activity-boundary", "Activity boundary message", "commentary"),
          collabAgentToolCall("activity-after-message", "closeAgent", "completed", {
            receiverThreadIds: ["agents/after-message"],
          }),
        ]),
      ]),
    ),
  );

  const before = screen.getByRole("article", { name: beforeTitle, exact: true });
  const boundary = screen.getByText("Activity boundary message");
  const after = screen.getByRole("article", { name: afterTitle, exact: true });
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
  const beforeTitle = "Started Before status";
  const afterTitle = "Interrupted After status";
  const sourceStore = makeStore();
  sourceStore.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn(turnId, [
          subAgentActivity("activity-before-status", "started", "/root/before_status"),
          subAgentActivity("activity-after-status", "interrupted", "/root/after_status"),
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
  const before = screen.getByRole("article", { name: beforeTitle, exact: true });
  const status = screen.getByText("Interrupted.");
  const after = screen.getByRole("article", { name: afterTitle, exact: true });
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
  const agentPath = "/root/locale_worker";
  const agentLabel = "Locale worker";
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
    name: `Started ${agentLabel}`,
    exact: true,
  });
  await expect.element(englishStartedActivity).toBeVisible();
  await expect.element(englishStartedActivity.getByText(agentLabel, { exact: true })).toBeVisible();
  await expect.element(englishStartedActivity).toHaveTextContent(`Started ${agentLabel}`);
  const englishInteractedActivity = englishTurn.getByRole("article", {
    name: `Interacted with ${agentLabel}`,
    exact: true,
  });
  await expect.element(englishInteractedActivity).toBeVisible();
  await expect
    .element(englishInteractedActivity.getByText(agentLabel, { exact: true }))
    .toBeVisible();
  await expect
    .element(englishInteractedActivity)
    .toHaveTextContent(`Interacted with ${agentLabel}`);
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
    name: `已启动 ${agentLabel}`,
    exact: true,
  });
  await expect.element(chineseStartedActivity).toBeVisible();
  await expect.element(chineseStartedActivity.getByText(agentLabel, { exact: true })).toBeVisible();
  await expect.element(chineseStartedActivity).toHaveTextContent(`已启动 ${agentLabel}`);
  const chineseInteractedActivity = chineseTurn.getByRole("article", {
    name: `已与 ${agentLabel} 交互`,
    exact: true,
  });
  await expect.element(chineseInteractedActivity).toBeVisible();
  await expect
    .element(chineseInteractedActivity.getByText(agentLabel, { exact: true }))
    .toBeVisible();
  await expect.element(chineseInteractedActivity).toHaveTextContent(`已与 ${agentLabel} 交互`);
  await expect.element(chineseScreen.getByText("已更新", { exact: true })).not.toBeInTheDocument();
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
