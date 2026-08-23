import { describe, expect, it, vi } from "vitest";
import type { AppDispatch } from "@/app/store";
import { composerCapture } from "@/features/composerInputQueue/__tests__/composerInputQueueTestFixtures";
import * as composerInputQueueCoordinator from "@/features/composerInputQueue/composerInputQueueCoordinator";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import { attachBaseline } from "@/features/projection/__tests__/projectionFixtures";
import type { SkillsListResponse } from "@codex-protocol/v2";
import { prepareActiveThreadOwner } from "../activeThreadOwner";
import type { ProjectionAnimationFrameScheduler } from "../projectionApplicationCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const dispatch = ((action: unknown) => action) as unknown as AppDispatch;
const scheduler: ProjectionAnimationFrameScheduler = {
  requestFrame: () => 1,
  cancelFrame: () => undefined,
};

const response = (name: string): SkillsListResponse => ({
  data: [
    {
      cwd: attachBaseline.snapshot.thread.cwd,
      skills: [
        {
          name,
          description: `${name} description`,
          path: `${attachBaseline.snapshot.thread.cwd}/skills/${name}/SKILL.md`,
          scope: "repo",
          enabled: true,
        },
      ],
      errors: [],
    },
  ],
});

const prepareOwner = (
  listSkills: GuiHostCommands["listSkills"],
  steerTurn = vi.fn<GuiHostCommands["steerTurn"]>(),
  interruptTurn = vi.fn<GuiHostCommands["interruptTurn"]>(),
) =>
  prepareActiveThreadOwner({
    attachResponse: attachBaseline,
    commands: {
      listSkills,
      startTurn: vi.fn<GuiHostCommands["startTurn"]>(),
      steerTurn,
      interruptTurn,
    },
    dispatch,
    scheduler,
  });

describe("activeThreadOwner skill catalog", () => {
  it("binds the catalog to the attached cwd and exposes its minimal read and refresh interface", async () => {
    const listSkills = vi
      .fn<GuiHostCommands["listSkills"]>()
      .mockResolvedValue(response("initial"));
    const steerTurn = vi.fn<GuiHostCommands["steerTurn"]>();
    const interruptTurn = vi.fn<GuiHostCommands["interruptTurn"]>();
    const createQueue = vi.spyOn(
      composerInputQueueCoordinator,
      "createComposerInputQueueCoordinator",
    );
    const prepared = prepareOwner(listSkills, steerTurn, interruptTurn);

    expect(listSkills).toHaveBeenCalledExactlyOnceWith({
      cwds: [attachBaseline.snapshot.thread.cwd],
      forceReload: false,
    });
    await Promise.resolve();

    expect(
      prepared.activeOwner.skillCatalog.getSnapshot().candidates.map(({ name }) => name),
    ).toEqual(["initial"]);
    expect(typeof prepared.activeOwner.skillCatalog.subscribe).toBe("function");
    expect(typeof prepared.activeOwner.skillCatalog.invalidate).toBe("function");
    expect(typeof prepared.activeOwner.skillCatalog.retry).toBe("function");
    expect(createQueue).toHaveBeenCalledWith(expect.objectContaining({ interruptTurn, steerTurn }));
    expect(createQueue).toHaveReturnedWith(prepared.activeOwner.queueCoordinator);

    prepared.dispose();
    createQueue.mockRestore();
  });

  it("disposes the queue, catalog, and projection once through the shared owner lifecycle", async () => {
    const pending = deferred<SkillsListResponse>();
    const listSkills = vi.fn<GuiHostCommands["listSkills"]>().mockReturnValue(pending.promise);
    const prepared = prepareOwner(listSkills);
    const catalogListener = vi.fn<() => void>();
    const queueDispose = vi.spyOn(prepared.activeOwner.queueCoordinator, "dispose");
    const projectionDispose = vi.spyOn(prepared.activeOwner.projectionOwner, "dispose");
    prepared.activeOwner.skillCatalog.subscribe(catalogListener);

    expect(prepared.activeOwner.dispose).toBe(prepared.dispose);
    prepared.activeOwner.dispose("ownerReplaced");
    prepared.dispose();
    pending.resolve(response("stale"));
    await Promise.resolve();

    expect(prepared.activeOwner.queueCoordinator.submit(composerCapture("after dispose"))).toEqual({
      type: "rejected",
      reason: "disposed",
    });
    expect(prepared.activeOwner.skillCatalog.invalidate()).toBe(false);
    expect(prepared.activeOwner.skillCatalog.retry()).toBe(false);
    expect(catalogListener).not.toHaveBeenCalled();
    expect(queueDispose).toHaveBeenCalledOnce();
    expect(queueDispose).toHaveBeenCalledExactlyOnceWith("ownerReplaced");
    expect(projectionDispose).toHaveBeenCalledOnce();
  });

  it("keeps a StrictMode-style replacement isolated from the disposed generation", async () => {
    const firstResponse = deferred<SkillsListResponse>();
    const firstPrepared = prepareOwner(
      vi.fn<GuiHostCommands["listSkills"]>().mockReturnValue(firstResponse.promise),
    );
    const firstListener = vi.fn<() => void>();
    firstPrepared.activeOwner.skillCatalog.subscribe(firstListener);
    firstPrepared.dispose();

    const secondPrepared = prepareOwner(
      vi.fn<GuiHostCommands["listSkills"]>().mockResolvedValue(response("replacement")),
    );
    firstResponse.resolve(response("stale"));
    await Promise.resolve();

    expect(firstListener).not.toHaveBeenCalled();
    expect(
      secondPrepared.activeOwner.skillCatalog.getSnapshot().candidates.map(({ name }) => name),
    ).toEqual(["replacement"]);

    secondPrepared.dispose();
  });
});
