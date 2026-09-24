import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import {
  agentMessage,
  attachWithSnapshotThread,
  attachWithThreadId,
  attachWithTurns,
  baseTurn,
  textInput,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";

export const historyCurrentId = "00000000-0000-0000-0000-000000000101";
export const historySelectedId = "00000000-0000-0000-0000-000000000102";
export const historyReturnedId = "00000000-0000-0000-0000-000000000103";
export const historyCwd = "/storybook/history";

export function historyTask(threadId: string, name: string, answer: string) {
  const attach = attachWithTurns(attachWithThreadId(attachBaseline, threadId), [
    baseTurn(`turn-${threadId}`, [
      userMessage(`user-${threadId}`, [
        textInput("Find the earlier investigation and continue working."),
      ]),
      agentMessage(`answer-${threadId}`, answer),
    ]),
  ]);
  return attachWithSnapshotThread(attach, {
    ...attach.snapshot.thread,
    sessionId: threadId,
    name,
    preview: answer,
    cwd: historyCwd,
    createdAt: 1_790_208_000,
    updatedAt: 1_790_208_000,
    recencyAt: 1_790_208_000,
  });
}

export const historyTasks = [
  historyTask(historyCurrentId, "Current investigation", "Current task context"),
  historyTask(historySelectedId, "Investigate history recovery", "Read-only history evidence"),
  historyTask(historyReturnedId, "Continued investigation", "Recovered authoritative task"),
];
