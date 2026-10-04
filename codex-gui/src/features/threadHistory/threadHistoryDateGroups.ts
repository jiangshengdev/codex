import type { Thread } from "@codex-protocol/v2";

type HistoryActivity = Pick<Thread, "recencyAt" | "updatedAt">;

export function getThreadHistoryActivityDate(thread: HistoryActivity): Date {
  return new Date((thread.recencyAt ?? thread.updatedAt) * 1000);
}

function localDateKey(date: Date): string {
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function groupThreadHistoryByDate<T extends HistoryActivity>(threads: readonly T[]) {
  const groups = new Map<string, { key: string; date: Date; threads: T[] }>();
  for (const thread of threads) {
    const date = getThreadHistoryActivityDate(thread);
    const key = localDateKey(date);
    const group = groups.get(key);
    if (group == null) {
      groups.set(key, { key, date, threads: [thread] });
    } else {
      group.threads.push(thread);
    }
  }
  return [...groups.values()];
}

export function formatThreadHistoryDateLabel(
  date: Date,
  now: Date,
  locale: string,
  labels: { today: string; yesterday: string },
): string {
  const key = localDateKey(date);
  if (key === localDateKey(now)) return labels.today;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localDateKey(yesterday)) return labels.yesterday;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" as const }),
  }).format(date);
}
