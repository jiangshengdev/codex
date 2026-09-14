import type { ActiveThreadComposerRole } from "@/features/activeThreadSession/activeThreadSession";
import {
  createComposerInputQueueCoordinator,
  type CreateComposerInputQueueCoordinatorInput,
} from "@/features/composerInputQueue/composerInputQueueCoordinator";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import {
  eventTurnCompleted,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  baseTurn,
  eventForThreadOwner,
  turnCompleted,
  turnStarted,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createListenerSet } from "@/subscriptions/listenerSet";

type Commands = CreateComposerInputQueueCoordinatorInput;

export function manualRequests<Params, Result>() {
  const listeners = createListenerSet();
  let requests: readonly Readonly<{
    params: Params;
    resolve(value: Result): void;
    reject(error: Error): void;
  }>[] = [];
  return {
    getSnapshot: () => requests,
    subscribe: listeners.subscribe,
    issue(params: Params): Promise<Result> {
      return new Promise((resolve, reject) => {
        const settle = () => {
          requests = requests.filter((item) => item !== request);
          listeners.notify();
        };
        const request = {
          params,
          resolve(value: Result) {
            settle();
            resolve(value);
          },
          reject(error: Error) {
            settle();
            reject(error);
          },
        };
        requests = [...requests, request];
        listeners.notify();
      });
    },
  };
}

export type PendingInputScenarioOptions = Readonly<{
  ordinaryCount?: number;
  guidingCount?: number;
  longText?: boolean;
  startSending?: boolean;
}>;

export function createPendingInputScenario({
  ordinaryCount = 3,
  guidingCount = 0,
  longText = false,
  startSending = false,
}: PendingInputScenarioOptions = {}) {
  const records = new Map<string, string>();
  const starts = manualRequests<
    Parameters<Commands["startTurn"]>[0],
    Awaited<ReturnType<Commands["startTurn"]>>
  >();
  const steers = manualRequests<
    Parameters<Commands["steerTurn"]>[0],
    Awaited<ReturnType<Commands["steerTurn"]>>
  >();
  const interrupts = manualRequests<
    Parameters<Commands["interruptTurn"]>[0],
    Awaited<ReturnType<Commands["interruptTurn"]>>
  >();
  const coordinator = createComposerInputQueueCoordinator({
    threadId: "thread-1",
    activeTurnId: "preview-active",
    persistence: {
      authorizationContext: crypto.randomUUID(),
      storage: {
        getItem: (key) => records.get(key) ?? null,
        setItem: (key, value) => {
          records.set(key, value);
        },
      },
    },
    startTurn: starts.issue,
    steerTurn: steers.issue,
    interruptTurn: interrupts.issue,
  });
  const role: ActiveThreadComposerRole = {
    getDraft: coordinator.getDraft,
    retainDraft: coordinator.retainDraft,
    saveDraft: (_revision, draft) => coordinator.saveDraft(draft),
    retryPersistence: () => coordinator.retryPersistence(),
    resumeRestored: (_revision, revision) => coordinator.resumeRestored(revision),
    discardUnknown: (_revision, id, revision) => coordinator.discardUnknown(id, revision),
    beginPendingInputEdit: (_revision, request, restore) =>
      coordinator.beginPendingInputEdit(request, restore),
    deletePendingInput: (_revision, request) => coordinator.deletePendingInput(request),
    movePendingInput: (_revision, request) => coordinator.movePendingInput(request),
    readPendingInputPage: coordinator.readPendingInputPage,
    readPendingInputDetail: coordinator.readPendingInputDetail,
    interruptActiveTurn: () => coordinator.interruptActiveTurn(),
    promoteOrdinaryFrontToSteer: () => coordinator.promoteOrdinaryFrontToSteer(),
    recover: () => coordinator.recover(),
    submit: (_revision, capture) => coordinator.submit(capture),
    submitSteer: (_revision, capture) => coordinator.submitSteer(capture),
  };
  for (let index = 1; index <= ordinaryCount; index++) {
    coordinator.submit(
      composerDraftCapture(
        `Ordinary message ${index}${longText && index === 1 ? " — " + "Fictional queue content. ".repeat(80) + "END OF LONG MESSAGE" : ""}`,
      ),
    );
  }
  for (let index = 1; index <= guidingCount; index++)
    coordinator.submitSteer(composerDraftCapture(`Guide message ${index}`));
  let eventId = 0;
  const owner = { threadId: "thread-1", subscriptionId: "preview-subscription" };
  const completeTurn = (id = "preview-active") =>
    coordinator.observeAcceptedEvent({
      replay: "live",
      notification: eventForThreadOwner(
        turnCompleted(eventTurnCompleted, `preview-completed-${++eventId}`, baseTurn(id)),
        owner,
      ),
    });
  const acceptTurn = (id: string) =>
    coordinator.observeAcceptedEvent({
      replay: "live",
      notification: eventForThreadOwner(
        turnStarted(eventTurnStarted, `preview-started-${++eventId}`, {
          ...baseTurn(id),
          status: "inProgress",
        }),
        owner,
      ),
    });
  if (startSending) completeTurn();
  return {
    coordinator,
    role,
    starts,
    steers,
    interrupts,
    completeTurn,
    acceptTurn,
    dispose: () => coordinator.dispose(),
  };
}

export type PendingInputScenario = ReturnType<typeof createPendingInputScenario>;
