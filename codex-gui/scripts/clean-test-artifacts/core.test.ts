import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { cleanTestArtifacts, findTestArtifactDirs } from "./core";
import { createTestTempRoots } from "../testTempRoots";

const tempRoots = createTestTempRoots("codex-gui-clean-test-artifacts-");

afterEach(async () => {
  await tempRoots.cleanup();
});

describe("findTestArtifactDirs", () => {
  test("finds screenshots, traces, and vitest attachment directories under the project root", async () => {
    const root = await tempRoots.create();
    await mkdir(path.join(root, "src/__tests__/__screenshots__"), { recursive: true });
    await mkdir(path.join(root, "src/__tests__/__traces__"), { recursive: true });
    await mkdir(path.join(root, "src/features/.vitest-attachments"), { recursive: true });
    await mkdir(path.join(root, "src/__tests__/not-an-artifact"), { recursive: true });

    const directories = await findTestArtifactDirs(root);

    expect(directories).toEqual([
      path.join(root, "src/__tests__/__screenshots__"),
      path.join(root, "src/__tests__/__traces__"),
      path.join(root, "src/features/.vitest-attachments"),
    ]);
  });

  test("skips bulky generated directories while searching", async () => {
    const root = await tempRoots.create();
    await mkdir(path.join(root, "node_modules/pkg/__screenshots__"), { recursive: true });
    await mkdir(path.join(root, "src/__screenshots__"), { recursive: true });

    await expect(findTestArtifactDirs(root)).resolves.toEqual([
      path.join(root, "src/__screenshots__"),
    ]);
  });
});

describe("cleanTestArtifacts", () => {
  test("removes matching artifact directories and reports removed paths", async () => {
    const root = await tempRoots.create();
    const screenshotDir = path.join(root, "src/__tests__/__screenshots__");
    const traceDir = path.join(root, "src/__tests__/__traces__");
    const attachmentDir = path.join(root, ".vitest-attachments");
    const keptDir = path.join(root, "src/__tests__/not-an-artifact");
    await mkdir(screenshotDir, { recursive: true });
    await mkdir(traceDir, { recursive: true });
    await mkdir(attachmentDir, { recursive: true });
    await mkdir(keptDir, { recursive: true });
    await writeFile(path.join(screenshotDir, "actual.png"), "test screenshot");
    await writeFile(path.join(traceDir, "trace.zip"), "test trace");

    const result = await cleanTestArtifacts(root);

    expect(result).toEqual({
      removedCount: 3,
      removedPaths: [attachmentDir, screenshotDir, traceDir],
    });
    await expect(readdir(screenshotDir)).rejects.toThrow("ENOENT");
    await expect(readdir(traceDir)).rejects.toThrow("ENOENT");
    await expect(readdir(attachmentDir)).rejects.toThrow("ENOENT");
    await expect(readdir(keptDir)).resolves.toEqual([]);
  });

  test("succeeds without changes when no artifact directories exist", async () => {
    const root = await tempRoots.create();
    await mkdir(path.join(root, "src/__tests__/not-an-artifact"), { recursive: true });

    await expect(cleanTestArtifacts(root)).resolves.toEqual({
      removedCount: 0,
      removedPaths: [],
    });
  });
});
