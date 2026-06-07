import { describe, expect, it } from "vitest";
import attachBaselineJson from "../__fixtures__/attach-baseline.json";
import type { Thread, ThreadProjectionAttachResponse } from "@codex-protocol/v2";
import {
  launchPrimaryThread,
  selectActiveThreadId,
  selectChildThreadIds,
  selectParentThreadId,
  selectPrimaryThreadId,
  selectThreadById,
  threadMetadataAttached,
  threadRootSlice,
} from "../threadRootSlice";

const attachBaseline = attachBaselineJson as ThreadProjectionAttachResponse;
const primaryThread: Thread = {
  ...attachBaseline.snapshot.thread,
  parentThreadId: attachBaseline.snapshot.thread.parentThreadId ?? null,
};

const reduce = (
  actions: (ReturnType<typeof launchPrimaryThread> | ReturnType<typeof threadMetadataAttached>)[],
) => actions.reduce(threadRootSlice.reducer, threadRootSlice.getInitialState());

const threadWith = (overrides: Partial<Thread>): Thread => ({
  ...primaryThread,
  id: "00000000-0000-0000-0000-000000000101",
  sessionId: "00000000-0000-0000-0000-000000000101",
  parentThreadId: null,
  turns: [],
  ...overrides,
});

const expectedThreadMetadata = (thread: Thread): Omit<Thread, "turns"> => {
  const metadata = { ...thread };
  delete (metadata as Partial<Thread>).turns;
  return metadata;
};

describe("thread root reducer", () => {
  it("initializes primary and active thread ids from launch params", () => {
    const state = reduce([launchPrimaryThread({ threadId: primaryThread.id })]);

    expect(selectPrimaryThreadId({ threadRoot: state })).toBe(primaryThread.id);
    expect(selectActiveThreadId({ threadRoot: state })).toBe(primaryThread.id);
  });

  it("stores thread metadata without nested turns", () => {
    const state = reduce([
      launchPrimaryThread({ threadId: primaryThread.id }),
      threadMetadataAttached(primaryThread),
    ]);

    const record = selectThreadById({ threadRoot: state }, primaryThread.id);
    expect(record).toStrictEqual(expectedThreadMetadata(primaryThread));
    expect(record).not.toHaveProperty("turns");
  });

  it("registers a metadata-only child thread in the graph", () => {
    const child = threadWith({
      id: "00000000-0000-0000-0000-000000000102",
      sessionId: primaryThread.sessionId,
      parentThreadId: primaryThread.id,
      agentNickname: "Scout",
      agentRole: "explorer",
    });

    const state = reduce([
      launchPrimaryThread({ threadId: primaryThread.id }),
      threadMetadataAttached(primaryThread),
      threadMetadataAttached(child),
    ]);

    expect(selectParentThreadId({ threadRoot: state }, child.id)).toBe(primaryThread.id);
    expect(selectChildThreadIds({ threadRoot: state }, primaryThread.id)).toStrictEqual([child.id]);
    expect(selectThreadById({ threadRoot: state }, child.id)?.agentNickname).toBe("Scout");
  });

  it("moves a thread between parents without rebuilding the whole graph", () => {
    const oldParent = threadWith({
      id: "00000000-0000-0000-0000-000000000201",
      sessionId: primaryThread.sessionId,
      parentThreadId: primaryThread.id,
    });
    const newParent = threadWith({
      id: "00000000-0000-0000-0000-000000000202",
      sessionId: primaryThread.sessionId,
      parentThreadId: primaryThread.id,
    });
    const sibling = threadWith({
      id: "00000000-0000-0000-0000-000000000203",
      sessionId: primaryThread.sessionId,
      parentThreadId: oldParent.id,
    });
    const movingChild = threadWith({
      id: "00000000-0000-0000-0000-000000000204",
      sessionId: primaryThread.sessionId,
      parentThreadId: oldParent.id,
    });
    const movedChild = {
      ...movingChild,
      parentThreadId: newParent.id,
    };

    const state = reduce([
      launchPrimaryThread({ threadId: primaryThread.id }),
      threadMetadataAttached(primaryThread),
      threadMetadataAttached(oldParent),
      threadMetadataAttached(newParent),
      threadMetadataAttached(sibling),
      threadMetadataAttached(movingChild),
      threadMetadataAttached(movedChild),
    ]);

    expect(selectChildThreadIds({ threadRoot: state }, oldParent.id)).toStrictEqual([sibling.id]);
    expect(selectChildThreadIds({ threadRoot: state }, newParent.id)).toStrictEqual([
      movingChild.id,
    ]);
    expect(selectThreadById({ threadRoot: state }, sibling.id)).toStrictEqual(
      expectedThreadMetadata(sibling),
    );
    expect(selectThreadById({ threadRoot: state }, movingChild.id)).toStrictEqual(
      expectedThreadMetadata(movedChild),
    );
  });
});
