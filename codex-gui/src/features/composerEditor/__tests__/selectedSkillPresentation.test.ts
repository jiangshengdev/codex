import { describe, expect, it } from "vitest";

import {
  projectSelectedSkillPresentation,
  type SelectedSkillPresentationInput,
} from "../selectedSkillPresentation";
import type { SkillQueryCandidate } from "../skillQuery";
import type { SkillNodeState } from "../SkillNode";

const savedSkill: SkillNodeState = {
  name: "canonical-skill",
  path: "/workspace/repository/canonical-skill/SKILL.md",
  displayName: "Friendly Skill",
  sourceLabel: "Saved source",
};

const candidate = (
  path = savedSkill.path,
  overrides: Partial<SkillQueryCandidate> = {},
): SkillQueryCandidate => ({
  name: savedSkill.name,
  description: "Long description",
  path,
  scope: "repo",
  ...overrides,
});

const input = (
  overrides: Partial<SelectedSkillPresentationInput> = {},
): SelectedSkillPresentationInput => ({
  skill: savedSkill,
  candidates: [candidate()],
  documentSkills: [savedSkill],
  invalidPaths: new Set(),
  ...overrides,
});

describe("projectSelectedSkillPresentation", () => {
  it("uses only the exact catalog path and applies the documented detail priority", () => {
    const exact = candidate(savedSkill.path, {
      description: "Long description",
      shortDescription: "Short description",
      interface: {
        displayName: "Current catalog display",
        shortDescription: "Interface description",
        iconSmallUrl: null,
        iconLargeUrl: null,
      },
      scope: "user",
    });
    const sameNameWrongPath = candidate("/workspace/other/canonical-skill/SKILL.md", {
      description: "Wrong description",
      scope: "system",
    });

    expect(
      projectSelectedSkillPresentation(input({ candidates: [sameNameWrongPath, exact] })),
    ).toEqual({
      displayName: "Friendly Skill",
      canonicalName: "$canonical-skill",
      sourceLabel: "User",
      description: "Interface description",
      pathLabel: "repository/canonical-skill",
      isInvalid: false,
    });
  });

  it.each([
    [
      { interface: undefined, shortDescription: "Short description", description: "Long" },
      "Short description",
    ],
    [{ interface: undefined, shortDescription: undefined, description: "Long" }, "Long"],
    [{ interface: undefined, shortDescription: undefined, description: "" }, null],
  ] as const)(
    "falls through catalog descriptions without creating empty detail",
    (fields, expected) => {
      expect(
        projectSelectedSkillPresentation(
          input({ candidates: [candidate(savedSkill.path, fields)] }),
        ).description,
      ).toBe(expected);
    },
  );

  it("keeps saved identity details when the exact catalog path is temporarily unavailable", () => {
    expect(
      projectSelectedSkillPresentation(
        input({
          candidates: [candidate("/workspace/other/canonical-skill/SKILL.md")],
          documentSkills: [savedSkill],
        }),
      ),
    ).toEqual({
      displayName: "Friendly Skill",
      canonicalName: "$canonical-skill",
      sourceLabel: "Saved source",
      description: null,
      pathLabel: "repository/canonical-skill",
      isInvalid: false,
    });
  });

  it("hides canonical name and path for a valid unique skill", () => {
    const sameDisplayName = { ...savedSkill, name: savedSkill.displayName };

    expect(
      projectSelectedSkillPresentation(
        input({
          skill: sameDisplayName,
          candidates: [candidate(savedSkill.path, { name: sameDisplayName.name })],
          documentSkills: [sameDisplayName],
        }),
      ),
    ).toMatchObject({
      canonicalName: null,
      pathLabel: null,
      isInvalid: false,
    });
  });

  it("combines catalog and current-document collisions when choosing the shortest path", () => {
    const catalogCollision = candidate("/workspace/catalog/canonical-skill/SKILL.md");
    const documentCollision: SkillNodeState = {
      ...savedSkill,
      path: "/workspace/document/canonical-skill/SKILL.md",
    };

    expect(
      projectSelectedSkillPresentation(
        input({
          candidates: [candidate(), catalogCollision],
          documentSkills: [savedSkill, documentCollision],
        }),
      ).pathLabel,
    ).toBe("repository/canonical-skill");
  });

  it("shows the shortest diagnostic parent suffix only for confirmed invalid paths", () => {
    const missingSkill: SkillNodeState = {
      ...savedSkill,
      path: "/private/user/team/missing-skill/SKILL.md",
    };

    expect(
      projectSelectedSkillPresentation(
        input({
          skill: missingSkill,
          candidates: [],
          documentSkills: [missingSkill],
          invalidPaths: new Set([missingSkill.path]),
        }),
      ),
    ).toMatchObject({
      pathLabel: "missing-skill",
      isInvalid: true,
    });
  });
});
