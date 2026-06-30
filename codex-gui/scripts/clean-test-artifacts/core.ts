import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const ARTIFACT_DIR_NAMES = new Set(["__screenshots__", ".vitest-attachments"]);
const SKIPPED_DIR_NAMES = new Set([
  ".git",
  ".heroui-docs",
  ".redux-toolkit-docs",
  ".reports",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

export type CleanTestArtifactsResult = {
  removedCount: number;
  removedPaths: string[];
};

export async function findTestArtifactDirs(projectRoot: string): Promise<string[]> {
  const root = path.resolve(projectRoot);
  const artifactDirs: string[] = [];

  await collectArtifactDirs(root, artifactDirs);

  return artifactDirs.sort((left, right) => left.localeCompare(right));
}

export async function cleanTestArtifacts(projectRoot: string): Promise<CleanTestArtifactsResult> {
  const removedPaths = await findTestArtifactDirs(projectRoot);

  await Promise.all(
    removedPaths.map((artifactDir) => rm(artifactDir, { force: true, recursive: true })),
  );

  return {
    removedCount: removedPaths.length,
    removedPaths,
  };
}

async function collectArtifactDirs(directory: string, artifactDirs: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const childPath = path.join(directory, entry.name);
    if (ARTIFACT_DIR_NAMES.has(entry.name)) {
      artifactDirs.push(childPath);
      continue;
    }

    if (SKIPPED_DIR_NAMES.has(entry.name)) {
      continue;
    }

    await collectArtifactDirs(childPath, artifactDirs);
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
