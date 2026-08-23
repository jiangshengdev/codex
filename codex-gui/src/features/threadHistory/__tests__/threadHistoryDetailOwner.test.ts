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
  const owner = new ThreadHistoryDetailOwner({ threadId, readThread: commands.readThread });
  owner.subscribe(() => states.push(owner.getSnapshot()));
  return { owner, states };
};

describe("ThreadHistoryDetailOwner", () => {
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
