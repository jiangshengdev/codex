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
  turnWithStatus,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { createListenerSet } from "@/subscriptions/listenerSet";
import { mixedMessageText } from "../mixedMessageText";

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
    subscribe: (listener: () => void) => listeners.subscribe(listener),
    issue: (params: Params): Promise<Result> => {
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
  mixedText?: boolean;
  startSending?: boolean;
  persistence?: Commands["persistence"];
  activeTurnId?: Commands["activeTurnId"];
}>;

export function createPendingInputScenario({
  ordinaryCount = 3,
  guidingCount = 0,
  longText = false,
  mixedText = false,
  startSending = false,
  persistence,
  activeTurnId = "preview-active",
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
    activeTurnId,
    persistence: persistence ?? {
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
        mixedText
          ? mixedMessageText("Ordinary message", index)
          : `Ordinary message ${String(index)}${longText && index === 1 ? " — " + "Fictional queue content. ".repeat(80) + "END OF LONG MESSAGE" : ""}`,
      ),
    );
  }
  for (let index = 1; index <= guidingCount; index++)
    coordinator.submitSteer(
      composerDraftCapture(
        mixedText ? mixedMessageText("Guide message", index) : `Guide message ${String(index)}`,
      ),
    );
  const owner = { threadId: "thread-1", subscriptionId: "preview-subscription" };
  const completeTurn = (
    id = "preview-active",
    status: Parameters<typeof turnWithStatus>[1] = "completed",
  ) => {
    coordinator.observeAcceptedEvent({
      replay: "live",
      notification: eventForThreadOwner(
        turnCompleted(
          eventTurnCompleted,
          `preview-completed-${crypto.randomUUID()}`,
          turnWithStatus(baseTurn(id), status),
        ),
        owner,
      ),
    });
  };
  const acceptTurn = (id: string) => {
    coordinator.observeAcceptedEvent({
      replay: "live",
      notification: eventForThreadOwner(
        turnStarted(eventTurnStarted, `preview-started-${crypto.randomUUID()}`, {
          ...baseTurn(id),
          status: "inProgress",
        }),
        owner,
      ),
    });
  };
  if (startSending) completeTurn();
  return {
    coordinator,
    role,
    starts,
    steers,
    interrupts,
    completeTurn,
    acceptTurn,
    dispose: () => {
      coordinator.dispose();
    },
  };
}

export type PendingInputScenario = ReturnType<typeof createPendingInputScenario>;
