import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  activeThreadReadModelSlotCreated,
  activeThreadReadModelTransitionApplied,
  buildActiveThreadCandidateReadModelTransition,
} from "@/features/activeThreadSession/activeThreadSessionReadModel";
import type { ActiveThreadProjectionReadModelFact } from "@/features/activeThreadSession/activeThreadProjectionFacts";
import {
  attachBaseline,
  attachReplacement,
  eventTokenUsageUpdated,
  eventTurnStarted,
} from "@/features/projection/__tests__/projectionFixtures";
import {
  selectThreadRuntimeRecord,
  selectThreadRuntimeThreadId,
  selectThreadRuntimeTokenUsage,
  threadRuntimeSlice,
  type ThreadRuntimeState,
} from "../threadRuntimeSlice";

const identity = { threadId: attachBaseline.snapshot.thread.id, instanceId: "test-runtime" };

const transition = (
  sessionRevision: number,
  facts: readonly ActiveThreadProjectionReadModelFact[],
) => activeThreadReadModelTransitionApplied({ identity, sessionRevision, facts });

const reduce = (
  state: ThreadRuntimeState | undefined,
  sessionRevision: number,
  facts: readonly ActiveThreadProjectionReadModelFact[],
) =>
  threadRuntimeSlice.reducer(
    state ?? threadRuntimeSlice.reducer(undefined, activeThreadReadModelSlotCreated(identity)),
    transition(sessionRevision, facts),
  );

const runtimeRoot = (state: ThreadRuntimeState) => ({ threadRuntime: state });

describe("thread runtime derived read model", () => {
  it("registers only display state in the app store", () => {
    const store = makeStore();

    expect(store.getState()).not.toHaveProperty("threadIdentity");
    expect(store.getState().threadRuntime).toStrictEqual({
      byThreadId: {},
    });
    expect(selectThreadRuntimeRecord(store.getState(), identity.threadId)).toBeNull();
    expect(selectThreadRuntimeThreadId(store.getState(), identity.threadId)).toBeNull();
    expect(selectThreadRuntimeTokenUsage(store.getState(), identity.threadId)).toBeNull();
  });

  it("derives a revision-tagged display baseline from one session transition", () => {
    const action = activeThreadReadModelTransitionApplied(
      buildActiveThreadCandidateReadModelTransition(identity, 1, attachBaseline),
    );
    const state = threadRuntimeSlice.reducer(
      threadRuntimeSlice.reducer(undefined, activeThreadReadModelSlotCreated(identity)),
      action,
    );
    const { turns, status, ...thread } = attachBaseline.snapshot.thread;

    expect(turns).toBe(attachBaseline.snapshot.thread.turns);
    expect(status).toBe(attachBaseline.snapshot.thread.status);
    expect(state.byThreadId[identity.threadId]).toStrictEqual({
      identity,
      sessionRevision: 1,
      current: {
        sessionRevision: 1,
        threadId: attachBaseline.snapshot.thread.id,
        thread,
        tokenUsage: attachBaseline.snapshot.tokenUsage,
      },
    });
    expect(selectThreadRuntimeRecord(runtimeRoot(state), identity.threadId)).toStrictEqual(
      state.byThreadId[identity.threadId]?.current,
    );
    expect(selectThreadRuntimeThreadId(runtimeRoot(state), identity.threadId)).toBe(
      attachBaseline.snapshot.thread.id,
    );
    expect(selectThreadRuntimeTokenUsage(runtimeRoot(state), identity.threadId)).toBe(
      attachBaseline.snapshot.tokenUsage,
    );
    expect(state.byThreadId[identity.threadId]?.current?.thread).not.toHaveProperty("status");
  });

  it("updates display token usage from an accepted fact in the same transition", () => {
    if (eventTokenUsageUpdated.event.type !== "tokenUsageUpdated") {
      throw new Error("fixture must contain a tokenUsageUpdated projection event");
    }
    const state = reduce(undefined, 2, [
      { type: "baselineAttached", response: attachBaseline },
      {
        type: "eventAccepted",
        payload: { notification: eventTokenUsageUpdated, replay: "live" },
      },
    ]);

    expect(state.byThreadId[identity.threadId]?.current?.tokenUsage).toBe(
      eventTokenUsageUpdated.event.notification.tokenUsage,
    );
    expect(selectThreadRuntimeTokenUsage(runtimeRoot(state), identity.threadId)).toBe(
      eventTokenUsageUpdated.event.notification.tokenUsage,
    );
  });

  it("applies facts in one transition and advances the display revision once", () => {
    const state = reduce(undefined, 3, [
      { type: "baselineAttached", response: attachBaseline },
      {
        type: "eventAccepted",
        payload: { notification: eventTurnStarted, replay: "live" },
      },
    ]);

    expect(state.byThreadId[identity.threadId]?.sessionRevision).toBe(3);
    expect(state.byThreadId[identity.threadId]?.current?.sessionRevision).toBe(3);
    expect(state.byThreadId[identity.threadId]?.current?.threadId).toBe(
      attachBaseline.snapshot.thread.id,
    );
  });

  it("rejects equal and stale transition replays", () => {
    const current = reduce(undefined, 5, [
      { type: "baselineAttached", response: attachReplacement },
    ]);
    const staleTokenFact: ActiveThreadProjectionReadModelFact = {
      type: "eventAccepted",
      payload: { notification: eventTokenUsageUpdated, replay: "live" },
    };
    const equal = reduce(current, 5, [staleTokenFact]);
    const stale = reduce(current, 4, [staleTokenFact]);

    expect(equal).toStrictEqual(current);
    expect(stale).toStrictEqual(current);
    expect(current.byThreadId[identity.threadId]?.current?.tokenUsage).toBeNull();
  });

  it("replaces the display baseline only on a newer session revision", () => {
    const attached = reduce(undefined, 1, [{ type: "baselineAttached", response: attachBaseline }]);
    const replaced = reduce(attached, 2, [
      { type: "baselineAttached", response: attachReplacement },
    ]);

    expect(replaced.byThreadId[identity.threadId]?.sessionRevision).toBe(2);
    expect(replaced.byThreadId[identity.threadId]?.current?.sessionRevision).toBe(2);
    expect(replaced.byThreadId[identity.threadId]?.current?.thread.name).toBe(
      "Replacement projection fixture",
    );
  });
});
