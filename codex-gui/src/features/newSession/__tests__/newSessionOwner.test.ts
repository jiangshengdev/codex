import { describe, expect, it, vi } from "vitest";
import { attachResponse, createDeferred } from "@/__tests__/appBrowserTestSupport";
import { activeThreadSessionSnapshot } from "@/features/activeThreadSession/__tests__/activeThreadSessionHarness";
import type { ActiveThreadSession } from "@/features/activeThreadSession/activeThreadSessionCollectionContracts";
import { composerDraftCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import {
  GuiHostCommandError,
  type GuiHostCommands,
} from "@/features/guiHost/guiHostCommandGateway";
import { NewSessionOwner } from "../newSessionOwner";

function setup() {
  const owner = new NewSessionOwner();
  const target = activeThreadSessionSnapshot({ threadId: "created-thread" });
  const startThread = vi.fn<GuiHostCommands["startThread"]>().mockResolvedValue({
    thread: { ...attachResponse.snapshot.thread, id: target.threadId },
    model: "gpt-5",
    modelProvider: "openai",
    serviceTier: null,
    cwd: attachResponse.snapshot.thread.cwd,
    instructionSources: [],
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: { type: "dangerFullAccess" },
    reasoningEffort: null,
  });
  const session: ActiveThreadSession = {
    getSnapshot: vi.fn<ActiveThreadSession["getSnapshot"]>(() => target),
    getHistoryCwd: () => "/x",
    getCollectionSnapshot: () => ({ viewedThreadId: target.threadId, members: [], errors: [] }),
    subscribe: () => () => undefined,
    activate: vi
      .fn<ActiveThreadSession["activate"]>()
      .mockResolvedValue({ type: "ready", threadId: target.threadId, warnings: [] }),
    view: vi.fn<ActiveThreadSession["view"]>(),
    retry: vi.fn<ActiveThreadSession["retry"]>(),
    recoverProjection: vi.fn<ActiveThreadSession["recoverProjection"]>(),
    remove: vi.fn<ActiveThreadSession["remove"]>(),
    setOperationError: vi.fn<ActiveThreadSession["setOperationError"]>(),
  };
  const connection = { commands: { startThread }, session };
  owner.setConnection(connection);
  owner.setNavigation(true, "new-1");
  owner.open("/x");
  return {
    owner,
    target,
    startThread,
    session,
    connection,
    capture: composerDraftCapture("first message"),
  };
}

describe("NewSessionOwner", () => {
  it("keeps one draft in its original directory without starting a thread", () => {
    const h = setup();
    h.owner.saveDraft(h.capture.draft);
    h.owner.setNavigation(false, "task-y");
    expect(h.owner.open("/y")).toBe(true);
    expect(h.owner.getSnapshot()).toMatchObject({ cwd: "/x", draft: h.capture.draft });
    expect(h.startThread).not.toHaveBeenCalled();
    expect(new NewSessionOwner().open(null)).toBe(false);
    expect(new NewSessionOwner().getSnapshot()).toBeNull();
  });

  it("creates with only cwd and clears input when the existing queue accepts it", async () => {
    const h = setup();
    expect(await h.owner.submit(h.capture)).toEqual({
      type: "accepted",
      threadId: h.target.threadId,
    });
    expect(h.startThread).toHaveBeenCalledExactlyOnceWith({ cwd: "/x" });
    expect(h.target.composerRole.submit).toHaveBeenCalledExactlyOnceWith(
      h.target.revision,
      h.capture,
    );
    expect(h.owner.getSnapshot()).toBeNull();
  });

  it("does not activate a late create result after navigation and reuses its ID on retry", async () => {
    const h = setup();
    const deferred = createDeferred<Awaited<ReturnType<GuiHostCommands["startThread"]>>>();
    const response = await h.startThread({ cwd: "/x" });
    h.startThread.mockClear().mockReturnValueOnce(deferred.promise);
    const submitting = h.owner.submit(h.capture);
    expect(await h.owner.submit(h.capture)).toEqual({ type: "retained" });
    h.owner.setNavigation(false, "other-task");
    deferred.resolve(response);
    await submitting;
    expect(h.session.activate).not.toHaveBeenCalled();
    expect(h.owner.getSnapshot()?.threadId).toBe(h.target.threadId);
    h.owner.setNavigation(true, "new-2");
    await h.owner.submit();
    expect(h.startThread).toHaveBeenCalledTimes(1);
    expect(h.target.composerRole.submit).toHaveBeenCalledExactlyOnceWith(
      h.target.revision,
      h.capture,
    );
  });

  it.each(["navigation", "connection"] as const)(
    "does not hand off when %s changes during activation",
    async (change) => {
      const h = setup();
      const deferred = createDeferred<Awaited<ReturnType<ActiveThreadSession["activate"]>>>();
      vi.mocked(h.session.activate).mockReturnValue(deferred.promise);
      const submitting = h.owner.submit(h.capture);
      await Promise.resolve();
      if (change === "navigation") h.owner.setNavigation(false, "history");
      else h.owner.setConnection(null);
      deferred.resolve({ type: "ready", threadId: h.target.threadId, warnings: [] });
      await submitting;
      expect(h.target.composerRole.submit).not.toHaveBeenCalled();
      expect(h.owner.getSnapshot()).toMatchObject({
        threadId: h.target.threadId,
        draft: h.capture.draft,
      });
    },
  );

  it.each(["definitelyNotAccepted", "deliveryUnknown"] as const)(
    "retains %s creation failure for explicit retry",
    async (delivery) => {
      const h = setup();
      h.startThread.mockRejectedValueOnce(
        new GuiHostCommandError({ source: "unavailable", delivery, error: new Error("lost") }),
      );
      await h.owner.submit(h.capture);
      expect(h.owner.getSnapshot()).toMatchObject({
        threadId: null,
        phase: "failed",
        failure: { stage: "create", delivery },
      });
      expect(h.target.composerRole.submit).not.toHaveBeenCalled();
      expect(h.startThread).toHaveBeenCalledTimes(1);
      await h.owner.submit();
      expect(h.startThread).toHaveBeenCalledTimes(2);
    },
  );

  it("retains the known ID and original capture after initialization failure", async () => {
    const h = setup();
    vi.mocked(h.session.activate).mockRejectedValueOnce(new Error("attach failed"));
    await h.owner.submit(h.capture);
    expect(h.owner.getSnapshot()).toMatchObject({ phase: "failed", threadId: h.target.threadId });
    await h.owner.submit(composerDraftCapture("replacement must not overwrite captured input"));
    expect(h.startThread).toHaveBeenCalledTimes(1);
    expect(h.target.composerRole.submit).toHaveBeenCalledExactlyOnceWith(
      h.target.revision,
      h.capture,
    );
  });

  it("retains creation diagnostics through retry and activation until the next definite result", async () => {
    const h = setup();
    const response = await h.startThread({ cwd: "/x" });
    const creation = createDeferred<typeof response>();
    const activation = createDeferred<Awaited<ReturnType<ActiveThreadSession["activate"]>>>();
    h.startThread.mockClear().mockRejectedValueOnce(new Error("creation failed"));
    await h.owner.submit(h.capture);
    const failure = h.owner.getSnapshot()?.failure;
    h.startThread.mockReturnValueOnce(creation.promise);
    vi.mocked(h.session.activate).mockReturnValueOnce(activation.promise);

    const retry = h.owner.submit();
    expect(h.owner.getSnapshot()).toMatchObject({
      phase: "creating",
      isInputLocked: true,
      failure,
    });
    expect(await h.owner.submit()).toEqual({ type: "retained" });
    expect(h.startThread).toHaveBeenCalledTimes(2);
    creation.resolve(response);
    await Promise.resolve();
    expect(h.owner.getSnapshot()).toMatchObject({ phase: "activating", failure });
    const nextError = new Error("activation failed");
    activation.reject(nextError);
    await retry;
    expect(h.owner.getSnapshot()).toMatchObject({
      phase: "failed",
      failure: { stage: "activate", error: nextError },
    });

    await h.owner.submit();
    expect(h.startThread).toHaveBeenCalledTimes(2);
    expect(h.owner.getSnapshot()).toBeNull();
    expect(h.target.composerRole.submit).toHaveBeenCalledExactlyOnceWith(
      h.target.revision,
      h.capture,
    );
  });

  it("keeps a returned ID after connection replacement while creating", async () => {
    const h = setup();
    const response = await h.startThread({ cwd: "/x" });
    const deferred = createDeferred<typeof response>();
    h.startThread.mockReturnValueOnce(deferred.promise);
    const pending = h.owner.submit(h.capture);
    h.owner.setConnection(null);
    deferred.resolve(response);
    await pending;
    expect(h.session.activate).not.toHaveBeenCalled();
    expect(h.owner.getSnapshot()?.threadId).toBe(response.thread.id);
  });

  it("retries persistence rejection without creating another session", async () => {
    const h = setup();
    vi.mocked(h.target.composerRole.submit).mockReturnValueOnce({
      type: "rejected",
      reason: "persistenceFailed",
    });
    await h.owner.submit(h.capture);
    expect(h.owner.getSnapshot()).toMatchObject({
      draft: h.capture.draft,
      threadId: h.target.threadId,
      phase: "failed",
    });
    await h.owner.submit();
    expect(h.startThread).toHaveBeenCalledTimes(1);
    expect(h.target.composerRole.submit).toHaveBeenNthCalledWith(2, h.target.revision, h.capture);
    expect(h.owner.getSnapshot()).toBeNull();
  });

  it("does not submit through a replaced session instance", async () => {
    const h = setup();
    vi.mocked(h.session.getSnapshot)
      .mockReturnValueOnce(h.target)
      .mockReturnValueOnce(activeThreadSessionSnapshot({ threadId: h.target.threadId }));
    await h.owner.submit(h.capture);
    expect(h.target.composerRole.submit).not.toHaveBeenCalled();
    expect(h.owner.getSnapshot()?.threadId).toBe(h.target.threadId);
  });

  it("retains rejected input but blocks resubmission after an unknown handoff exception", async () => {
    const h = setup();
    vi.mocked(h.target.composerRole.submit).mockReturnValueOnce({
      type: "unavailable",
      scope: "activeThreadSession",
      reason: "staleRevision",
      revision: 2,
    });
    await h.owner.submit(h.capture);
    expect(h.owner.getSnapshot()?.phase).toBe("failed");
    vi.mocked(h.target.composerRole.submit).mockImplementationOnce(() => {
      throw new Error("unknown transaction result");
    });
    await h.owner.submit();
    expect(h.owner.getSnapshot()?.phase).toBe("handoffUnknown");
    await h.owner.submit();
    expect(h.target.composerRole.submit).toHaveBeenCalledTimes(2);
    expect(h.startThread).toHaveBeenCalledTimes(1);
  });
});
