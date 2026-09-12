import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { activeThreadReadModelTransitionApplied } from "@/features/activeThreadSession/activeThreadSessionReadModel";
import {
  attachBaseline,
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  attachWithTurns,
  baseTurn,
  inProgressTurn,
  interruptedTurn,
  textInput,
  turnWithTiming,
  turnStarted,
  turnCompleted,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { CommittedTranscriptSurface } from "../CommittedTranscriptSurface";
import { renderTranscriptWithProviders, transcriptIdentity } from "./transcriptSurfaceFixtures";

afterEach(() => vi.useRealTimers());

test("shows the authoritative duration beneath the first user input only", async () => {
  const { store } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
    { locale: "zh-CN" },
  );
  store.dispatch(
    activeThreadReadModelTransitionApplied({
      identity: transcriptIdentity,
      sessionRevision: 1,
      facts: [
        {
          type: "baselineAttached",
          response: attachWithTurns(attachBaseline, [
            turnWithTiming(
              baseTurn("timed", [
                userMessage("first", [textInput("First input")]),
                userMessage("second", [textInput("Additional input")]),
              ]),
              { startedAt: 1700000000, completedAt: 1700000125, durationMs: 125999 },
            ),
          ]),
        },
      ],
    }),
  );
  await expect.element(page.getByText("用时 2分钟 05秒", { exact: true })).toBeVisible();
  expect(document.querySelectorAll(".committed-transcript-turn-duration")).toHaveLength(1);
  const duration = document.querySelector(".committed-transcript-turn-duration");
  expect(duration?.previousElementSibling?.textContent).toContain("First input");
});

test("counts waits from the server start across reattach and freezes the final duration", async () => {
  vi.setSystemTime(new Date(2026, 8, 12, 9, 0, 8));
  const startedAt = new Date(2026, 8, 12, 9).getTime() / 1000;
  const turn = turnWithTiming(
    inProgressTurn("running", [userMessage("prompt", [textInput("Wait for me")])]),
    {
      startedAt,
      completedAt: null,
      durationMs: null,
    },
  );
  const { store } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
    { locale: "zh-CN" },
  );
  store.dispatch(
    activeThreadReadModelTransitionApplied({
      identity: transcriptIdentity,
      sessionRevision: 1,
      facts: [
        { type: "baselineAttached", response: attachWithTurns(attachBaseline, []) },
        {
          type: "eventAccepted",
          payload: {
            notification: turnStarted(eventTurnStarted, "start-timed", turn),
            replay: "live",
          },
        },
        { type: "baselineAttached", response: attachWithTurns(attachBaseline, [turn]) },
      ],
    }),
  );
  await expect.element(page.getByText("已用时 8秒", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("separator")).toBeVisible();
  vi.setSystemTime(new Date(2026, 8, 12, 9, 2, 5));
  await expect.element(page.getByText("已用时 2分钟 05秒", { exact: true })).toBeVisible();
  const finished = turnWithTiming(interruptedTurn(turn.id, turn.items), {
    startedAt,
    completedAt: startedAt + 3789,
    durationMs: 3789999,
  });
  store.dispatch(
    activeThreadReadModelTransitionApplied({
      identity: transcriptIdentity,
      sessionRevision: 2,
      facts: [
        {
          type: "eventAccepted",
          payload: {
            notification: turnCompleted(eventTurnCompleted, "finish-timed", finished),
            replay: "live",
          },
        },
      ],
    }),
  );
  await expect.element(page.getByText("用时 1小时 03分钟 09秒", { exact: true })).toBeVisible();
  await expect.element(page.getByText("10:03", { exact: true })).toBeVisible();
  vi.setSystemTime(new Date(2026, 8, 13));
  await expect.element(page.getByText("用时 1小时 03分钟 09秒", { exact: true })).toBeVisible();
  expect(document.querySelectorAll(".committed-transcript-turn-status")).toHaveLength(1);
});

test("omits missing durations and never starts a clock from mount time", async () => {
  const { store } = await renderTranscriptWithProviders(
    transcriptIdentity,
    <CommittedTranscriptSurface identity={transcriptIdentity} />,
  );
  store.dispatch(
    activeThreadReadModelTransitionApplied({
      identity: transcriptIdentity,
      sessionRevision: 1,
      facts: [
        {
          type: "baselineAttached",
          response: attachWithTurns(attachBaseline, [
            turnWithTiming(
              inProgressTurn("no-start", [userMessage("one", [textInput("No start")])]),
              {
                startedAt: null,
                completedAt: null,
                durationMs: null,
              },
            ),
            turnWithTiming(
              baseTurn("no-duration", [userMessage("two", [textInput("No duration")])]),
              {
                startedAt: 1700000000,
                completedAt: 1700000005,
                durationMs: null,
              },
            ),
          ]),
        },
      ],
    }),
  );
  await expect.element(page.getByText("No duration", { exact: true })).toBeVisible();
  expect(document.querySelectorAll(".committed-transcript-turn-duration")).toHaveLength(0);
  await expect.element(page.getByRole("separator")).not.toBeInTheDocument();
});
