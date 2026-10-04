import type { Thread } from "@codex-protocol/v2";

export function resolveThreadHistoryPresentation(
  thread: Pick<Thread, "name" | "preview">,
  fallback: string,
): { title: string; summary: string | null } {
  const name = thread.name?.trim() ?? "";
  const preview = thread.preview.trim();

  return {
    title: name || preview || fallback,
    summary: name !== "" && preview !== "" && name !== preview ? preview : null,
  };
}
