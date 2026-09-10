import { describe, expect, it } from "vitest";

import { exportComposerDraft } from "@/features/composerEditor/composerDraft";

import {
  decodeComposerCoordinatorRecord,
  type ComposerCoordinatorRecord,
} from "../composerCoordinatorPersistence";
import { createComposerInputQueue } from "../composerInputQueue";
import { createComposerInterruptState } from "../composerInterruptState";
import { composerDraftCapture, composerQueueMessage } from "./composerInputQueueTestFixtures";

const threadId = "thread-one";

function emptyRecord(): ComposerCoordinatorRecord {
  return {
    version: 1,
    queue: createComposerInputQueue({ threadId, activeTurnId: null }).exportState(null),
    draft: null,
    interrupt: createComposerInterruptState().exportState(),
    failedInterruptTurnId: null,
  };
}

describe("decodeComposerCoordinatorRecord", () => {
  it("retains legacy merged-start ownership so unknown delivery can still be explicitly removed", () => {
    const queue = createComposerInputQueue({ threadId, activeTurnId: "old-turn" });
    const effect = queue.submitSteer(composerQueueMessage("merged")).effects[0];
    if (effect?.type !== "performSteer") throw new Error("Expected steer");
    queue.settleSteer({ type: "activeTurnNotSteerable", claim: effect.claim });
    queue.observe({
      type: "turnCompleted",
      turnId: "old-turn",
      status: "completed",
      commitId: "terminal",
    });
    const state = queue.exportState(null);
    const decoded = decodeComposerCoordinatorRecord(
      {
        ...emptyRecord(),
        queue: {
          ...state,
          version: 1,
          steer: {
            ...state.steer,
            closedTargets: state.steer.closedTargets.map(({ target, ...identity }) => ({
              ...identity,
              target: { reason: target.reason, rejectionBatch: target.rejectionBatch },
            })),
          },
        },
      },
      threadId,
    );
    expect(decoded.queue.start).toEqual(state.start);
    const restored = createComposerInputQueue({ threadId, activeTurnId: null });
    restored.rehydrateState(decoded.queue);
    expect(restored.unknownMessages()).toHaveLength(1);
    const unknown = restored.unknownMessages()[0];
    if (unknown == null) throw new Error("Expected unknown merged start");
    expect(restored.discardUnknown(unknown.id)).toBe(true);
    expect(restored.exportState(null).knownMessageIds).toEqual([]);
    expect(restored.view().releaseState).toEqual({ type: "safe" });
  });

  it("upgrades old target dispositions without consuming accepted messages or rewriting issuing phases", () => {
    const queue = createComposerInputQueue({ threadId, activeTurnId: "old-turn" });
    queue.submitSteer(composerQueueMessage("late"));
    queue.observe({
      type: "turnCompleted",
      turnId: "old-turn",
      status: "completed",
      commitId: "terminal",
    });
    const current = queue.exportState(null);
    const legacy = {
      ...emptyRecord(),
      queue: {
        ...current,
        version: 1,
        steer: {
          ...current.steer,
          closedTargets: current.steer.closedTargets.map(({ target, ...identity }) => ({
            ...identity,
            target: { reason: target.reason, rejectionBatch: target.rejectionBatch },
          })),
        },
      },
    };
    const original = JSON.stringify(legacy);
    const decoded = decodeComposerCoordinatorRecord(legacy, threadId);
    expect(decoded.queue.version).toBe(2);
    expect(decoded.queue.steer.pending[0]?.phase).toBe("issuing");
    expect(decoded.queue.steer.closedTargets[0]?.target.disposition).toBe("manualRecovery");
    expect(JSON.stringify(legacy)).toBe(original);
    const accepted = decodeComposerCoordinatorRecord(
      {
        ...legacy,
        queue: {
          ...legacy.queue,
          steer: {
            ...legacy.queue.steer,
            pending: legacy.queue.steer.pending.map((entry) => ({
              ...entry,
              phase: "acceptedAwaitingCommit",
            })),
          },
        },
      },
      threadId,
    );
    expect(accepted.queue.steer.pending[0]?.phase).toBe("acceptedAwaitingCommit");
    expect(accepted.queue.recovery).toBeNull();
  });

  it("validates a complete record with an editor-owned draft", () => {
    const record = {
      ...emptyRecord(),
      draft: exportComposerDraft(composerDraftCapture("saved ordinary draft").draft),
      failedInterruptTurnId: "failed-turn",
    };

    expect(decodeComposerCoordinatorRecord(record, threadId)).toEqual(record);
  });

  it("preserves issuing phases while validating a send candidate", () => {
    const queue = createComposerInputQueue({ threadId, activeTurnId: null });
    const submitted = queue.submit(composerQueueMessage("first"));
    expect(submitted.effects[0]?.type).toBe("performStart");
    const interrupt = createComposerInterruptState();
    interrupt.transition({
      type: "issue",
      params: { threadId, turnId: "active-turn" },
      generation: 1,
    });
    const record: ComposerCoordinatorRecord = {
      ...emptyRecord(),
      queue: queue.exportState(null),
      interrupt: interrupt.exportState(),
    };

    const decoded = decodeComposerCoordinatorRecord(record, threadId);

    expect(decoded).toEqual(record);
    expect(decoded.queue).toBe(record.queue);
    expect(decoded.interrupt.pending?.phase).toBe("issuing");
    expect(queue.view().releaseState).toEqual({
      type: "blocked",
      blockers: [{ type: "pendingStart", phase: "issuing" }],
    });
  });

  it.each([
    [null, "Invalid persisted composer record"],
    [[], "Invalid persisted composer record"],
    [{}, "Unsupported persisted composer record version"],
    [{ version: 2 }, "Unsupported persisted composer record version"],
  ])("rejects an invalid record envelope %j", (value, message) => {
    expect(() => decodeComposerCoordinatorRecord(value, threadId)).toThrow(message);
  });

  it.each([undefined, "", 4])("rejects an invalid failed interrupt target %j", (value) => {
    expect(() =>
      decodeComposerCoordinatorRecord({ ...emptyRecord(), failedInterruptTurnId: value }, threadId),
    ).toThrow("Invalid persisted failed interrupt target");
  });

  it("uses the editor owner's validation for draft payloads", () => {
    expect(() =>
      decodeComposerCoordinatorRecord(
        { ...emptyRecord(), draft: { version: 1, editorStateJson: "not JSON" } },
        threadId,
      ),
    ).toThrow("Invalid persisted composer draft");
  });

  it("propagates queue owner validation failures", () => {
    expect(() =>
      decodeComposerCoordinatorRecord({ ...emptyRecord(), queue: {} }, threadId),
    ).toThrow("Invalid persisted composer queue version or owner");
  });

  it("rejects a queue exported by another thread", () => {
    const queue = createComposerInputQueue({ threadId: "other-thread", activeTurnId: null });
    queue.submit(composerQueueMessage("other-message"));

    expect(() =>
      decodeComposerCoordinatorRecord(
        { ...emptyRecord(), queue: queue.exportState(null) },
        threadId,
      ),
    ).toThrow("Invalid persisted composer queue version or owner");
  });

  it("rejects a pending interrupt from another thread", () => {
    const interrupt = createComposerInterruptState();
    interrupt.transition({
      type: "issue",
      params: { threadId: "other-thread", turnId: "active-turn" },
      generation: 1,
    });

    expect(() =>
      decodeComposerCoordinatorRecord(
        { ...emptyRecord(), interrupt: interrupt.exportState() },
        threadId,
      ),
    ).toThrow("Persisted interrupt belongs to a different thread");
  });

  it("rejects recent interrupt facts from another thread", () => {
    const interrupt = createComposerInterruptState();
    interrupt.transition({
      type: "terminal",
      fact: { params: { threadId: "other-thread", turnId: "finished-turn" }, generation: 1 },
    });

    expect(() =>
      decodeComposerCoordinatorRecord(
        { ...emptyRecord(), interrupt: interrupt.exportState() },
        threadId,
      ),
    ).toThrow("Persisted interrupt belongs to a different thread");
  });

  it("propagates malformed interrupt state without replacing it with an empty value", () => {
    expect(() =>
      decodeComposerCoordinatorRecord({ ...emptyRecord(), interrupt: { pending: null } }, threadId),
    ).toThrow("Invalid persisted queue array");
  });
});
