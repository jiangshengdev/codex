import type { SkillNodeState } from "./SkillNode";
import {
  skillParentPathLabel,
  skillSourceLabel,
  type SkillQueryCandidate,
  type SkillPathIdentity,
} from "./skillQuery";

export type SelectedSkillPresentationInput = Readonly<{
  skill: SkillNodeState;
  candidates: readonly SkillQueryCandidate[];
  documentSkills: readonly SkillPathIdentity[];
  invalidPaths: ReadonlySet<string>;
}>;

export type SelectedSkillPresentation = Readonly<{
  displayName: string;
  canonicalName: string | null;
  sourceLabel: string;
  description: string | null;
  pathLabel: string | null;
  isInvalid: boolean;
}>;

export function projectSelectedSkillPresentation({
  skill,
  candidates,
  documentSkills,
  invalidPaths,
}: SelectedSkillPresentationInput): SelectedSkillPresentation {
  const candidate = candidates.find((current) => current.path === skill.path);
  const isInvalid = invalidPaths.has(skill.path);
  const collidableSkills: SkillPathIdentity[] = [...candidates, ...documentSkills];

  return {
    displayName: skill.displayName,
    canonicalName: skill.name === skill.displayName ? null : `$${skill.name}`,
    sourceLabel: candidate == null ? skill.sourceLabel : skillSourceLabel(candidate),
    description: candidate == null ? null : preferredDescription(candidate),
    pathLabel: skillParentPathLabel(
      collidableSkills,
      skill,
      isInvalid ? "diagnostic" : "collision-only",
    ),
    isInvalid,
  };
}

function preferredDescription(candidate: SkillQueryCandidate): string | null {
  const description = (
    candidate.interface?.shortDescription ??
    candidate.shortDescription ??
    candidate.description
  ).trim();
  return description.length === 0 ? null : description;
}
