import type { AppDispatch } from "@/app/store";
import type { ActiveThreadSessionController } from "@/features/activeThreadSession/activeThreadSession";
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
import type { AppCapabilities } from "@/features/appShell/AppCapabilities";
import { startStorybookConnectionLifecycle } from "../environment/storybookConnectionLifecycle";
import type { StartGuiHostConnectionOptions } from "@/features/guiHost/guiHostClient";
import { questionKey } from "@/features/asyncQuestions/asyncQuestions";
import { attachWithHeadCommitId } from "@/features/projection/__tests__/projectionTestBuilders";

export const questionThreadId = "00000000-0000-0000-0000-000000000214";
export type QuestionPreset =
  | "plainText"
  | "options"
  | "multiple"
  | "idle"
  | "queued"
  | "disconnected"
  | "history";

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
  const questionItem = asyncQuestionMessage(
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
            options:
              preset === "options" || preset === "disconnected" || preset === "history"
                ? ["Preview", "Production"]
                : null,
          },
        ],
  );
  let turn =
    preset === "history"
      ? turnWithStatus({ ...inProgressTurn("question-turn"), items: [questionItem] }, "completed")
      : inProgressTurn("question-turn");
  const initial = attachWithTurns(attachWithThreadId(attachBaseline, questionThreadId), [turn]);
  let baseline = attachWithSnapshotThread(initial, {
    ...initial.snapshot.thread,
    sessionId: questionThreadId,
    cwd: "/storybook/questions",
    name: "Agent questions",
    preview: "Local question simulation",
    status: preset === "history" ? { type: "idle" } : { type: "active", activeFlags: [] },
  });
  const steers = manualRequests<
    Parameters<GuiHostCommands["steerTurn"]>[0],
    Awaited<ReturnType<GuiHostCommands["steerTurn"]>>
  >();
  const starts = manualRequests<
    Parameters<GuiHostCommands["startTurn"]>[0],
    Awaited<ReturnType<GuiHostCommands["startTurn"]>>
  >();
  const attachments = manualRequests<
    Parameters<GuiHostCommands["attachThreadProjection"]>[0],
    Awaited<ReturnType<GuiHostCommands["attachThreadProjection"]>>
  >();
  let subscriptionSequence = 0;
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
    attachThreadProjection: (params) => {
      baseline = {
        ...baseline,
        subscriptionId: `question-subscription-${String(++subscriptionSequence)}`,
      };
      return preset === "disconnected" && ready
        ? attachments.issue(params)
        : Promise.resolve(baseline);
    },
    steerTurn: steers.issue,
    startTurn: starts.issue,
  };
  const newSessionOwner = new NewSessionOwner();
  let capabilities: AppCapabilities = {
    status: { label: "connecting" },
    authorizationToken: null,
    commands: null,
    activeThreadSession: null,
    connectionRecovery: null,
    newSessionOwner,
    routeTarget: { type: "currentTask", threadId: questionThreadId },
  };
  const patch = (update: Partial<AppCapabilities>) => {
    capabilities = { ...capabilities, ...update };
    listeners.notify();
  };
  let connection: StartGuiHostConnectionOptions | undefined;
  let lifecycle: ReturnType<typeof startStorybookConnectionLifecycle> | undefined;
  let head = baseline.snapshot.headCommitId;
  let sequence = 0;
  let disposed = false;
  const retainSnapshot = () => {
    const turns = baseline.snapshot.thread.turns;
    baseline = attachWithHeadCommitId(
      attachWithTurns(
        baseline,
        turns.some((existing) => existing.id === turn.id)
          ? turns.map((existing) => (existing.id === turn.id ? turn : existing))
          : [...turns, turn],
      ),
      head,
    );
  };
  const emitItem = (item: Parameters<typeof itemCompleted>[3], started = false) => {
    turn = { ...turn, items: [...turn.items.filter((existing) => existing.id !== item.id), item] };
    const commitId = `question-commit-${String(++sequence)}`;
    connection?.onProjectionEvent?.(
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
    retainSnapshot();
  };
  const emitTurn = (completed: boolean) => {
    const commitId = `question-commit-${String(++sequence)}`;
    connection?.onProjectionEvent?.(
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
    retainSnapshot();
  };
  const completeTurn = () => {
    if (
      turn.status !== "inProgress" ||
      steers.getSnapshot().length > 0 ||
      starts.getSnapshot().length > 0 ||
      capabilities.commands == null ||
      attachments.getSnapshot().length > 0
    )
      return;
    turn = turnWithStatus(turn, "completed");
    emitTurn(true);
  };
  return {
    steers,
    starts,
    attachments,
    getSnapshot: () => capabilities,
    confirmAttachment: () => {
      attachments.getSnapshot()[0]?.resolve(baseline);
    },
    completeTurn,
    subscribe: (listener: () => void) => listeners.subscribe(listener),
    isReady: () => ready,
    start() {
      if (lifecycle != null || disposed) return;
      lifecycle = startStorybookConnectionLifecycle({
        dispatch,
        newSessionOwner,
        authorization,
        threadId: questionThreadId,
        persistence: { authorizationContext: authorization.getPersistenceContext(), storage },
        getCapabilities: () => capabilities,
        patch,
        prepare,
        startConnection: (options) => {
          connection = options;
          const timer = window.setTimeout(() => {
            options.onStatus?.({ label: "initialized" });
            options.onCommandsReady?.(commands);
          }, 0);
          return () => {
            window.clearTimeout(timer);
          };
        },
      });
      function prepare(controller: ActiveThreadSessionController) {
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
        if (preset !== "history") emitItem(questionItem);
        if (preset === "idle") completeTurn();
        if (preset === "disconnected") {
          snapshot.questions.edit(questionKey(turn.id, "questions", 0), "Retained answer draft");
          connection?.onCommandsUnavailable?.();
          connection?.onStatus?.({ label: "closed" });
        }
        ready = true;
        listeners.notify();
      }
    },
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
      lifecycle?.dispose();
      for (const request of steers.getSnapshot())
        request.reject(new Error("Question preview disposed"));
      for (const request of starts.getSnapshot())
        request.reject(new Error("Question preview disposed"));
      for (const request of attachments.getSnapshot())
        request.reject(new Error("Question preview disposed"));
      fallback.dispose();
      listeners.clear();
    },
  };
}
