import { expect, test } from "vitest";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  agentMessage,
  attachWithTurns,
  baseTurn,
  subAgentActivity,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT } from "@/features/transcriptState/transcriptStateSlice";
import { renderWithProviders } from "@/utils/test-utils";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";

let sessionRevision = 0;
const readModelAction = (...facts: ActiveThreadProjectionReadModelFact[]) =>
  activeThreadReadModelTransitionApplied({ sessionRevision: ++sessionRevision, facts });
const threadRuntimeAttached = (
  response: Extract<ActiveThreadProjectionReadModelFact, { type: "baselineAttached" }>["response"],
) => readModelAction({ type: "baselineAttached", response });

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

test("keeps the final answer visible while temporary disclosure is collapsed", async () => {
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
        `/root/cross_chunk_${String(index)}`,
      ),
  );
  const firstActivityTitle = `Started Cross chunk 0 Cross chunk 1 Cross chunk 2 and ${String(
    TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT - 3,
  )} more sub-agents`;
  const lastActivityTitle = `Started Cross chunk ${String(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT)}`;

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
    .element(screen.getByRole("article", { name: firstActivityTitle, exact: true }))
    .not.toBeInTheDocument();

  const trigger = screen.getByRole("button", {
    name: `Intermediate updates · ${String(TARGET_TRANSCRIPT_CHUNK_ENTRY_LIMIT + 1)} items`,
    exact: true,
  });
  expect(trigger.elements()).toHaveLength(1);
  await expect.element(trigger).toBeEnabled();
  await trigger.click();

  const firstActivity = screen.getByRole("article", { name: firstActivityTitle, exact: true });
  const lastActivity = screen.getByRole("article", { name: lastActivityTitle, exact: true });
  await expect.element(firstActivity).toBeVisible();
  await expect.element(lastActivity).toBeVisible();
  expect(
    screen
      .getByRole("article", { name: "Turn turn-temporary-cross-chunk", exact: true })
      .getByRole("article")
      .elements(),
  ).toHaveLength(3);
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
