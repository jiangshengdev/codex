import { expect, test } from "vitest";
import {
  agentMessage,
  baseTurn,
  failedTurn,
  interruptedTurn,
  inProgressTurn,
  turnWithTiming,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import { renderWithProviders } from "@/utils/test-utils";
import { ReadOnlyCommittedTranscriptSurface } from "../CommittedTranscriptSurface";

test("shows static authoritative completion times for all terminal states without a fork action", async () => {
  const completedAt = new Date(2026, 8, 12, 9, 39).getTime() / 1000;
  const turns = [
    baseTurn("success", [agentMessage("a", "Success")]),
    failedTurn("failed", {
      message: "Failed",
      codexErrorInfo: null,
      additionalDetails: null,
      misalignment: null,
    }),
    interruptedTurn("interrupted", [agentMessage("c", "Interrupted")]),
    inProgressTurn("running", [agentMessage("d", "Running")]),
    baseTurn("missing", [agentMessage("e", "Missing")]),
  ].map((turn) =>
    turnWithTiming(turn, {
      startedAt: null,
      completedAt: turn.id === "missing" ? null : completedAt,
      durationMs: null,
    }),
  );
  const screen = await renderWithProviders(
    <ReadOnlyCommittedTranscriptSurface
      surfaceKey="completion"
      transcriptState={buildTranscriptStateFromTurns(turns)}
    />,
    { locale: "zh-CN" },
  );
  await expect.element(screen.getByText("09:39", { exact: true }).first()).toBeVisible();
  const times = document.querySelectorAll("time");
  expect(times).toHaveLength(3);
  for (const time of times) {
    expect(time.textContent).toBe("09:39");
    expect(time.dateTime).toBe(new Date(completedAt * 1000).toISOString());
    expect(time.tabIndex).toBe(-1);
    expect(time.closest("[tabindex], button, a, [title]")).toBeNull();
  }
});
