import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import {
  agentMessage,
  baseTurn,
  contextCompaction,
  textInput,
  turnWithTiming,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import { renderWithProviders } from "@/utils/test-utils";
import { ReadOnlyCommittedTranscriptSurface } from "../CommittedTranscriptSurface";

afterEach(() => vi.useRealTimers());

test("labels the first turn and each local four-hour boundary with actual time", async () => {
  vi.setSystemTime(new Date(2026, 8, 12, 23));
  const times = [
    "00:01",
    "03:59",
    "04:00",
    "07:59",
    "08:00",
    "11:59",
    "12:00",
    "15:59",
    "16:00",
    "19:59",
    "20:00",
    "23:59",
  ];
  const turns = times.map((time, index) => {
    const [hour, minute] = time.split(":").map(Number);
    return turnWithTiming(
      baseTurn(String(index), [userMessage(`user-${String(index)}`, [textInput(`Input ${time}`)])]),
      {
        startedAt: new Date(2026, 8, 12, hour, minute).getTime() / 1000,
        completedAt: null,
        durationMs: null,
      },
    );
  });
  await renderWithProviders(
    <ReadOnlyCommittedTranscriptSurface
      surfaceKey="history"
      transcriptState={buildTranscriptStateFromTurns(turns)}
    />,
    { locale: "zh-CN" },
  );
  await expect.element(page.getByText("今天 00:01", { exact: true })).toBeVisible();
  expect(
    Array.from(
      document.querySelectorAll(".committed-transcript-time-label"),
      (node) => node.textContent,
    ),
  ).toEqual(["今天 00:01", "今天 04:00", "今天 08:00", "今天 12:00", "今天 16:00", "今天 20:00"]);
});

test("uses calendar dates across days and skips missing timestamps and empty periods", async () => {
  vi.setSystemTime(new Date(2026, 8, 12, 23));
  const dates = [
    null,
    new Date(2026, 8, 10, 8, 23),
    new Date(2026, 8, 11, 16, 42),
    null,
    new Date(2026, 8, 11, 17, 15),
    new Date(2026, 8, 12, 9, 37),
    new Date(2026, 8, 12, 21, 1),
    new Date(2026, 8, 13, 21, 1),
  ];
  const turns = dates.map((date, index) =>
    turnWithTiming(
      baseTurn(String(index), [
        userMessage(`user-${String(index)}`, [textInput(`Prompt ${String(index)}`)]),
      ]),
      {
        startedAt: date == null ? null : date.getTime() / 1000,
        completedAt: null,
        durationMs: null,
      },
    ),
  );
  await renderWithProviders(
    <ReadOnlyCommittedTranscriptSurface
      surfaceKey="dates"
      transcriptState={buildTranscriptStateFromTurns(turns)}
    />,
    { locale: "zh-CN" },
  );
  await expect.element(page.getByText("今天 09:37", { exact: true })).toBeVisible();
  expect(
    Array.from(
      document.querySelectorAll(".committed-transcript-time-label"),
      (node) => node.textContent,
    ),
  ).toEqual([
    "2026年9月10日 08:23",
    "昨天 16:42",
    "今天 09:37",
    "今天 21:01",
    "2026年9月13日 21:01",
  ]);
  for (const label of document.querySelectorAll(".committed-transcript-time-label")) {
    expect(label.parentElement?.firstElementChild).toBe(label);
  }
});

test("keeps timing on the original fragment across context pages and preserves narrow layout", async () => {
  vi.setSystemTime(new Date(2026, 8, 12, 23));
  const startedAt = new Date(2026, 8, 12, 9, 37).getTime() / 1000;
  const turns = [
    turnWithTiming(
      baseTurn("split", [
        userMessage("prompt", [textInput("Original prompt")]),
        agentMessage("before", "Before compaction", "commentary"),
        contextCompaction("boundary"),
        agentMessage("final", "Final answer", "final_answer"),
      ]),
      { startedAt, completedAt: startedAt + 8, durationMs: 8000 },
    ),
    turnWithTiming(baseTurn("next", [userMessage("next-user", [textInput("Next prompt")])]), {
      startedAt: startedAt + 60,
      completedAt: startedAt + 68,
      durationMs: 8000,
    }),
  ];
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  try {
    await page.viewport(390, 844);
    const screen = await renderWithProviders(
      <ReadOnlyCommittedTranscriptSurface
        surfaceKey="pages"
        transcriptState={buildTranscriptStateFromTurns(turns)}
      />,
    );
    await expect.element(screen.getByText("Final answer", { exact: true })).toBeVisible();
    expect(document.querySelectorAll(".committed-transcript-time-label")).toHaveLength(0);
    expect(document.querySelectorAll(".committed-transcript-turn-duration")).toHaveLength(1);
    await screen.getByRole("button", { name: "Previous context page" }).click();
    await expect.element(screen.getByText("Today 09:37", { exact: true })).toBeVisible();
    expect(document.querySelectorAll(".committed-transcript-time-label")).toHaveLength(1);
    expect(document.querySelectorAll(".committed-transcript-turn-duration")).toHaveLength(1);
    expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
    const prompt = screen
      .getByText("Original prompt", { exact: true })
      .element()
      .getBoundingClientRect();
    const duration = screen
      .getByText("Duration 8s", { exact: true })
      .element()
      .getBoundingClientRect();
    expect(duration.top).toBeGreaterThanOrEqual(prompt.bottom);
    await screen.getByRole("button", { name: "Next context page" }).click();
    await expect.element(screen.getByText("Next prompt", { exact: true })).toBeVisible();
    expect(document.querySelectorAll(".committed-transcript-time-label")).toHaveLength(0);
  } finally {
    await page.viewport(viewport.width, viewport.height);
  }
});
