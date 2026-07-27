import { describe, expect, it } from "vitest";
import {
  captureChatScrollSnapshot,
  completeChatScrollRestore,
  consumeChatScrollRestore,
  createInitialChatUiSessionState,
  updateChatDraft,
} from "../chatUiSession";

describe("chatUiSession", () => {
  it("updates the draft without changing the captured scroll session", () => {
    const captured = captureChatScrollSnapshot(createInitialChatUiSessionState(), {
      isStickyBottom: false,
      scrollTop: 640,
    });

    expect(updateChatDraft(captured, "Keep this draft")).toStrictEqual({
      draft: "Keep this draft",
      isStickyBottom: false,
      scrollTop: 640,
      pendingRestore: "pending",
    });
  });

  it("captures sticky-bottom and document-position snapshots for restoration", () => {
    const initialState = updateChatDraft(createInitialChatUiSessionState(), "Unsent prompt");

    expect(
      captureChatScrollSnapshot(initialState, {
        isStickyBottom: true,
        scrollTop: 1_280,
      }),
    ).toStrictEqual({
      draft: "Unsent prompt",
      isStickyBottom: true,
      scrollTop: 1_280,
      pendingRestore: "pending",
    });

    expect(
      captureChatScrollSnapshot(initialState, {
        isStickyBottom: false,
        scrollTop: 320,
      }),
    ).toStrictEqual({
      draft: "Unsent prompt",
      isStickyBottom: false,
      scrollTop: 320,
      pendingRestore: "pending",
    });
  });

  it("consumes each pending scroll restore exactly once", () => {
    const stickySnapshot = captureChatScrollSnapshot(createInitialChatUiSessionState(), {
      isStickyBottom: true,
      scrollTop: 900,
    });
    const stickyConsumption = consumeChatScrollRestore(stickySnapshot);

    expect(stickyConsumption).toStrictEqual({
      nextState: {
        draft: "",
        isStickyBottom: true,
        scrollTop: 900,
        pendingRestore: "restoring",
      },
      restore: { type: "stickyBottom" },
    });
    expect(consumeChatScrollRestore(stickyConsumption.nextState)).toStrictEqual({
      nextState: stickyConsumption.nextState,
      restore: null,
    });

    const positionSnapshot = captureChatScrollSnapshot(createInitialChatUiSessionState(), {
      isStickyBottom: false,
      scrollTop: 475,
    });

    expect(consumeChatScrollRestore(positionSnapshot)).toStrictEqual({
      nextState: {
        draft: "",
        isStickyBottom: false,
        scrollTop: 475,
        pendingRestore: "restoring",
      },
      restore: { type: "scrollTop", scrollTop: 475 },
    });
  });

  it("clears the pending restore only after restoration completes", () => {
    const captured = captureChatScrollSnapshot(createInitialChatUiSessionState(), {
      isStickyBottom: false,
      scrollTop: 240,
    });
    const { nextState: restoring } = consumeChatScrollRestore(captured);

    expect(completeChatScrollRestore(restoring)).toStrictEqual({
      draft: "",
      isStickyBottom: false,
      scrollTop: 240,
      pendingRestore: null,
    });
  });
});
