import { describe, expect, it } from "vitest";
import { querySkills, skillSourceLabel, type SkillQueryCandidate } from "../skillQuery";

const candidate = (
  name: string,
  overrides: Partial<SkillQueryCandidate> = {},
): SkillQueryCandidate => ({
  name,
  description: `${name} description`,
  path: `/skills/${name}/SKILL.md`,
  scope: "repo",
  ...overrides,
});

const skillInterface = (displayName: string): NonNullable<SkillQueryCandidate["interface"]> => ({
  displayName,
  iconSmallUrl: null,
  iconLargeUrl: null,
});

describe("querySkills", () => {
  it("matches the canonical skill name", () => {
    const matching = candidate("canonical-skill");
    const ignored = candidate("other-skill");

    const results = querySkills([ignored, matching], "canonical");

    expect(results.map(({ candidate: result }) => result)).toEqual([matching]);
  });

  it("matches interface.displayName", () => {
    const matching = candidate("canonical-name", {
      interface: skillInterface("Friendly Display"),
    });

    const results = querySkills([matching], "friendly");

    expect(results.map(({ candidate: result, displayName }) => ({ result, displayName }))).toEqual([
      { result: matching, displayName: "Friendly Display" },
    ]);
  });

  it("does not match description or shortDescription", () => {
    const descriptionOnly = candidate("first", {
      description: "hidden search term",
    });
    const shortDescriptionOnly = candidate("second", {
      shortDescription: "hidden search term",
    });

    expect(querySkills([descriptionOnly, shortDescriptionOnly], "hidden")).toEqual([]);
  });

  it("matches case-insensitive subsequences and ranks compact matches first", () => {
    const spread = candidate("A12B12C");
    const compact = candidate("A1B1C");
    const exact = candidate("ABC");

    const results = querySkills([spread, compact, exact], "aBc");

    expect(results.map(({ candidate: result }) => result.name)).toEqual([
      "ABC",
      "A1B1C",
      "A12B12C",
    ]);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? Number.NEGATIVE_INFINITY);
    expect(results[1]?.score).toBeGreaterThan(results[2]?.score ?? Number.NEGATIVE_INFINITY);
  });

  it("sorts an empty query by scope, display name, canonical name, and path", () => {
    const repoSameLaterPath = candidate("same", {
      interface: skillInterface("Same"),
      path: "/repo/z/SKILL.md",
    });
    const systemSkill = candidate("system-first", {
      interface: skillInterface("Aardvark"),
      scope: "system",
    });
    const repoNameLater = candidate("beta", {
      interface: skillInterface("Alpha"),
    });
    const adminSkill = candidate("admin-first", {
      interface: skillInterface("Aardvark"),
      scope: "admin",
    });
    const repoBlankDisplayName = candidate("Bravo", {
      interface: skillInterface("   "),
    });
    const repoNameEarlier = candidate("alpha", {
      interface: skillInterface("Alpha"),
    });
    const userSkill = candidate("user-first", {
      interface: skillInterface("Aardvark"),
      scope: "user",
    });
    const repoMissingDisplayName = candidate("Charlie");
    const repoSameEarlierPath = candidate("same", {
      interface: skillInterface("Same"),
      path: "/repo/a/SKILL.md",
    });

    const results = querySkills(
      [
        repoSameLaterPath,
        systemSkill,
        repoNameLater,
        adminSkill,
        repoBlankDisplayName,
        repoNameEarlier,
        userSkill,
        repoMissingDisplayName,
        repoSameEarlierPath,
      ],
      "",
    );

    expect(results).toEqual([
      {
        candidate: repoNameEarlier,
        displayName: "Alpha",
        sourceLabel: "Repository",
        score: 0,
        disambiguatingParentPath: null,
      },
      {
        candidate: repoNameLater,
        displayName: "Alpha",
        sourceLabel: "Repository",
        score: 0,
        disambiguatingParentPath: null,
      },
      {
        candidate: repoBlankDisplayName,
        displayName: "Bravo",
        sourceLabel: "Repository",
        score: 0,
        disambiguatingParentPath: null,
      },
      {
        candidate: repoMissingDisplayName,
        displayName: "Charlie",
        sourceLabel: "Repository",
        score: 0,
        disambiguatingParentPath: null,
      },
      {
        candidate: repoSameEarlierPath,
        displayName: "Same",
        sourceLabel: "Repository",
        score: 0,
        disambiguatingParentPath: "a",
      },
      {
        candidate: repoSameLaterPath,
        displayName: "Same",
        sourceLabel: "Repository",
        score: 0,
        disambiguatingParentPath: "z",
      },
      {
        candidate: userSkill,
        displayName: "Aardvark",
        sourceLabel: "User",
        score: 0,
        disambiguatingParentPath: null,
      },
      {
        candidate: adminSkill,
        displayName: "Aardvark",
        sourceLabel: "Admin",
        score: 0,
        disambiguatingParentPath: null,
      },
      {
        candidate: systemSkill,
        displayName: "Aardvark",
        sourceLabel: "System",
        score: 0,
        disambiguatingParentPath: null,
      },
    ]);
  });

  it("returns every candidate for an empty query", () => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      candidate(`skill-${String(index).padStart(2, "0")}`),
    );

    const results = querySkills(candidates.toReversed(), "");

    expect(results).toEqual(
      candidates.map((result) => ({
        candidate: result,
        displayName: result.name,
        sourceLabel: "Repository",
        score: 0,
        disambiguatingParentPath: null,
      })),
    );
  });

  it("returns every match for a non-empty query", () => {
    const candidates = Array.from({ length: 25 }, (_, index) =>
      candidate(`match-${String(index).padStart(2, "0")}`),
    );

    const results = querySkills(candidates.toReversed(), "match");

    expect(results).toEqual(
      candidates.map((result) => ({
        candidate: result,
        displayName: result.name,
        sourceLabel: "Repository",
        score: 1_132,
        disambiguatingParentPath: null,
      })),
    );
  });

  it("keeps non-empty query scores global across scopes", () => {
    const compactSystemMatch = candidate("abc", { scope: "system" });
    const spreadRepositoryMatch = candidate("a-x-b-x-c", { scope: "repo" });

    const results = querySkills([spreadRepositoryMatch, compactSystemMatch], "abc");

    expect(results.map(({ candidate: result }) => result)).toEqual([
      compactSystemMatch,
      spreadRepositoryMatch,
    ]);
  });

  it("does not add parent paths when display names match but canonical names differ", () => {
    const userSkill = candidate("user-skill", {
      interface: skillInterface("Shared Display"),
      path: "/user/shared/SKILL.md",
      scope: "user",
    });
    const repositorySkill = candidate("repository-skill", {
      interface: skillInterface("shared display"),
      path: "/repo/shared/SKILL.md",
      scope: "repo",
    });

    const results = querySkills([userSkill, repositorySkill], "shared");

    expect(
      results.map(({ candidate: result, disambiguatingParentPath, sourceLabel }) => ({
        name: result.name,
        disambiguatingParentPath,
        sourceLabel,
      })),
    ).toEqual([
      {
        name: "repository-skill",
        disambiguatingParentPath: null,
        sourceLabel: "Repository",
      },
      {
        name: "user-skill",
        disambiguatingParentPath: null,
        sourceLabel: "User",
      },
    ]);
  });

  it("computes parent paths when canonical names and display names match but paths differ", () => {
    const userSkill = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "/user/shared/SKILL.md",
      scope: "user",
    });
    const repositorySkill = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "/repo/shared/SKILL.md",
      scope: "repo",
    });

    const results = querySkills([userSkill, repositorySkill], "shared");

    expect(
      results.map(({ candidate: result, disambiguatingParentPath }) => ({
        path: result.path,
        disambiguatingParentPath,
      })),
    ).toEqual([
      { path: "/repo/shared/SKILL.md", disambiguatingParentPath: "repo/shared" },
      { path: "/user/shared/SKILL.md", disambiguatingParentPath: "user/shared" },
    ]);
  });

  it("computes parent paths when canonical names match but display names differ", () => {
    const first = candidate("shared-skill", {
      interface: skillInterface("First Display"),
      path: "/first/shared/SKILL.md",
    });
    const second = candidate("shared-skill", {
      interface: skillInterface("Second Display"),
      path: "/second/shared/SKILL.md",
    });

    const results = querySkills([first, second], "shared");

    expect(
      results.map(({ displayName, disambiguatingParentPath }) => ({
        displayName,
        disambiguatingParentPath,
      })),
    ).toEqual([
      { displayName: "First Display", disambiguatingParentPath: "first/shared" },
      { displayName: "Second Display", disambiguatingParentPath: "second/shared" },
    ]);
  });

  it("uses the shortest unique POSIX parent suffix despite a long common prefix", () => {
    const first = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "/workspace/with/a/long/common/prefix/first/SKILL.md",
    });
    const second = candidate("shared-skill", {
      interface: skillInterface("shared display"),
      path: "/workspace/with/a/long/common/prefix/second/SKILL.md",
    });

    const results = querySkills([first, second], "shared");

    expect(
      results.map(({ candidate: result, disambiguatingParentPath }) => ({
        path: result.path,
        disambiguatingParentPath,
      })),
    ).toEqual([
      {
        path: "/workspace/with/a/long/common/prefix/first/SKILL.md",
        disambiguatingParentPath: "first",
      },
      {
        path: "/workspace/with/a/long/common/prefix/second/SKILL.md",
        disambiguatingParentPath: "second",
      },
    ]);
  });

  it("uses another parent segment when one POSIX parent is the other's suffix", () => {
    const first = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "/shared/SKILL.md",
    });
    const second = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "/workspace/shared/SKILL.md",
    });

    const results = querySkills([first, second], "shared");

    expect(results.map(({ disambiguatingParentPath }) => disambiguatingParentPath)).toEqual([
      "/shared",
      "workspace/shared",
    ]);
  });

  it("supports Windows separators and keeps only the unique parent suffix", () => {
    const first = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "C:\\skills\\team-one\\shared\\SKILL.md",
    });
    const second = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "C:\\skills\\team-two\\shared\\SKILL.md",
    });

    const results = querySkills([first, second], "shared");

    expect(results.map(({ disambiguatingParentPath }) => disambiguatingParentPath)).toEqual([
      "team-one\\shared",
      "team-two\\shared",
    ]);
  });

  it("preserves drive roots when the complete Windows parent path is required", () => {
    const first = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "C:\\skills\\shared\\SKILL.md",
    });
    const second = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "D:\\skills\\shared\\SKILL.md",
    });

    const results = querySkills([first, second], "shared");

    expect(results.map(({ disambiguatingParentPath }) => disambiguatingParentPath)).toEqual([
      "C:\\skills\\shared",
      "D:\\skills\\shared",
    ]);
  });

  it("preserves Windows drive-root parent separators", () => {
    const first = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "C:\\SKILL.md",
    });
    const second = candidate("shared-skill", {
      interface: skillInterface("Shared Display"),
      path: "D:\\SKILL.md",
    });

    const results = querySkills([first, second], "shared");

    expect(results.map(({ disambiguatingParentPath }) => disambiguatingParentPath)).toEqual([
      "C:\\",
      "D:\\",
    ]);
  });

  it("does not disambiguate repeated entries from the same path", () => {
    const first = candidate("shared-skill", {
      interface: skillInterface("First Display"),
      path: "/shared/SKILL.md",
    });
    const second = candidate("shared-skill", {
      interface: skillInterface("Second Display"),
      path: "/shared/SKILL.md",
    });

    const results = querySkills([first, second], "shared");

    expect(results.map(({ disambiguatingParentPath }) => disambiguatingParentPath)).toEqual([
      null,
      null,
    ]);
  });

  it("does not add a parent path to a unique canonical name", () => {
    const result = querySkills([candidate("unique")], "unique");

    expect(result[0]?.disambiguatingParentPath).toBeNull();
  });
});

describe("skillSourceLabel", () => {
  it.each([
    ["user", "User"],
    ["repo", "Repository"],
    ["system", "System"],
    ["admin", "Admin"],
  ] as const)("maps the generated %s scope to %s", (scope, expected) => {
    expect(skillSourceLabel(candidate(`${scope}-skill`, { scope }))).toBe(expected);
  });
});
