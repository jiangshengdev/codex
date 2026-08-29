import type { SkillMetadata } from "@codex-protocol/v2";

export const MAX_SKILL_QUERY_RESULTS = 20;

export type SkillQueryCandidate = Readonly<
  Pick<SkillMetadata, "name" | "description" | "shortDescription" | "interface" | "path" | "scope">
>;

export type SkillQueryResult = Readonly<{
  candidate: SkillQueryCandidate;
  displayName: string;
  sourceLabel: string;
  score: number;
  disambiguatingParentPath: string | null;
}>;

export function skillDisplayName(candidate: SkillQueryCandidate): string {
  const displayName = candidate.interface?.displayName?.trim();
  return displayName == null || displayName.length === 0 ? candidate.name : displayName;
}

export function skillSourceLabel(candidate: SkillQueryCandidate): string {
  switch (candidate.scope) {
    case "user":
      return "User";
    case "repo":
      return "Repository";
    case "system":
      return "System";
    case "admin":
      return "Admin";
    default:
      return assertNever(candidate.scope);
  }
}

export function querySkills(
  candidates: readonly SkillQueryCandidate[],
  query: string,
): SkillQueryResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const disambiguatingParentPaths = collectDisambiguatingParentPaths(candidates);
  const results: SkillQueryResult[] = [];

  for (const candidate of candidates) {
    const displayName = skillDisplayName(candidate);
    const canonicalScore = scoreSubsequence(candidate.name, normalizedQuery);
    const displayScore = scoreSubsequence(displayName, normalizedQuery);
    const score = betterScore(canonicalScore, displayScore);
    if (score == null) {
      continue;
    }

    results.push({
      candidate,
      displayName,
      sourceLabel: skillSourceLabel(candidate),
      score,
      disambiguatingParentPath:
        disambiguatingParentPaths.get(candidate.name)?.get(candidate.path) ?? null,
    });
  }

  results.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    const nameOrder = compareText(left.candidate.name, right.candidate.name);
    return nameOrder === 0 ? compareText(left.candidate.path, right.candidate.path) : nameOrder;
  });
  return results.slice(0, MAX_SKILL_QUERY_RESULTS);
}

function collectDisambiguatingParentPaths(
  candidates: readonly SkillQueryCandidate[],
): Map<string, Map<string, string | null>> {
  const pathsByCanonicalName = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const paths = pathsByCanonicalName.get(candidate.name) ?? new Set<string>();
    paths.add(candidate.path);
    pathsByCanonicalName.set(candidate.name, paths);
  }

  const disambiguatingParentPaths = new Map<string, Map<string, string | null>>();
  for (const [canonicalName, paths] of pathsByCanonicalName) {
    const pathsForCanonicalName = new Map<string, string | null>();
    if (paths.size < 2) {
      for (const path of paths) {
        pathsForCanonicalName.set(path, null);
      }
    } else {
      const parentPaths = Array.from(paths, parseParentPath);
      for (const parentPath of parentPaths) {
        pathsForCanonicalName.set(
          parentPath.path,
          shortestUniqueParentPath(parentPath, parentPaths),
        );
      }
    }
    disambiguatingParentPaths.set(canonicalName, pathsForCanonicalName);
  }
  return disambiguatingParentPaths;
}

type ParsedParentPath = Readonly<{
  path: string;
  fullParentPath: string;
  segments: readonly string[];
  separator: "/" | "\\";
}>;

function parseParentPath(path: string): ParsedParentPath {
  const lastForwardSeparator = path.lastIndexOf("/");
  const lastBackwardSeparator = path.lastIndexOf("\\");
  const lastSeparator = Math.max(lastForwardSeparator, lastBackwardSeparator);
  const separator = lastBackwardSeparator > lastForwardSeparator ? "\\" : "/";
  if (lastSeparator < 0) {
    return { path, fullParentPath: "", segments: [], separator };
  }
  let fullParentPath = path.slice(0, lastSeparator);
  if (lastSeparator === 0 || /^[A-Za-z]:[\\/]$/u.test(path.slice(0, lastSeparator + 1))) {
    fullParentPath = path.slice(0, lastSeparator + 1);
  }

  return {
    path,
    fullParentPath,
    segments: fullParentPath.split(/[\\/]+/u).filter((segment) => segment.length > 0),
    separator,
  };
}

function shortestUniqueParentPath(
  parentPath: ParsedParentPath,
  parentPaths: readonly ParsedParentPath[],
): string {
  if (/^[A-Za-z]:[\\/]$/u.test(parentPath.fullParentPath)) {
    return parentPath.fullParentPath;
  }

  for (let segmentCount = 1; segmentCount <= parentPath.segments.length; segmentCount += 1) {
    const suffix = parentPathSuffix(parentPath, segmentCount);
    const suffixKey = parentPathSuffixKey(parentPath, segmentCount);
    const isUnique = parentPaths.every(
      (otherParentPath) =>
        otherParentPath.path === parentPath.path ||
        parentPathSuffixKey(otherParentPath, segmentCount) !== suffixKey,
    );
    if (isUnique) {
      return suffix;
    }
  }
  return parentPath.fullParentPath;
}

function parentPathSuffix(parentPath: ParsedParentPath, segmentCount: number): string {
  return parentPath.segments.slice(-segmentCount).join(parentPath.separator);
}

function parentPathSuffixKey(parentPath: ParsedParentPath, segmentCount: number): string {
  return JSON.stringify(parentPath.segments.slice(-segmentCount));
}

function scoreSubsequence(value: string, normalizedQuery: string): number | null {
  if (normalizedQuery.length === 0) {
    return 0;
  }

  const normalizedValue = value.toLowerCase();
  let score = 0;
  let previousMatchIndex = -1;
  for (const queryCharacter of normalizedQuery) {
    const matchIndex = normalizedValue.indexOf(queryCharacter, previousMatchIndex + 1);
    if (matchIndex === -1) {
      return null;
    }

    score += 100;
    if (matchIndex === previousMatchIndex + 1) {
      score += 25;
    }
    if (isWordStart(normalizedValue, matchIndex)) {
      score += 15;
    }
    score -= matchIndex - previousMatchIndex - 1;
    previousMatchIndex = matchIndex;
  }

  if (normalizedValue === normalizedQuery) {
    score += 1_000;
  } else if (normalizedValue.startsWith(normalizedQuery)) {
    score += 500;
  }
  return score - normalizedValue.length;
}

function isWordStart(value: string, index: number): boolean {
  return index === 0 || /[-_\s/]/.test(value[index - 1] ?? "");
}

function betterScore(left: number | null, right: number | null): number | null {
  if (left == null) {
    return right;
  }
  if (right == null) {
    return left;
  }
  return Math.max(left, right);
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled skill scope: ${String(value)}`);
}
