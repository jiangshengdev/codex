import { expect, test } from "vitest";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type {
  ActiveThreadProjectionAcceptedQueueFact,
  ActiveThreadProjectionReadModelFact,
} from "@/features/activeThreadSession/activeThreadProjection";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventReasoningSummaryPartAddedDelta,
  eventReasoningSummaryTextDelta,
  eventReasoningTextDelta,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithTurns,
  itemCompleted,
  itemStarted,
  reasoningItem,
  reasoningSummaryPartAddedDelta,
  reasoningSummaryTextDelta,
  reasoningTextDelta,
  subAgentActivity,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

type SurfaceRender = Awaited<ReturnType<typeof renderWithProviders>>;
type SurfaceStore = SurfaceRender["store"];
type ProjectionEvent = ActiveThreadProjectionAcceptedQueueFact["notification"];

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });
const threadRuntimeEventBuffered = (payload: ActiveThreadProjectionAcceptedQueueFact) =>
  readModelAction({ type: "eventAccepted", payload });
const threadRuntimeDeltasAccepted = ({
  notifications,
}: Pick<
  Extract<ActiveThreadProjectionReadModelFact, { type: "deltasAccepted" }>,
  "notifications"
>) => readModelAction({ type: "deltasAccepted", notifications });

const renderSurface = async () => {
  const result = await renderWithProviders(<CommittedTranscriptSurface />);
  result.store.dispatch(threadRuntimeAttached(attachWithTurns(attachBaseline, [])));
  return result;
};

const dispatchEvent = (store: SurfaceStore, notification: ProjectionEvent) =>
  store.dispatch(threadRuntimeEventBuffered({ notification, replay: "live" }));

const startReasoning = (store: SurfaceStore, turnId: string, itemId: string) =>
  dispatchEvent(
    store,
    itemStarted(eventItemStarted, `commit-start-${itemId}`, turnId, reasoningItem(itemId, [])),
  );

const appendSummary = (
  store: SurfaceStore,
  turnId: string,
  itemId: string,
  delta: string,
  summaryIndex: number,
) =>
  store.dispatch(
    threadRuntimeDeltasAccepted({
      notifications: [
        reasoningSummaryTextDelta(
          eventReasoningSummaryTextDelta,
          turnId,
          itemId,
          delta,
          summaryIndex,
        ),
      ],
    }),
  );

test("reveals only a closed reasoning title and keeps one live status across summary parts", async () => {
  const { store, ...screen } = await renderSurface();
  const turnId = "turn-reasoning-streaming-surface";
  const itemId = "reasoning-streaming-surface";
  const status = screen.getByRole("status");

  startReasoning(store, turnId, itemId);
  appendSummary(store, turnId, itemId, "**Plan", 0);

  await expect.element(status).not.toBeInTheDocument();
  await expect.element(screen.getByText("**Plan")).not.toBeInTheDocument();
  await expect.element(screen.getByText(/Thinking/i)).not.toBeInTheDocument();

  appendSummary(store, turnId, itemId, "ning**", 0);

  await expect.element(status).toBeVisible();
  await expect.element(status).toHaveTextContent("Planning");
  await expect.element(status).toHaveAttribute("aria-live", "polite");
  await expect.element(status).toHaveAttribute("aria-atomic", "true");
  await expect.element(status.nth(1)).not.toBeInTheDocument();
  await expect.element(screen.getByText(/Thinking/i)).not.toBeInTheDocument();
  expect(status.element().closest(".card.card--default")).not.toBeNull();

  store.dispatch(
    threadRuntimeDeltasAccepted({
      notifications: [
        reasoningSummaryPartAddedDelta(eventReasoningSummaryPartAddedDelta, turnId, itemId, 2),
        reasoningSummaryTextDelta(
          eventReasoningSummaryTextDelta,
          turnId,
          itemId,
          "**Verifying**",
          2,
        ),
      ],
    }),
  );

  await expect.element(status).toHaveTextContent("Verifying");
  await expect.element(status.nth(1)).not.toBeInTheDocument();
  await expect.element(screen.getByText("Planning")).not.toBeInTheDocument();
});

test("replaces streaming reasoning in place with authoritative semantic Markdown", async () => {
  const { store, ...screen } = await renderSurface();
  const turnId = "turn-reasoning-completed-surface";
  const itemId = "reasoning-completed-surface";
  const turn = screen.getByRole("article", { name: `Turn ${turnId}` });
  const status = turn.getByRole("status");

  startReasoning(store, turnId, itemId);
  appendSummary(store, turnId, itemId, "**Streamed title**", 0);
  await expect.element(status).toHaveTextContent("Streamed title");

  dispatchEvent(
    store,
    itemCompleted(
      eventItemCompleted,
      "commit-complete-reasoning-markdown",
      turnId,
      reasoningItem(
        itemId,
        [
          "**Final emphasis** with `inline code` and [safe link](https://example.invalid/reasoning)",
        ],
        ["raw reasoning must remain hidden"],
      ),
    ),
  );

  await expect.element(status).not.toBeInTheDocument();
  await expect.element(screen.getByText("Streamed title")).not.toBeInTheDocument();
  await expect
    .element(screen.getByText("raw reasoning must remain hidden"))
    .not.toBeInTheDocument();
  const emphasis = turn.getByText("Final emphasis");
  const code = turn.getByText("inline code");
  const link = turn.getByRole("link", { name: "safe link" });
  await expect.element(emphasis).toBeVisible();
  await expect.element(code).toBeVisible();
  await expect.element(link).toHaveAttribute("href", "https://example.invalid/reasoning");

  const reasoningCard = emphasis.element().closest(".card.card--default");
  expect(reasoningCard).not.toBeNull();
  expect(reasoningCard?.getAttribute("role")).toBe("article");
  expect(reasoningCard?.querySelector('[data-streamdown="strong"]')?.textContent).toBe(
    "Final emphasis",
  );
  expect(reasoningCard?.querySelector("code")?.textContent).toBe("inline code");
  expect(reasoningCard?.textContent).not.toContain("•");
});

test("uses reasoning as an activity-group boundary without changing event order", async () => {
  const { store, ...screen } = await renderSurface();
  const turnId = "turn-reasoning-activity-boundary";
  const itemId = "reasoning-activity-boundary";
  const before = subAgentActivity("activity-before-reasoning", "started", "agents/before");
  const after = subAgentActivity("activity-after-reasoning", "interrupted", "agents/after");

  dispatchEvent(
    store,
    itemCompleted(eventItemCompleted, "commit-before-reasoning", turnId, before),
  );
  startReasoning(store, turnId, itemId);
  appendSummary(store, turnId, itemId, "**Reasoning boundary**", 0);
  dispatchEvent(store, itemCompleted(eventItemCompleted, "commit-after-reasoning", turnId, after));

  const turn = screen.getByRole("article", { name: `Turn ${turnId}` });
  const beforeArticle = turn.getByRole("article", { name: "Started Before" });
  const status = turn.getByRole("status");
  const afterArticle = turn.getByRole("article", { name: "Interrupted After" });
  await expect.element(beforeArticle).toBeVisible();
  await expect.element(status).toHaveTextContent("Reasoning boundary");
  await expect.element(afterArticle).toBeVisible();

  const beforeGroup = beforeArticle.element().closest(".committed-transcript-activity-group");
  const afterGroup = afterArticle.element().closest(".committed-transcript-activity-group");
  expect(beforeGroup).not.toBeNull();
  expect(afterGroup).not.toBeNull();
  expect(beforeGroup).not.toBe(afterGroup);
  expect(status.element().closest(".committed-transcript-activity-group")).toBeNull();
  expect(
    beforeArticle.element().compareDocumentPosition(status.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
  expect(
    status.element().compareDocumentPosition(afterArticle.element()) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).not.toBe(0);
});

test("unmounts completed reasoning after the final answer and restores it on expansion", async () => {
  const { store, ...screen } = await renderSurface();
  const turnId = "turn-reasoning-disclosure";
  const itemId = "reasoning-disclosure";
  const reasoning = screen.getByText("Inspecting the evidence");

  dispatchEvent(
    store,
    itemCompleted(
      eventItemCompleted,
      "commit-reasoning-before-final",
      turnId,
      reasoningItem(itemId, ["Inspecting the evidence"]),
    ),
  );
  await expect.element(reasoning).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "Intermediate updates · 1 item" }))
    .toBeDisabled();

  dispatchEvent(
    store,
    itemCompleted(
      eventItemCompleted,
      "commit-final-after-reasoning",
      turnId,
      agentMessage("agent-final-after-reasoning", "Visible final answer", "final_answer"),
    ),
  );

  await expect.element(screen.getByText("Visible final answer")).toBeVisible();
  await expect.element(reasoning).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "Intermediate updates · 1 item" });
  await expect.element(trigger).toBeEnabled();
  await trigger.click();
  await expect.element(reasoning).toBeVisible();
});

test("does not mount an empty article for raw-only or empty-summary reasoning", async () => {
  const { store, ...screen } = await renderSurface();
  const turnId = "turn-reasoning-empty";
  const itemId = "reasoning-empty";

  startReasoning(store, turnId, itemId);
  store.dispatch(
    threadRuntimeDeltasAccepted({
      notifications: [
        reasoningTextDelta(
          eventReasoningTextDelta,
          turnId,
          itemId,
          "raw reasoning must never render",
          0,
        ),
      ],
    }),
  );
  dispatchEvent(
    store,
    itemCompleted(
      eventItemCompleted,
      "commit-empty-reasoning",
      turnId,
      reasoningItem(itemId, ["", " \n\t "], ["raw completion payload"]),
    ),
  );

  await expect.element(screen.getByText("raw reasoning must never render")).not.toBeInTheDocument();
  await expect.element(screen.getByText("raw completion payload")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("article", { name: `Turn ${turnId}` }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("region", { name: "Committed transcript" }).getByRole("article"))
    .not.toBeInTheDocument();
  await expect.element(screen.getByText("No committed messages yet.")).toBeVisible();
});
