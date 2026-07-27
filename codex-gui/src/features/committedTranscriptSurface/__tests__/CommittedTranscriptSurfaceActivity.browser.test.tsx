import { setupI18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { expect, test } from "vitest";
import {
  agentMessage,
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
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  selectTranscriptChunk,
  selectTranscriptEntry,
} from "@/features/transcriptState/transcriptStateSlice";
import {
  threadRuntimeAttached,
  threadRuntimeEventBuffered,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

const activityMessages: Messages = {
  Q3Ocvq: "已启动 {agentPath}",
  "Uoq-j_": "已启动 {receiver}（{model} {reasoningEffort}）",
};

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

test("retranslates semantic activity without changing state and preserves spawn suffix rules", async () => {
  const activityI18n = setupI18n();
  activityI18n.loadAndActivate({ locale: "en", messages: {} });
  const { store, ...screen } = await renderWithProviders(
    <I18nProvider i18n={activityI18n}>
      <button
        type="button"
        onClick={() => {
          activityI18n.loadAndActivate({ locale: "zh-CN", messages: activityMessages });
        }}
      >
        Switch activity locale
      </button>
      <CommittedTranscriptSurface />
    </I18nProvider>,
  );
  const spawn = (
    id: string,
    receiver: string,
    model: string | null,
    reasoningEffort: string | null,
  ) =>
    collabAgentToolCall(id, "spawnAgent", "completed", {
      receiverThreadIds: [receiver],
      model,
      reasoningEffort,
      prompt: id === "spawn-full" ? "ACTIVITY prompt 原文" : null,
    });
  store.dispatch(
    threadRuntimeAttached(
      attachWithTurns(attachBaseline, [
        baseTurn("turn-activity-locale", [
          subAgentActivity("started-locale", "started", "/root/reviewer-原文"),
          spawn("spawn-full", "receiver-full", " gpt-5 原文 ", " high 原文 "),
          spawn("spawn-null-model", "receiver-null-model", null, "high"),
          spawn("spawn-null-effort", "receiver-null-effort", "gpt-5", null),
          spawn("spawn-model-only", "receiver-model-only", " gpt-5 ", "  "),
          spawn("spawn-effort-only", "receiver-effort-only", " ", " high "),
          spawn("spawn-empty", "receiver-empty", " ", "  "),
        ]),
      ]),
    ),
  );
  const entryBefore = selectTranscriptEntry(store.getState(), "spawn-full");
  const chunkBefore = selectTranscriptChunk(store.getState(), "turn-activity-locale:chunk:0");

  for (const title of [
    "Spawned receiver-full (gpt-5 原文 high 原文)",
    "Spawned receiver-null-model",
    "Spawned receiver-null-effort",
    "Spawned receiver-model-only (gpt-5)",
    "Spawned receiver-effort-only (high)",
    "Spawned receiver-empty",
  ])
    await expect.element(screen.getByRole("article", { name: title })).toBeVisible();
  await screen.getByRole("button", { name: "Switch activity locale" }).click();
  await expect
    .element(screen.getByRole("article", { name: "已启动 /root/reviewer-原文" }))
    .toBeVisible();
  await expect
    .element(screen.getByRole("article", { name: "已启动 receiver-full（gpt-5 原文 high 原文）" }))
    .toHaveTextContent("ACTIVITY prompt 原文");
  expect(selectTranscriptEntry(store.getState(), "spawn-full")).toBe(entryBefore);
  expect(selectTranscriptChunk(store.getState(), "turn-activity-locale:chunk:0")).toBe(chunkBefore);
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
