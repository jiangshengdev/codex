import {
  GuiHostCommandError,
  type GuiHostCommands,
} from "@/features/guiHost/guiHostCommandGateway";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import { createThreadResumeResponse } from "@/features/guiHost/__tests__/threadResumeTestBuilders";
import { createListenerSet } from "@/subscriptions/listenerSet";
import {
  agentMessage,
  attachWithSnapshotThread,
  attachWithThreadId,
  attachWithTurns,
  baseTurn,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { recoveryConversationTurns } from "./recoveryConversation";

export const recoveryFirstId = "00000000-0000-0000-0000-000000000001";
export const recoverySecondId = "00000000-0000-0000-0000-000000000002";

type AttachResponse = Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>;
type AttachOutcome = "success" | "failure" | "pending";

function retainedTask(threadId: string, label: string): AttachResponse {
  const attach = attachWithTurns(attachWithThreadId(attachBaseline, threadId), [
    ...recoveryConversationTurns(label),
    baseTurn(`recovery-turn-${label}`, [
      agentMessage(`recovery-answer-${label}`, `Retained answer ${label}`),
    ]),
  ]);
  return attachWithSnapshotThread(attach, {
    ...attach.snapshot.thread,
    sessionId: threadId,
    name: `Recovery task ${label}`,
    preview: `Retained answer ${label}`,
    cwd: "/storybook/recovery",
  });
}

const attachFailure = (threadId: string) =>
  new Error(
    [
      "STORYBOOK_TASK_RESTORE_FAILED: simulated projection attachment failure.",
      `threadId=${threadId}`,
      ...Array.from(
        { length: 24 },
        (_, index) =>
          `diagnostic-${String(index + 1)}: Local simulated recovery did not receive a usable attachment. Retained content and input remain available for another recovery attempt.`,
      ),
    ].join("\n"),
  );

export function createRecoveryCommands() {
  const tasks = new Map([
    [recoveryFirstId, retainedTask(recoveryFirstId, "one")],
    [recoverySecondId, retainedTask(recoverySecondId, "two")],
  ]);
  const outcomes = new Map<string, { sequence: AttachOutcome[]; delayMs: number }>();
  const cancellations = new Set<() => void>();
  let subscriptionSequence = 0;
  let sendCount = 0;
  const sendListeners = createListenerSet();
  let disposed = false;

  const task = (threadId: string): AttachResponse => {
    const result = tasks.get(threadId);
    if (result == null) throw new Error(`Unknown local recovery task: ${threadId}`);
    return result;
  };
  const rejectSend = (): Promise<never> => {
    sendCount += 1;
    sendListeners.notify();
    return Promise.reject(
      new GuiHostCommandError({
        source: "unavailable",
        delivery: "definitelyNotAccepted",
        error: new Error("Storybook recovery previews do not send model requests."),
      }),
    );
  };
  const commands: GuiHostCommands = {
    forkThread: () => {
      return Promise.reject(new Error("Thread creation is outside this local recovery preview."));
    },
    startThread: () => {
      return Promise.reject(new Error("Thread creation is outside this local recovery preview."));
    },
    compactThread: () => Promise.resolve({}),
    attachThreadProjection: async ({ threadId }) => {
      if (disposed) throw new Error("Local recovery preview was disposed.");
      const baseline = task(threadId);
      const response = attachWithSnapshotThread(
        baseline,
        baseline.snapshot.thread,
        `storybook-recovery-subscription-${String(++subscriptionSequence)}`,
      );
      const configured = outcomes.get(threadId);
      const outcome = configured?.sequence[0] ?? "success";
      const delayMs = configured?.delayMs ?? 0;
      if (configured != null && configured.sequence.length > 1) configured.sequence.shift();
      if (outcome !== "pending" && delayMs === 0) {
        if (outcome === "failure") throw attachFailure(threadId);
        return response;
      }
      return new Promise<AttachResponse>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const cancel = () => {
          if (timer !== undefined) clearTimeout(timer);
          cancellations.delete(cancel);
          reject(new Error("Local recovery preview was disposed."));
        };
        cancellations.add(cancel);
        if (outcome !== "pending") {
          timer = setTimeout(() => {
            cancellations.delete(cancel);
            if (outcome === "failure") reject(attachFailure(threadId));
            else resolve(response);
          }, delayMs);
        }
      });
    },
    listSkills: () =>
      Promise.resolve({
        data: [{ cwd: "/storybook/recovery", skills: [], errors: [] }],
      }),
    listThreads: () =>
      Promise.resolve({
        data: [...tasks.values()].map((attach) => attach.snapshot.thread),
        nextCursor: null,
        backwardsCursor: null,
      }),
    listLoadedThreads: () => Promise.resolve({ data: [...tasks.keys()], nextCursor: null }),
    readThread: ({ threadId }) => Promise.resolve({ thread: task(threadId).snapshot.thread }),
    resumeThread: ({ threadId }) =>
      Promise.resolve(
        createThreadResumeResponse(task(threadId).snapshot.thread, {
          model: "storybook-model",
          modelProvider: "storybook",
          cwd: "/storybook/recovery",
          approvalPolicy: "on-request",
        }),
      ),
    detachThreadProjection: () => Promise.resolve({ status: "detached" }),
    startTurn: rejectSend,
    steerTurn: rejectSend,
    interruptTurn: () => Promise.resolve({}),
  };

  return {
    commands,
    setAttachOutcome(threadId: string, outcome: AttachOutcome, delayMs = 0) {
      outcomes.set(threadId, { sequence: [outcome], delayMs });
    },
    setAttachOutcomes(
      threadId: string,
      sequence: readonly [AttachOutcome, ...AttachOutcome[]],
      delayMs = 0,
    ) {
      outcomes.set(threadId, { sequence: [...sequence], delayMs });
    },
    dispose() {
      disposed = true;
      for (const cancel of cancellations) cancel();
      sendListeners.clear();
    },
    getSendCount: () => sendCount,
    subscribeSends: (listener: () => void) => sendListeners.subscribe(listener),
  };
}
