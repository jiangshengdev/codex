import { afterEach, expect, test, vi } from "vitest";
import type { Thread } from "@codex-protocol/v2";
import {
  formatThreadHistoryDateLabel,
  getThreadHistoryActivityDate,
  groupThreadHistoryByDate,
} from "../threadHistoryDateGroups";

afterEach(() => vi.unstubAllEnvs());

function activity(id: string, date: Date): Pick<Thread, "id" | "updatedAt" | "recencyAt"> {
  return { id, updatedAt: date.getTime() / 1000, recencyAt: null };
}

test("prefers recencyAt, falls back to updatedAt, and preserves a zero timestamp", () => {
  expect(getThreadHistoryActivityDate({ recencyAt: 100, updatedAt: 50 }).getTime()).toBe(100_000);
  expect(getThreadHistoryActivityDate({ recencyAt: null, updatedAt: 50 }).getTime()).toBe(50_000);
  expect(getThreadHistoryActivityDate({ recencyAt: 0, updatedAt: 50 }).getTime()).toBe(0);
});

test("groups appended records by local date without sorting or copying threads", () => {
  const first = activity("first", new Date(2026, 8, 5, 23, 59));
  const second = activity("second", new Date(2026, 8, 5, 0, 0));
  const older = activity("older", new Date(2026, 8, 4, 23, 59));
  const appended = activity("appended", new Date(2026, 8, 5, 12));
  const initial = [first, second, older];
  const groups = groupThreadHistoryByDate([...initial, appended]);

  expect(groups.map((group) => group.key)).toEqual(["2026-09-05", "2026-09-04"]);
  expect(groups.map((group) => group.threads.map((thread) => thread.id))).toEqual([
    ["first", "second", "appended"],
    ["older"],
  ]);
  expect(groups[0]?.threads[0]).toBe(first);
  expect(initial).toEqual([first, second, older]);
  expect(groupThreadHistoryByDate([])).toEqual([]);
  expect(groupThreadHistoryByDate([older, first]).map((group) => group.key)).toEqual([
    "2026-09-04",
    "2026-09-05",
  ]);
});

const labels = { today: "current local day", yesterday: "previous local day" };

test.each([
  { now: new Date(2026, 8, 5, 0, 0), date: new Date(2026, 8, 5, 23, 59), expected: labels.today },
  {
    now: new Date(2026, 8, 5, 0, 0),
    date: new Date(2026, 8, 4, 23, 59),
    expected: labels.yesterday,
  },
  { now: new Date(2026, 8, 1), date: new Date(2026, 7, 31), expected: labels.yesterday },
  { now: new Date(2026, 0, 1), date: new Date(2025, 11, 31), expected: labels.yesterday },
  { now: new Date(2026, 2, 1), date: new Date(2026, 1, 28), expected: labels.yesterday },
  { now: new Date(2024, 2, 1), date: new Date(2024, 1, 29), expected: labels.yesterday },
  { now: new Date(2026, 8, 5), date: new Date(2026, 8, 3), expected: "Sep 3" },
  { now: new Date(2026, 8, 5), date: new Date(2025, 8, 3), expected: "Sep 3, 2025" },
])("labels $date relative to $now", ({ now, date, expected }) => {
  expect(formatThreadHistoryDateLabel(date, now, "en", labels)).toBe(expected);
});

test("formats concrete dates in the selected locale", () => {
  expect(
    formatThreadHistoryDateLabel(new Date(2026, 8, 3), new Date(2026, 8, 5), "zh-CN", labels),
  ).toBe("9月3日");
  expect(
    formatThreadHistoryDateLabel(new Date(2025, 8, 3), new Date(2026, 8, 5), "zh-CN", labels),
  ).toBe("2025年9月3日");
});

test.each([
  {
    timezone: "Asia/Shanghai",
    timestamp: "2026-09-04T16:30:00Z",
    expected: "2026-09-05",
    offset: -480,
  },
  {
    timezone: "America/Los_Angeles",
    timestamp: "2026-09-05T06:30:00Z",
    expected: "2026-09-04",
    offset: 420,
  },
])("uses local rather than UTC date in $timezone", ({ timezone, timestamp, expected, offset }) => {
  vi.stubEnv("TZ", timezone);
  const date = new Date(timestamp);
  expect(date.getTimezoneOffset()).toBe(offset);
  expect(groupThreadHistoryByDate([activity("local", date)])[0]?.key).toBe(expected);
});

test.each([
  { now: [2026, 2, 9, 0, 30], yesterday: [2026, 2, 8, 12] },
  { now: [2026, 10, 1, 23, 30], yesterday: [2026, 9, 31, 12] },
] as const)("recognizes yesterday across daylight-saving changes: $now", ({ now, yesterday }) => {
  vi.stubEnv("TZ", "America/New_York");
  const current = new Date(now[0], now[1], now[2], now[3], now[4]);
  const previous = new Date(yesterday[0], yesterday[1], yesterday[2], yesterday[3]);
  expect(formatThreadHistoryDateLabel(previous, current, "en", labels)).toBe(labels.yesterday);
  // Fixed-duration subtraction lands on the wrong date at these DST boundaries.
  expect(new Date(current.getTime() - 24 * 60 * 60 * 1000).getDate()).not.toBe(previous.getDate());
});
