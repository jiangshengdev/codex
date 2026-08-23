import { describe, expect, it, vi } from "vitest";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import { attachResponse } from "@/__tests__/appBrowserTestSupport";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type { Thread, ThreadListResponse } from "@codex-protocol/v2";
import {
  initialThreadHistoryListState,
  ThreadHistoryListOwner,
  type ThreadHistoryListState,
} from "../threadHistoryListOwner";

const thread = (id: string): Thread => ({
  ...attachResponse.snapshot.thread,
  id,
  turns: [],
});

const response = (data: Thread[], nextCursor: string | null): ThreadListResponse => ({
  data,
  nextCursor,
  backwardsCursor: null,
});

const expectedRequest = (cursor?: string) => ({
  archived: false,
  ...(cursor == null ? {} : { cursor }),
  cwd: "/workspace/project",
  limit: 25,
  sortDirection: "desc",
  sortKey: "recency_at",
});

function expectReady(owner: ThreadHistoryListOwner, ids: string[], nextCursor: string | null) {
  expect(owner.getSnapshot()).toStrictEqual({
    type: "ready",
    threads: ids.map(thread),
    nextCursor,
  });
}

const createOwner = (listThreads: GuiHostCommands["listThreads"]) => {
  const states: ThreadHistoryListState[] = [];
  const owner = new ThreadHistoryListOwner({ cwd: "/workspace/project", listThreads });
  owner.subscribe(() => states.push(owner.getSnapshot()));
  return { owner, states };
};

describe("ThreadHistoryListOwner", () => {
  it("keeps each new owner on an isolated initial snapshot and stops notifying after unsubscribe", async () => {
    const firstPage = deferred<ThreadListResponse>();
    const listThreads = vi.fn<GuiHostCommands["listThreads"]>().mockReturnValue(firstPage.promise);
    const firstOwner = new ThreadHistoryListOwner({ cwd: "/workspace/first", listThreads });
    const listener = vi.fn<() => void>();
    const unsubscribe = firstOwner.subscribe(listener);

    firstOwner.start();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    firstPage.resolve(response([thread("first-thread")], null));
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);

    const secondOwner = new ThreadHistoryListOwner({ cwd: "/workspace/second", listThreads });
    expect(secondOwner.getSnapshot()).toBe(initialThreadHistoryListState);
    expect(secondOwner.getSnapshot().threads).toStrictEqual([]);
  });

  it("requests the bounded current-cwd unarchived recency page exactly once while initial loading", async () => {
    const firstPage = deferred<ThreadListResponse>();
    const listThreads = vi.fn<GuiHostCommands["listThreads"]>().mockReturnValue(firstPage.promise);
    const { owner } = createOwner(listThreads);

    expect(owner.start()).toBe(true);
    expect(owner.start()).toBe(false);
    expect(owner.loadMore()).toBe(false);
    expect(owner.retry()).toBe(false);
    expect(listThreads).toHaveBeenCalledExactlyOnceWith(expectedRequest());

    firstPage.resolve(response([thread("thread-1")], "cursor-1"));
    await Promise.resolve();

    expectReady(owner, ["thread-1"], "cursor-1");
  });

  it("appends unique IDs in order and advances the cursor when an entire page is duplicate", async () => {
    const listThreads = vi
      .fn<GuiHostCommands["listThreads"]>()
      .mockResolvedValueOnce(response([thread("thread-1"), thread("thread-2")], "cursor-1"))
      .mockResolvedValueOnce(response([thread("thread-2"), thread("thread-3")], "cursor-2"))
      .mockResolvedValueOnce(
        response([thread("thread-1"), thread("thread-2"), thread("thread-3")], "cursor-3"),
      );
    const { owner } = createOwner(listThreads);

    owner.start();
    await Promise.resolve();
    expect(owner.loadMore()).toBe(true);
    expect(owner.loadMore()).toBe(false);
    await Promise.resolve();

    expect(listThreads).toHaveBeenNthCalledWith(2, expectedRequest("cursor-1"));
    expectReady(owner, ["thread-1", "thread-2", "thread-3"], "cursor-2");

    expect(owner.loadMore()).toBe(true);
    await Promise.resolve();
    expectReady(owner, ["thread-1", "thread-2", "thread-3"], "cursor-3");
  });

  it("ignores an in-flight settlement after disposal and rejects every later operation", async () => {
    const firstPage = deferred<ThreadListResponse>();
    const listThreads = vi.fn<GuiHostCommands["listThreads"]>().mockReturnValue(firstPage.promise);
    const { owner, states } = createOwner(listThreads);

    owner.start();
    const stateCountBeforeDispose = states.length;
    owner.dispose();
    firstPage.resolve(response([thread("stale-thread")], null));
    await Promise.resolve();

    expect(states).toHaveLength(stateCountBeforeDispose);
    expect(owner.start()).toBe(false);
    expect(owner.loadMore()).toBe(false);
    expect(owner.retry()).toBe(false);
  });

  it("publishes the complete initial error and retries the first page", async () => {
    const failure = new Error("initial raw failure");
    const listThreads = vi
      .fn<GuiHostCommands["listThreads"]>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(response([thread("thread-recovered")], null));
    const { owner } = createOwner(listThreads);

    owner.start();
    await Promise.resolve();
    expect(owner.getSnapshot()).toStrictEqual({
      type: "initialError",
      threads: [],
      nextCursor: null,
      error: failure,
    });

    expect(owner.retry()).toBe(true);
    expect(owner.retry()).toBe(false);
    await Promise.resolve();
    expect(listThreads.mock.calls[1]?.[0]).toStrictEqual(listThreads.mock.calls[0]?.[0]);
    expectReady(owner, ["thread-recovered"], null);
  });

  it("preserves the loaded page and cursor across append failure and retry", async () => {
    const failure = new Error("append raw failure");
    const retryPage = deferred<ThreadListResponse>();
    const listThreads = vi
      .fn<GuiHostCommands["listThreads"]>()
      .mockResolvedValueOnce(response([thread("thread-1")], "cursor-1"))
      .mockRejectedValueOnce(failure)
      .mockReturnValueOnce(retryPage.promise);
    const { owner } = createOwner(listThreads);

    owner.start();
    await Promise.resolve();
    owner.loadMore();
    await Promise.resolve();
    expect(owner.getSnapshot()).toStrictEqual({
      type: "appendError",
      threads: [thread("thread-1")],
      nextCursor: "cursor-1",
      error: failure,
    });

    expect(owner.retry()).toBe(true);
    expect(owner.retry()).toBe(false);
    expect(listThreads.mock.calls[2]?.[0]).toStrictEqual(listThreads.mock.calls[1]?.[0]);
    retryPage.resolve(response([thread("thread-2")], null));
    await Promise.resolve();
    expectReady(owner, ["thread-1", "thread-2"], null);
  });
});
