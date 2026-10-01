import type { AppDispatch } from "@/app/store";
import { createActiveThreadSession } from "@/features/activeThreadSession/activeThreadSession";
import { BrowserAuthorizationSession } from "@/features/browserLaunch/browserAuthorizationSession";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { createThreadResumeResponse } from "@/features/guiHost/__tests__/threadResumeTestBuilders";
import { NewSessionOwner } from "@/features/newSession/newSessionOwner";
import { createListenerSet } from "@/subscriptions/listenerSet";
import {
  attachBaseline,
  eventItemCompleted,
  eventItemStarted,
  eventTurnStarted,
  eventTurnCompleted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  asyncQuestionMessage,
  attachWithSnapshotThread,
  attachWithThreadId,
  attachWithTurns,
  eventForThreadOwner,
  eventWithEnvelope,
  inProgressTurn,
  itemCompleted,
  itemStarted,
  userMessage,
  turnStarted,
  turnCompleted,
  turnWithStatus,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { manualRequests } from "../composer/pendingInput/pendingInputScenario";
import { createRecoveryCommands } from "../recovery/recoveryCommands";

export const questionThreadId = "00000000-0000-0000-0000-000000000214";
export type QuestionPreset = "plainText" | "options" | "multiple" | "idle" | "queued";

export function createQuestionScenario(dispatch: AppDispatch, preset: QuestionPreset) {
  const fallback = createRecoveryCommands();
  const listeners = createListenerSet();
  let ready = false;
  const records = new Map<string, string>();
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value);
    },
  };
  const authorization = new BrowserAuthorizationSession(
    storage,
    {
      token: "storybook-questions-fictional-token",
      activeThreadId: questionThreadId,
    },
    crypto.randomUUID(),
  );
  let turn = inProgressTurn("question-turn");
  const initial = attachWithTurns(attachWithThreadId(attachBaseline, questionThreadId), [turn]);
  const baseline = attachWithSnapshotThread(initial, {
    ...initial.snapshot.thread,
    sessionId: questionThreadId,
    cwd: "/storybook/questions",
    name: "Agent questions",
    preview: "Local question simulation",
    status: { type: "active", activeFlags: [] },
  });
  const steers = manualRequests<
    Parameters<GuiHostCommands["steerTurn"]>[0],
    Awaited<ReturnType<GuiHostCommands["steerTurn"]>>
  >();
  const starts = manualRequests<
    Parameters<GuiHostCommands["startTurn"]>[0],
    Awaited<ReturnType<GuiHostCommands["startTurn"]>>
  >();
  const commands: GuiHostCommands = {
    ...fallback.commands,
    listLoadedThreads: () => Promise.resolve({ data: [questionThreadId], nextCursor: null }),
    listThreads: () =>
      Promise.resolve({
        data: [baseline.snapshot.thread],
        nextCursor: null,
        backwardsCursor: null,
      }),
    readThread: () => Promise.resolve({ thread: baseline.snapshot.thread }),
    resumeThread: () =>
      Promise.resolve(
        createThreadResumeResponse(baseline.snapshot.thread, {
          model: "storybook-model",
          modelProvider: "storybook",
          approvalPolicy: "on-request",
        }),
      ),
    attachThreadProjection: () => Promise.resolve(baseline),
    steerTurn: steers.issue,
    startTurn: starts.issue,
  };
  const controller = createActiveThreadSession({
    dispatch,
    commands,
    authorizationSession: authorization,
    persistence: { authorizationContext: authorization.getPersistenceContext(), storage },
    scheduler: { requestFrame: requestAnimationFrame, cancelFrame: cancelAnimationFrame },
  });
  const newSessionOwner = new NewSessionOwner();
  let head = baseline.snapshot.headCommitId;
  let sequence = 0;
  let started: Promise<void> | undefined;
  let disposed = false;
  const emitItem = (item: Parameters<typeof itemCompleted>[3], started = false) => {
    turn = { ...turn, items: [...turn.items.filter((existing) => existing.id !== item.id), item] };
    const commitId = `question-commit-${String(++sequence)}`;
    controller.handleProjectionEvent(
      eventForThreadOwner(
        eventWithEnvelope(
          started
            ? itemStarted(eventItemStarted, commitId, turn.id, item)
            : itemCompleted(eventItemCompleted, commitId, turn.id, item),
          { parentCommitId: head },
        ),
        { threadId: questionThreadId, subscriptionId: baseline.subscriptionId },
      ),
    );
    head = commitId;
  };
  const emitTurn = (completed: boolean) => {
    const commitId = `question-commit-${String(++sequence)}`;
    controller.handleProjectionEvent(
      eventForThreadOwner(
        eventWithEnvelope(
          completed
            ? turnCompleted(eventTurnCompleted, commitId, turn)
            : turnStarted(eventTurnStarted, commitId, turn),
          { parentCommitId: head },
        ),
        { threadId: questionThreadId, subscriptionId: baseline.subscriptionId },
      ),
    );
    head = commitId;
  };
  const completeTurn = () => {
    if (
      turn.status !== "inProgress" ||
      steers.getSnapshot().length > 0 ||
      starts.getSnapshot().length > 0
    )
      return;
    turn = turnWithStatus(turn, "completed");
    emitTurn(true);
  };
  return {
    commands,
    session: controller.session,
    newSessionOwner,
    steers,
    starts,
    completeTurn,
    subscribe: (listener: () => void) => listeners.subscribe(listener),
    isReady: () => ready,
    start: () =>
      (started ??= (async () => {
        await controller.session.activate(questionThreadId);
        if (disposed) return;
        let snapshot = controller.session.getSnapshot();
        if (snapshot.phase !== "active") throw new Error("Question preview could not initialize");
        if (preset === "queued") {
          snapshot.composerRole.submit(snapshot.revision, composerDraftCapture("Ordinary message"));
          snapshot = controller.session.getSnapshot();
          if (snapshot.phase !== "active") throw new Error("Question preview lost its active task");
          snapshot.composerRole.submitSteer(
            snapshot.revision,
            composerDraftCapture("Earlier guidance"),
          );
          snapshot = controller.session.getSnapshot();
          if (snapshot.phase !== "active") throw new Error("Question preview lost its active task");
        }
        snapshot.composerRole.saveDraft(
          snapshot.revision,
          composerDraftCapture("Keep my bottom draft").draft,
        );
        emitItem(
          asyncQuestionMessage(
            "questions",
            preset === "multiple"
              ? [
                  { title: "Which environment?", options: ["Preview", "Production"] },
                  { title: "Which region?", options: null },
                  { title: "Any extra notes?", options: null },
                ]
              : [
                  {
                    title: "Which environment?",
                    options: preset === "options" ? ["Preview", "Production"] : null,
                  },
                ],
          ),
        );
        if (preset === "idle") completeTurn();
        ready = true;
        listeners.notify();
      })()),
    confirmNext() {
      const start = starts.getSnapshot()[0];
      if (start != null && !disposed) {
        turn = inProgressTurn(`answer-turn-${String(sequence)}`);
        start.resolve({ turn });
        emitTurn(false);
        const item = userMessage(
          `answer-${String(sequence)}`,
          start.params.input,
          start.params.clientUserMessageId ?? null,
        );
        emitItem(item, true);
        emitItem(item);
        return;
      }
      const request = steers.getSnapshot()[0];
      if (request == null || disposed) return;
      request.resolve({ turnId: turn.id });
      const item = userMessage(
        `answer-${String(sequence)}`,
        request.params.input,
        request.params.clientUserMessageId ?? null,
      );
      emitItem(item, true);
      emitItem(item);
    },
    dispose() {
      disposed = true;
      controller.dispose();
      for (const request of steers.getSnapshot())
        request.reject(new Error("Question preview disposed"));
      for (const request of starts.getSnapshot())
        request.reject(new Error("Question preview disposed"));
      fallback.dispose();
      listeners.clear();
    },
  };
}
