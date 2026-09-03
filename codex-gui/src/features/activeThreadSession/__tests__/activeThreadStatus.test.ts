import { describe, expect, it, vi } from "vitest";
import { createDeferred } from "@/__tests__/testDeferred";
import { createGuiHostCommands } from "@/__tests__/appBrowserTestSupport";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import type { ThreadStatus } from "@codex-protocol/v2";
import { createActiveThreadStatus } from "../activeThreadStatus";

const thread = attachBaseline.snapshot.thread;

const responseWithStatus = (status: ThreadStatus, threadId = thread.id) => ({
  thread: { ...thread, id: threadId, status },
});

describe("ActiveThreadStatus", () => {
  it("starts from the attach baseline and structurally deduplicates status reads", async () => {
    const commands = createGuiHostCommands();
    const owner = createActiveThreadStatus({
      threadId: thread.id,
      initialStatus: { type: "active", activeFlags: ["waitingOnUserInput", "waitingOnApproval"] },
      readThread: commands.readThread,
    });
    const listener = vi.fn<() => void>();
    owner.subscribe(listener);
    vi.mocked(commands.readThread).mockResolvedValueOnce(
      responseWithStatus({
        type: "active",
        activeFlags: ["waitingOnApproval", "waitingOnUserInput"],
      }),
    );

    expect(owner.getSnapshot()).toEqual({
      type: "active",
      activeFlags: ["waitingOnUserInput", "waitingOnApproval"],
    });
    owner.invalidate();
    await owner.settleInvalidations();

    expect(commands.readThread).toHaveBeenCalledExactlyOnceWith({
      threadId: thread.id,
      includeTurns: false,
    });
    expect(listener).not.toHaveBeenCalled();
  });

  it("coalesces concurrent invalidations and chases a dirty read without parallel requests", async () => {
    const commands = createGuiHostCommands();
    const first = createDeferred<Awaited<ReturnType<typeof commands.readThread>>>();
    const second = createDeferred<Awaited<ReturnType<typeof commands.readThread>>>();
    vi.mocked(commands.readThread)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const owner = createActiveThreadStatus({
      threadId: thread.id,
      initialStatus: { type: "idle" },
      readThread: commands.readThread,
    });

    owner.invalidate();
    owner.invalidate();
    const settled = owner.settleInvalidations();
    expect(commands.readThread).toHaveBeenCalledTimes(1);

    first.resolve(responseWithStatus({ type: "active", activeFlags: [] }));
    await first.promise;
    await Promise.resolve();
    expect(commands.readThread).toHaveBeenCalledTimes(2);

    second.resolve(responseWithStatus({ type: "systemError" }));
    await settled;
    expect(owner.getSnapshot()).toEqual({ type: "systemError" });
  });

  it.each([
    ["a failed read", () => Promise.reject(new Error("read failed"))],
    [
      "a mismatched thread identity",
      () => Promise.resolve(responseWithStatus({ type: "active", activeFlags: [] }, "foreign")),
    ],
  ])("publishes unknown freshness for %s", async (_, readThread) => {
    const owner = createActiveThreadStatus({
      threadId: thread.id,
      initialStatus: { type: "idle" },
      readThread,
    });
    owner.invalidate();

    await owner.settleInvalidations();

    expect(owner.getSnapshot()).toBeNull();
  });

  it("ignores a late read after disposal", async () => {
    const commands = createGuiHostCommands();
    const pending = createDeferred<Awaited<ReturnType<typeof commands.readThread>>>();
    vi.mocked(commands.readThread).mockReturnValueOnce(pending.promise);
    const owner = createActiveThreadStatus({
      threadId: thread.id,
      initialStatus: { type: "idle" },
      readThread: commands.readThread,
    });
    const listener = vi.fn<() => void>();
    owner.subscribe(listener);
    owner.invalidate();
    const settling = owner.settleInvalidations();
    owner.dispose();

    await expect(settling).resolves.toBeUndefined();

    pending.resolve(responseWithStatus({ type: "systemError" }));
    await pending.promise;
    await Promise.resolve();

    expect(owner.getSnapshot()).toEqual({ type: "idle" });
    expect(listener).not.toHaveBeenCalled();
    expect(owner.invalidate()).toBe(false);
  });
});
