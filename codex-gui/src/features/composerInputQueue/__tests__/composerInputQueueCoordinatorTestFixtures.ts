import { vi } from "vitest";
import type { ActiveThreadProjectionAcceptedEvent } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  eventWithEnvelope,
  userMessage,
} from "@/features/projection/__tests__/projectionTestBuilders";
import type { ThreadItem } from "@codex-protocol/v2";
import {
  createComposerInputQueueCoordinator,
  type ComposerInputQueueCoordinator,
  type CreateComposerInputQueueCoordinatorInput,
} from "../composerInputQueueCoordinator";

export type StartTurn = CreateComposerInputQueueCoordinatorInput["startTurn"];
export type SteerTurn = CreateComposerInputQueueCoordinatorInput["steerTurn"];
export type InterruptTurn = CreateComposerInputQueueCoordinatorInput["interruptTurn"];

type CreateCoordinatorOptions = Omit<CreateComposerInputQueueCoordinatorInput, "interruptTurn"> &
  Partial<Pick<CreateComposerInputQueueCoordinatorInput, "interruptTurn">>;

type StartResponse = Awaited<ReturnType<StartTurn>>;
type PendingInputPage = Extract<
  ReturnType<ComposerInputQueueCoordinator["readPendingInputPage"]>,
  { type: "page" }
>;
type UserMessage = Extract<ThreadItem, { type: "userMessage" }>;

export function createCoordinator(
  options: CreateCoordinatorOptions,
): ComposerInputQueueCoordinator {
  return createComposerInputQueueCoordinator({
    ...options,
    interruptTurn: options.interruptTurn ?? vi.fn<InterruptTurn>(),
  });
}

export function deferredStart() {
  let resolve!: (response: StartResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<StartResponse>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function live(
  notification: ActiveThreadProjectionAcceptedEvent["notification"],
): ActiveThreadProjectionAcceptedEvent {
  return {
    notification: eventWithEnvelope(notification, { threadId: "thread-1" }),
    replay: "live",
  };
}

export function pendingItem(
  coordinator: ComposerInputQueueCoordinator,
  lane: Parameters<ComposerInputQueueCoordinator["readPendingInputPage"]>[0]["lane"],
  index = 0,
): PendingInputPage["items"][number] {
  const page = coordinator.readPendingInputPage({
    lane,
    revision: coordinator.getSnapshot().detailRevision,
    cursor: null,
    limit: 10,
  });
  if (page.type !== "page" || page.items[index] == null) {
    throw new Error(`expected pending ${lane} item at index ${String(index)}`);
  }
  return page.items[index];
}

export function committedUserMessage(clientId: string): UserMessage {
  const item = userMessage("item-1", []);
  if (item.type !== "userMessage") throw new Error("userMessage builder returned another variant");
  return { ...item, clientId };
}

export function nextMicrotask(): Promise<void> {
  return Promise.resolve();
}
