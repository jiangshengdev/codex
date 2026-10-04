import { expect } from "vitest";

import type {
  ComposerInputQueue,
  ComposerInputQueueTransition,
  ComposerPendingInputDisplayKey,
  ComposerPendingInputLane,
  ComposerPendingInputMoveDestination,
  StartClaim,
} from "../composerInputQueue";
import type { ComposerSteerQueue, SteerClaim } from "../composerSteerQueueState";
import { composerSteerInput } from "./composerInputQueueTestFixtures";

function readPendingPage(queue: ComposerInputQueue, lane: ComposerPendingInputLane, limit: number) {
  return queue.readPendingInputPage({
    lane,
    revision: queue.detailRevision(),
    cursor: null,
    limit,
  });
}

export function pendingPage(queue: ComposerInputQueue, lane: ComposerPendingInputLane, limit = 20) {
  const result = readPendingPage(queue, lane, limit);
  if (result.type !== "page") throw new Error(`expected ${lane} pending-input page`);
  return result;
}

export function expectPendingPage(
  queue: ComposerInputQueue,
  lane: ComposerPendingInputLane,
  limit = 100,
) {
  const result = readPendingPage(queue, lane, limit);
  expect(result.type).toBe("page");
  if (result.type !== "page") throw new Error(`expected ${lane} detail page`);
  return result;
}

export function pageIds(queue: ComposerInputQueue, lane: ComposerPendingInputLane): string[] {
  return pendingPage(queue, lane).items.map(({ preview }) => {
    if (preview.type !== "text") throw new Error("expected text preview");
    return preview.text.replace("message ", "");
  });
}

export function keyFor(
  queue: ComposerInputQueue,
  lane: ComposerPendingInputLane,
  messageId: string,
): ComposerPendingInputDisplayKey {
  const item = pendingPage(queue, lane).items.find(({ preview }) => {
    return preview.type === "text" && preview.text === `message ${messageId}`;
  });
  if (item == null) throw new Error(`expected pending input ${messageId}`);
  return item.key;
}

export function move(
  queue: ComposerInputQueue,
  lane: ComposerPendingInputLane,
  messageId: string,
  destination: ComposerPendingInputMoveDestination,
) {
  return queue.movePendingInput({
    key: keyFor(queue, lane, messageId),
    revision: queue.detailRevision(),
    destination,
  });
}

export function startClaim(transition: ComposerInputQueueTransition): StartClaim {
  const effect = transition.effects.find((candidate) => candidate.type === "performStart");
  if (effect?.type !== "performStart") throw new Error("expected start claim");
  return effect.claim;
}

export function firstStartClaim(transition: ComposerInputQueueTransition): StartClaim {
  const effect = transition.effects[0];
  expect(effect?.type).toBe("performStart");
  if (effect?.type !== "performStart") {
    throw new Error("expected performStart effect");
  }
  return effect.claim;
}

export function steerClaim(transition: ComposerInputQueueTransition): SteerClaim {
  const effect = transition.effects.find((candidate) => candidate.type === "performSteer");
  if (effect?.type !== "performSteer") throw new Error("expected steer claim");
  return effect.claim;
}

export function enqueueSteer(
  queue: ComposerSteerQueue,
  messageId: string,
  expectedTurnId = "turn-a",
): void {
  expect(
    queue.transition({ type: "enqueue", input: composerSteerInput(messageId, expectedTurnId) }),
  ).toEqual({ type: "enqueued", messageId });
}

export function steerQueueIds(queue: ComposerSteerQueue): string[] {
  return queue
    .state()
    .steerQueue.map((slot) =>
      slot.type === "intent" ? slot.message.id : slot.original.message.id,
    );
}
