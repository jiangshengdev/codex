import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { cleanTestArtifacts, findTestArtifactDirs } from "./core";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-gui-clean-test-artifacts-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("findTestArtifactDirs", () => {
  test("finds screenshots and vitest attachment directories under the project root", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "src/__tests__/__screenshots__"), { recursive: true });
    await mkdir(path.join(root, "src/features/.vitest-attachments"), { recursive: true });
    await mkdir(path.join(root, "src/__tests__/not-an-artifact"), { recursive: true });

    const directories = await findTestArtifactDirs(root);

    expect(directories).toEqual([
      path.join(root, "src/__tests__/__screenshots__"),
      path.join(root, "src/features/.vitest-attachments"),
    ]);
  });

  test("skips bulky generated directories while searching", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "node_modules/pkg/__screenshots__"), { recursive: true });
    await mkdir(path.join(root, "src/__screenshots__"), { recursive: true });

    await expect(findTestArtifactDirs(root)).resolves.toEqual([
      path.join(root, "src/__screenshots__"),
    ]);
  });
});

describe("cleanTestArtifacts", () => {
  test("removes matching artifact directories and reports removed paths", async () => {
    const root = await makeTempRoot();
    const screenshotDir = path.join(root, "src/__tests__/__screenshots__");
    const attachmentDir = path.join(root, ".vitest-attachments");
    const keptDir = path.join(root, "src/__tests__/not-an-artifact");
    await mkdir(screenshotDir, { recursive: true });
    await mkdir(attachmentDir, { recursive: true });
    await mkdir(keptDir, { recursive: true });
    await writeFile(path.join(screenshotDir, "actual.png"), "test screenshot");

    const result = await cleanTestArtifacts(root);

    expect(result).toEqual({
      removedCount: 2,
      removedPaths: [attachmentDir, screenshotDir],
    });
    await expect(readdir(screenshotDir)).rejects.toThrow("ENOENT");
    await expect(readdir(attachmentDir)).rejects.toThrow("ENOENT");
    await expect(readdir(keptDir)).resolves.toEqual([]);
  });

  test("succeeds without changes when no artifact directories exist", async () => {
    const root = await makeTempRoot();
    await mkdir(path.join(root, "src/__tests__/not-an-artifact"), { recursive: true });

    await expect(cleanTestArtifacts(root)).resolves.toEqual({
      removedCount: 0,
      removedPaths: [],
    });
  });
});
