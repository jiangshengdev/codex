import { describe, expect, it, vi } from "vitest";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import { attachResponse, createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import {
  attachWithThreadId,
  attachWithTurns,
} from "@/features/projection/__tests__/projectionTestBuilders";
import { buildTranscriptStateFromTurns } from "@/features/transcriptState/transcriptStateImplementation";
import {
  ThreadHistoryDetailOwner,
  type ThreadHistoryDetailState,
} from "../threadHistoryDetailOwner";

type ReadThreadResponse = Awaited<ReturnType<GuiHostCommands["readThread"]>>;

const response = (threadId: string): ReadThreadResponse => ({
  thread: attachWithThreadId(attachWithTurns(attachResponse, []), threadId).snapshot.thread,
});

const createOwner = (commands: GuiHostCommands, threadId = "history-thread") => {
  const states: ThreadHistoryDetailState[] = [];
  const owner = new ThreadHistoryDetailOwner({ threadId });
  owner.setReadThread(commands.readThread);
  owner.subscribe(() => states.push(owner.getSnapshot()));
  return { owner, states };
};

describe("ThreadHistoryDetailOwner", () => {
  it.each(["success", "failure"])(
    "keeps the current retry pending when a replaced request settles with %s",
    async (settlement) => {
      const oldRead = deferred<ReadThreadResponse>();
      const newRead = deferred<ReadThreadResponse>();
      const commandsA = createGuiHostCommands();
      const commandsB = createGuiHostCommands();
      vi.mocked(commandsA.readThread).mockReturnValueOnce(oldRead.promise);
      vi.mocked(commandsB.readThread).mockReturnValueOnce(newRead.promise);
      const { owner, states } = createOwner(commandsA);
      owner.start();
      owner.setReadThread(null);
      expect(owner.getSnapshot()).toStrictEqual({
        type: "error",
        error: new Error("Task history read was interrupted because the connection changed."),
      });
      expect(owner.retry()).toBe(false);
      owner.setReadThread(commandsB.readThread);
      expect(commandsB.readThread).not.toHaveBeenCalled();
      expect(owner.retry()).toBe(true);
      const pending = owner.getSnapshot();
      const count = states.length;

      if (settlement === "success") {
        oldRead.resolve(response("history-thread"));
      } else {
        oldRead.reject(new Error("obsolete failure"));
      }
      await Promise.resolve();
      expect(owner.getSnapshot()).toBe(pending);
      expect(states).toHaveLength(count);
      expect(owner.retry()).toBe(false);

      newRead.resolve(response("history-thread"));
      await Promise.resolve();
      expect(owner.getSnapshot()).toStrictEqual({
        type: "ready",
        thread: response("history-thread").thread,
        transcriptState: buildTranscriptStateFromTurns([]),
      });
      expect(commandsB.readThread).toHaveBeenCalledExactlyOnceWith({
        threadId: "history-thread",
        includeTurns: true,
      });
    },
  );

  it("does not interrupt a request when the same capability is published again", async () => {
    const read = deferred<ReadThreadResponse>();
    const commands = createGuiHostCommands();
    vi.mocked(commands.readThread).mockReturnValueOnce(read.promise);
    const { owner, states } = createOwner(commands);
    owner.start();
    const pending = owner.getSnapshot();
    const count = states.length;
    owner.setReadThread(commands.readThread);
    expect(owner.getSnapshot()).toBe(pending);
    expect(states).toHaveLength(count);
    read.resolve(response("history-thread"));
    await Promise.resolve();
    expect(owner.getSnapshot()).toStrictEqual({
      type: "ready",
      thread: response("history-thread").thread,
      transcriptState: buildTranscriptStateFromTurns([]),
    });
    expect(commands.readThread).toHaveBeenCalledTimes(1);
  });

  it("waits for its first capability but never starts a read after disposal", () => {
    const owner = new ThreadHistoryDetailOwner({ threadId: "history-thread" });
    const commands = createGuiHostCommands();
    expect(owner.start()).toBe(true);
    expect(owner.getSnapshot()).toStrictEqual({ type: "waitingForConnection" });
    expect(owner.retry()).toBe(false);
    owner.dispose();
    owner.setReadThread(commands.readThread);
    expect(owner.start()).toBe(false);
    expect(owner.retry()).toBe(false);
    expect(commands.readThread).not.toHaveBeenCalled();
  });

  it("retains each read failure during retry and ignores a disposed retry settlement", async () => {
    const firstFailure = new Error("first read failure");
    const nextFailure = new Error("second read failure");
    const retryRead = deferred<ReadThreadResponse>();
    const finalRead = deferred<ReadThreadResponse>();
    const commands = createGuiHostCommands();
    vi.mocked(commands.readThread)
      .mockRejectedValueOnce(firstFailure)
      .mockReturnValueOnce(retryRead.promise)
      .mockReturnValueOnce(finalRead.promise);
    const { owner, states } = createOwner(commands);
    owner.start();
    await Promise.resolve();
    expect(owner.retry()).toBe(true);
    expect(owner.getSnapshot()).toStrictEqual({ type: "retrying", error: firstFailure });
    expect(owner.retry()).toBe(false);
    retryRead.reject(nextFailure);
    await Promise.resolve();
    expect(owner.getSnapshot()).toStrictEqual({ type: "error", error: nextFailure });
    expect(owner.retry()).toBe(true);
    expect(owner.getSnapshot()).toStrictEqual({ type: "retrying", error: nextFailure });
    const count = states.length;
    owner.dispose();
    finalRead.resolve(response("history-thread"));
    await Promise.resolve();
    expect(states).toHaveLength(count);
    expect(commands.readThread).toHaveBeenCalledTimes(3);
  });

  it("reads the complete thread exactly once and makes empty turns ready without resuming", async () => {
    const commands = createGuiHostCommands();
    vi.mocked(commands.readThread).mockResolvedValueOnce(response("history-thread"));
    const { owner } = createOwner(commands);

    expect(owner.start()).toBe(true);
    expect(owner.start()).toBe(false);
    expect(owner.retry()).toBe(false);
    expect(commands.readThread).toHaveBeenCalledExactlyOnceWith({
      threadId: "history-thread",
      includeTurns: true,
    });

    await Promise.resolve();

    expect(owner.getSnapshot()).toStrictEqual({
      type: "ready",
      thread: response("history-thread").thread,
      transcriptState: buildTranscriptStateFromTurns([]),
    });
    expect(commands.resumeThread).not.toHaveBeenCalled();
  });

  it("rejects a mismatched thread identity and retries the original thread", async () => {
    const commands = createGuiHostCommands();
    vi.mocked(commands.readThread)
      .mockResolvedValueOnce(response("different-thread"))
      .mockResolvedValueOnce(response("history-thread"));
    const { owner } = createOwner(commands);

    owner.start();
    await Promise.resolve();

    expect(commands.readThread).toHaveBeenNthCalledWith(1, {
      threadId: "history-thread",
      includeTurns: true,
    });
    expect(owner.getSnapshot()).toStrictEqual({
      type: "error",
      error: new Error("thread/read returned a different thread identity"),
    });

    expect(owner.retry()).toBe(true);
    await Promise.resolve();

    expect(commands.readThread).toHaveBeenNthCalledWith(2, {
      threadId: "history-thread",
      includeTurns: true,
    });
    expect(owner.getSnapshot()).toStrictEqual({
      type: "ready",
      thread: response("history-thread").thread,
      transcriptState: buildTranscriptStateFromTurns([]),
    });
    expect(commands.resumeThread).not.toHaveBeenCalled();
  });

  it("publishes the complete read error and retries the same thread", async () => {
    const failure = new Error("read raw failure");
    const commands = createGuiHostCommands();
    vi.mocked(commands.readThread)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(response("history-thread"));
    const { owner } = createOwner(commands);

    owner.start();
    await Promise.resolve();
    expect(owner.getSnapshot()).toStrictEqual({ type: "error", error: failure });

    expect(owner.retry()).toBe(true);
    expect(owner.retry()).toBe(false);
    await Promise.resolve();

    expect(commands.readThread).toHaveBeenNthCalledWith(2, {
      threadId: "history-thread",
      includeTurns: true,
    });
    expect(owner.getSnapshot()).toStrictEqual({
      type: "ready",
      thread: response("history-thread").thread,
      transcriptState: buildTranscriptStateFromTurns([]),
    });
    expect(commands.resumeThread).not.toHaveBeenCalled();
  });

  it("invalidates the pending generation on disposal so its stale response cannot publish", async () => {
    const readRequest = deferred<ReadThreadResponse>();
    const commands = createGuiHostCommands();
    vi.mocked(commands.readThread).mockReturnValueOnce(readRequest.promise);
    const { owner, states } = createOwner(commands);

    owner.start();
    const stateCountBeforeDispose = states.length;
    const snapshotBeforeDispose = owner.getSnapshot();
    owner.dispose();
    readRequest.resolve(response("disposed-thread"));
    await Promise.resolve();

    expect(states).toHaveLength(stateCountBeforeDispose);
    expect(owner.getSnapshot()).toBe(snapshotBeforeDispose);
    expect(owner.start()).toBe(false);
    expect(owner.retry()).toBe(false);
    expect(commands.resumeThread).not.toHaveBeenCalled();
  });
});
