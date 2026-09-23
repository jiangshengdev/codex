import type { ThreadResumeResponse } from "@codex-protocol/v2";

export const createThreadResumeResponse = (
  thread: ThreadResumeResponse["thread"],
  options: Pick<ThreadResumeResponse, "model" | "modelProvider" | "approvalPolicy"> &
    Partial<Omit<ThreadResumeResponse, "thread" | "model" | "modelProvider" | "approvalPolicy">>,
): ThreadResumeResponse => ({
  thread,
  serviceTier: null,
  cwd: thread.cwd,
  instructionSources: [],
  approvalsReviewer: "user",
  sandbox: { type: "dangerFullAccess" },
  reasoningEffort: null,
  turnsBackwardsCursor: null,
  itemsBackwardsCursor: null,
  ...options,
});
