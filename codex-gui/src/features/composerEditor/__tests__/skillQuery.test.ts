import { describe, expect, it } from "vitest";
import {
  MAX_SKILL_QUERY_RESULTS,
  querySkills,
  skillSourceLabel,
  type SkillQueryCandidate,
} from "../skillQuery";

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

  it("breaks equal-score ties by canonical name and then path", () => {
    const beta = candidate("Beta", { path: "/skills/beta/SKILL.md" });
    const alphaLaterPath = candidate("Alpha", { path: "/skills/z/SKILL.md" });
    const alphaEarlierPath = candidate("Alpha", { path: "/skills/a/SKILL.md" });

    const results = querySkills([beta, alphaLaterPath, alphaEarlierPath], "");

    expect(results.map(({ candidate: result }) => [result.name, result.path])).toEqual([
      ["Alpha", "/skills/a/SKILL.md"],
      ["Alpha", "/skills/z/SKILL.md"],
      ["Beta", "/skills/beta/SKILL.md"],
    ]);
  });

  it("caps results at the hard maximum", () => {
    const candidates = Array.from({ length: MAX_SKILL_QUERY_RESULTS + 5 }, (_, index) =>
      candidate(`skill-${String(index).padStart(2, "0")}`),
    );

    const results = querySkills(candidates, "");

    expect(results).toHaveLength(MAX_SKILL_QUERY_RESULTS);
    expect(results.map(({ candidate: result }) => result.name)).toEqual(
      candidates.slice(0, MAX_SKILL_QUERY_RESULTS).map(({ name }) => name),
    );
  });

  it("computes full parent paths for case-insensitive duplicate display names and labels their scopes", () => {
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
        disambiguatingParentPath: "repo/shared",
        sourceLabel: "Repository",
      },
      {
        name: "user-skill",
        disambiguatingParentPath: "user/shared",
        sourceLabel: "User",
      },
    ]);
  });

  it("uses the shortest unique POSIX parent suffix despite a long common prefix", () => {
    const first = candidate("first", {
      interface: skillInterface("Shared Display"),
      path: "/workspace/with/a/long/common/prefix/first/SKILL.md",
    });
    const second = candidate("second", {
      interface: skillInterface("shared display"),
      path: "/workspace/with/a/long/common/prefix/second/SKILL.md",
    });

    const results = querySkills([first, second], "shared");

    expect(
      results.map(({ candidate: result, disambiguatingParentPath }) => ({
        name: result.name,
        disambiguatingParentPath,
      })),
    ).toEqual([
      { name: "first", disambiguatingParentPath: "first" },
      { name: "second", disambiguatingParentPath: "second" },
    ]);
  });

  it("uses another parent segment when one POSIX parent is the other's suffix", () => {
    const first = candidate("first", {
      interface: skillInterface("Shared Display"),
      path: "/shared/SKILL.md",
    });
    const second = candidate("second", {
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
    const first = candidate("first", {
      interface: skillInterface("Shared Display"),
      path: "C:\\skills\\team-one\\shared\\SKILL.md",
    });
    const second = candidate("second", {
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
    const first = candidate("first", {
      interface: skillInterface("Shared Display"),
      path: "C:\\skills\\shared\\SKILL.md",
    });
    const second = candidate("second", {
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
    const first = candidate("first", {
      interface: skillInterface("Shared Display"),
      path: "C:\\SKILL.md",
    });
    const second = candidate("second", {
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
    const first = candidate("first", {
      interface: skillInterface("Same Display"),
      path: "/shared/SKILL.md",
    });
    const second = candidate("second", {
      interface: skillInterface("same display"),
      path: "/shared/SKILL.md",
    });

    const results = querySkills([first, second], "same");

    expect(results.map(({ disambiguatingParentPath }) => disambiguatingParentPath)).toEqual([
      null,
      null,
    ]);
  });

  it("does not add a parent path to a unique display name", () => {
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
