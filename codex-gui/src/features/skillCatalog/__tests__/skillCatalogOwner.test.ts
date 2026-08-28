import { describe, expect, it, vi } from "vitest";
import { createDeferred as deferred } from "@/__tests__/testDeferred";
import type { GuiHostCommands } from "@/features/guiHost/guiHostClient";
import type { SkillMetadata, SkillsListResponse } from "@codex-protocol/v2";
import { SkillCatalogOwner, type SkillCatalogState } from "../skillCatalogOwner";

const cwd = "/workspace/project";

const skill = (name: string, overrides: Partial<SkillMetadata> = {}): SkillMetadata => ({
  name,
  description: `${name} description`,
  interface: {
    displayName: `${name} display`,
    iconSmallUrl: null,
    iconLargeUrl: null,
  },
  path: `${cwd}/skills/${name}/SKILL.md`,
  scope: "repo",
  enabled: true,
  pluginId: null,
  ...overrides,
});

const response = ({
  currentSkills,
  errors = [],
  otherSkills = [],
}: {
  currentSkills: SkillMetadata[];
  errors?: SkillsListResponse["data"][number]["errors"];
  otherSkills?: SkillMetadata[];
}): SkillsListResponse => ({
  data: [
    { cwd: "/workspace/other", skills: otherSkills, errors: [] },
    { cwd, skills: currentSkills, errors },
  ],
});

const skillInterface = (value: SkillMetadata): NonNullable<SkillMetadata["interface"]> => {
  if (value.interface == null) {
    throw new Error("skill fixture must include interface metadata");
  }
  return value.interface;
};

const createOwner = (listSkills: GuiHostCommands["listSkills"]) => {
  const states: SkillCatalogState[] = [];
  const owner = new SkillCatalogOwner({ cwd, listSkills });
  owner.subscribe(() => states.push(owner.getSnapshot()));
  return { owner, states };
};

describe("SkillCatalogOwner", () => {
  it("loads only enabled skills from the exact cwd and exposes path-free partial error data", async () => {
    const enabled = skill("enabled");
    const disabled = skill("disabled", { enabled: false });
    const other = skill("other");
    const source = response({
      currentSkills: [enabled, disabled],
      errors: [{ path: "/secret/private/SKILL.md", message: "failed at /secret/private" }],
      otherSkills: [other],
    });
    const listSkills = vi.fn<GuiHostCommands["listSkills"]>().mockResolvedValue(source);
    const { owner } = createOwner(listSkills);

    expect(owner.start()).toBe(true);
    expect(owner.start()).toBe(false);
    expect(owner.getSnapshot()).toStrictEqual({
      type: "initialLoading",
      candidates: [],
      partialErrorCount: 0,
    });
    expect(listSkills).toHaveBeenCalledExactlyOnceWith({
      cwds: [cwd],
      forceReload: false,
    });
    await Promise.resolve();

    expect(owner.getSnapshot()).toStrictEqual({
      type: "ready",
      candidates: [
        {
          name: "enabled",
          description: "enabled description",
          interface: {
            displayName: "enabled display",
            iconSmallUrl: null,
            iconLargeUrl: null,
          },
          path: `${cwd}/skills/enabled/SKILL.md`,
          scope: "repo",
        },
      ],
      partialErrorCount: 1,
    });
    expect(JSON.stringify(owner.getSnapshot())).not.toContain("/secret/private");

    enabled.name = "mutated";
    skillInterface(enabled).displayName = "mutated display";
    expect(owner.getSnapshot().candidates[0]?.name).toBe("enabled");
    expect(owner.getSnapshot().candidates[0]?.interface?.displayName).toBe("enabled display");
  });

  it("publishes total initial failure and retries without retaining the raw error", async () => {
    const failure = new Error("failed at /secret/private/SKILL.md");
    const listSkills = vi
      .fn<GuiHostCommands["listSkills"]>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(response({ currentSkills: [skill("recovered")] }));
    const { owner } = createOwner(listSkills);

    owner.start();
    await Promise.resolve();
    expect(owner.getSnapshot()).toStrictEqual({
      type: "failed",
      candidates: [],
      partialErrorCount: 0,
    });
    expect(JSON.stringify(owner.getSnapshot())).not.toContain("/secret/private");

    expect(owner.retry()).toBe(true);
    expect(owner.retry()).toBe(false);
    await Promise.resolve();
    expect(owner.getSnapshot().type).toBe("ready");
    expect(owner.getSnapshot().candidates.map(({ name }) => name)).toStrictEqual(["recovered"]);
  });

  it("coalesces invalidation bursts while preserving and atomically replacing successful values", async () => {
    const firstRefresh = deferred<SkillsListResponse>();
    const queuedRefresh = deferred<SkillsListResponse>();
    const listSkills = vi
      .fn<GuiHostCommands["listSkills"]>()
      .mockResolvedValueOnce(response({ currentSkills: [skill("initial")] }))
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(queuedRefresh.promise);
    const { owner } = createOwner(listSkills);

    owner.start();
    await Promise.resolve();
    expect(owner.invalidate()).toBe(true);
    expect(owner.getSnapshot().type).toBe("refreshing");
    expect(owner.getSnapshot().candidates.map(({ name }) => name)).toStrictEqual(["initial"]);
    expect(owner.invalidate()).toBe(true);
    expect(owner.invalidate()).toBe(false);
    expect(listSkills).toHaveBeenCalledTimes(2);

    firstRefresh.resolve(response({ currentSkills: [skill("first-refresh")] }));
    await Promise.resolve();
    expect(listSkills).toHaveBeenCalledTimes(3);
    expect(owner.getSnapshot().type).toBe("refreshing");
    expect(owner.getSnapshot().candidates.map(({ name }) => name)).toStrictEqual(["first-refresh"]);

    queuedRefresh.resolve(response({ currentSkills: [skill("queued-refresh")] }));
    await Promise.resolve();
    expect(owner.getSnapshot()).toMatchObject({ type: "ready", partialErrorCount: 0 });
    expect(owner.getSnapshot().candidates.map(({ name }) => name)).toStrictEqual([
      "queued-refresh",
    ]);
  });

  it("marks a failed refresh stale, keeps the last success, and supports retry", async () => {
    const retry = deferred<SkillsListResponse>();
    const listSkills = vi
      .fn<GuiHostCommands["listSkills"]>()
      .mockResolvedValueOnce(response({ currentSkills: [skill("stable")] }))
      .mockRejectedValueOnce(new Error("refresh failed at /secret/private"))
      .mockReturnValueOnce(retry.promise);
    const { owner } = createOwner(listSkills);

    owner.start();
    await Promise.resolve();
    owner.invalidate();
    await Promise.resolve();
    expect(owner.getSnapshot()).toMatchObject({ type: "stale", partialErrorCount: 0 });
    expect(owner.getSnapshot().candidates.map(({ name }) => name)).toStrictEqual(["stable"]);
    expect(JSON.stringify(owner.getSnapshot())).not.toContain("/secret/private");

    expect(owner.retry()).toBe(true);
    expect(owner.getSnapshot().type).toBe("refreshing");
    retry.resolve(response({ currentSkills: [skill("fresh")] }));
    await Promise.resolve();
    expect(owner.getSnapshot().type).toBe("ready");
    expect(owner.getSnapshot().candidates.map(({ name }) => name)).toStrictEqual(["fresh"]);
  });

  it("ignores stale settlement and invalidation after disposal", async () => {
    const pending = deferred<SkillsListResponse>();
    const listSkills = vi.fn<GuiHostCommands["listSkills"]>().mockReturnValue(pending.promise);
    const { owner, states } = createOwner(listSkills);

    owner.start();
    const stateCountBeforeDispose = states.length;
    owner.dispose();
    pending.resolve(response({ currentSkills: [skill("stale")] }));
    await Promise.resolve();

    expect(states).toHaveLength(stateCountBeforeDispose);
    expect(owner.invalidate()).toBe(false);
    expect(owner.retry()).toBe(false);
    expect(owner.start()).toBe(false);
  });
});
