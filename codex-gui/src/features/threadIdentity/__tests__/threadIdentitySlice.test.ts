import { describe, expect, it } from "vitest";
import { makeStore } from "@/app/store";
import {
  attachedThreadIdObserved,
  launchThreadIdRecorded,
  selectThreadIdentityState,
  threadIdentitySlice,
  type GuiThreadIdentityState,
} from "../threadIdentitySlice";

const reduce = (
  state: GuiThreadIdentityState | undefined,
  action: ReturnType<typeof launchThreadIdRecorded> | ReturnType<typeof attachedThreadIdObserved>,
) => threadIdentitySlice.reducer(state, action);

describe("thread identity reducer", () => {
  it("records launch thread id without marking the identity as attached", () => {
    const state = reduce(undefined, launchThreadIdRecorded("thread-launch"));

    expect(state).toStrictEqual({
      launchThreadId: "thread-launch",
      attachedThreadId: null,
      attachStatus: "none",
    });
  });

  it("marks matching attach thread id as attached", () => {
    const launched = reduce(undefined, launchThreadIdRecorded("thread-1"));

    const state = reduce(launched, attachedThreadIdObserved("thread-1"));

    expect(state).toStrictEqual({
      launchThreadId: "thread-1",
      attachedThreadId: "thread-1",
      attachStatus: "attached",
    });
  });

  it("marks mismatched attach thread id as mismatch", () => {
    const launched = reduce(undefined, launchThreadIdRecorded("thread-launch"));

    const state = reduce(launched, attachedThreadIdObserved("thread-attached"));

    expect(state).toStrictEqual({
      launchThreadId: "thread-launch",
      attachedThreadId: "thread-attached",
      attachStatus: "mismatch",
    });
  });

  it("resets attached identity when a new launch thread id is recorded", () => {
    const launched = reduce(undefined, launchThreadIdRecorded("thread-1"));
    const attached = reduce(launched, attachedThreadIdObserved("thread-1"));

    const state = reduce(attached, launchThreadIdRecorded("thread-2"));

    expect(state).toStrictEqual({
      launchThreadId: "thread-2",
      attachedThreadId: null,
      attachStatus: "none",
    });
  });

  it("registers thread identity state in the app store", () => {
    const store = makeStore();

    expect(selectThreadIdentityState(store.getState())).toStrictEqual({
      launchThreadId: null,
      attachedThreadId: null,
      attachStatus: "none",
    });
  });
});
