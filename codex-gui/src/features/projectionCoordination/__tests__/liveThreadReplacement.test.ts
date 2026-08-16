import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachBaseline,
  attachReplacement,
} from "@/features/projection/__tests__/projectionFixtures";
import { attachWithThreadId } from "@/features/projection/__tests__/projectionTestBuilders";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
} from "@/features/threadIdentity/threadIdentitySlice";
import {
  threadRuntimeAttached,
  threadRuntimeSlice,
} from "@/features/threadRuntime/threadRuntimeSlice";
import { buildLiveThreadReplacementRecord } from "../buildLiveThreadReplacementRecord";
import { liveThreadReplacementCommitted } from "../liveThreadReplacement";

describe("live thread replacement", () => {
  it("atomically replaces every live-thread slice with one shared action", () => {
    const store = makeStore();
    const oldThreadId = attachBaseline.snapshot.thread.id;
    store.dispatch(launchThreadIdRecorded(oldThreadId));
    store.dispatch(attachedThreadIdObserved(oldThreadId));
    store.dispatch(threadRuntimeAttached(attachBaseline));
    const previous = store.getState();

    const candidateThreadId = "00000000-0000-0000-0000-000000000002";
    const candidate = attachWithThreadId(attachReplacement, candidateThreadId);
    const record = buildLiveThreadReplacementRecord(candidate);
    const action = liveThreadReplacementCommitted(record);
    const dispatched: (typeof action)[] = [];
    const dispatch = (next: typeof action): void => {
      dispatched.push(next);
      store.dispatch(next);
    };

    dispatch(action);

    expect(dispatched).toStrictEqual([action]);
    expect(store.getState()).toStrictEqual({
      threadIdentity: {
        launchThreadId: candidateThreadId,
        attachedThreadId: candidateThreadId,
        attachStatus: "attached",
      },
      threadRuntime: threadRuntimeSlice.reducer(undefined, threadRuntimeAttached(candidate)),
      transcriptState: record.transcriptState,
    });
    expect(store.getState().threadRuntime).not.toStrictEqual(previous.threadRuntime);
    expect(store.getState().transcriptState).not.toStrictEqual(previous.transcriptState);
    expect(store.getState().threadIdentity.launchThreadId).not.toBe(oldThreadId);
    expect(store.getState().threadRuntime.current?.threadId).not.toBe(oldThreadId);
    expect(store.getState().transcriptState.threadId).not.toBe(oldThreadId);
  });
});
