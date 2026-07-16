import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename as renamePath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { checkGeneratedArtifacts, writeGeneratedArtifacts } from "./cli";

const tempRoots: string[] = [];

async function makeOutputDirectory(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-gui-protocol-validators-"));
  tempRoots.push(root);

  const outputDirectory = path.join(root, "generated");
  await mkdir(outputDirectory);
  return outputDirectory;
}

async function readDirectory(outputDirectory: string): Promise<Record<string, string>> {
  const fileNames = (await readdir(outputDirectory)).sort();
  const files: Record<string, string> = {};
  await Promise.all(
    fileNames.map(async (fileName) => {
      files[fileName] = await readFile(path.join(outputDirectory, fileName), "utf8");
    }),
  );
  return files;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("checkGeneratedArtifacts", () => {
  test.each([
    ["missing", new Map([["expected.ts", "current\n"]]), {}, "missing: expected.ts"],
    [
      "stale",
      new Map([["expected.ts", "current\n"]]),
      { "expected.ts": "stale\n" },
      "stale: expected.ts",
    ],
    [
      "extra",
      new Map([["expected.ts", "current\n"]]),
      { "expected.ts": "current\n", "extra.ts": "extra\n" },
      "extra: extra.ts",
    ],
  ])(
    "fails for %s artifacts without writing",
    async (_kind, artifacts, existingFiles, expectedMessage) => {
      const outputDirectory = await makeOutputDirectory();
      await Promise.all(
        Object.entries(existingFiles).map(([fileName, contents]) =>
          writeFile(path.join(outputDirectory, fileName), contents),
        ),
      );
      const before = await readDirectory(outputDirectory);

      await expect(checkGeneratedArtifacts(outputDirectory, artifacts)).rejects.toThrow(
        expectedMessage,
      );

      await expect(readDirectory(outputDirectory)).resolves.toEqual(before);
    },
  );
});

describe("writeGeneratedArtifacts", () => {
  test("atomically replaces the artifact set and removes stale files", async () => {
    const outputDirectory = await makeOutputDirectory();
    await writeFile(path.join(outputDirectory, "stale.ts"), "remove me\n");
    await writeFile(path.join(outputDirectory, "validatorRegistry.ts"), "old registry\n");

    await writeGeneratedArtifacts(
      outputDirectory,
      new Map([
        ["standaloneValidators.js", "export const validate = true;\n"],
        ["validatorRegistry.ts", "export const registry = {};\n"],
      ]),
    );

    await expect(readDirectory(outputDirectory)).resolves.toEqual({
      "standaloneValidators.js": "export const validate = true;\n",
      "validatorRegistry.ts": "export const registry = {};\n",
    });
  });

  test("preserves the previous artifact set when staging the replacement fails", async () => {
    const outputDirectory = await makeOutputDirectory();
    await writeFile(path.join(outputDirectory, "validatorRegistry.ts"), "old registry\n");
    const before = await readDirectory(outputDirectory);

    await expect(
      writeGeneratedArtifacts(
        outputDirectory,
        new Map([
          ["validatorRegistry.ts", "new registry\n"],
          ["invalid\0file.ts", "cannot be staged\n"],
        ]),
      ),
    ).rejects.toThrow("without null bytes");

    await expect(readDirectory(outputDirectory)).resolves.toEqual(before);
  });

  test("reports the backup location when switching and restoring both fail", async () => {
    const outputDirectory = await makeOutputDirectory();
    await writeFile(path.join(outputDirectory, "validatorRegistry.ts"), "old registry\n");
    const switchError = new Error("switch failed");
    const restoreError = new Error("restore failed");
    let backupDirectory = "";
    let renameCalls = 0;
    const renameWithFailures: typeof renamePath = async (from, to) => {
      renameCalls += 1;
      if (renameCalls === 1) {
        backupDirectory = String(to);
        await renamePath(from, to);
        return;
      }
      throw renameCalls === 2 ? switchError : restoreError;
    };

    let thrown: unknown;
    try {
      await writeGeneratedArtifacts(
        outputDirectory,
        new Map([["validatorRegistry.ts", "new registry\n"]]),
        { rename: renameWithFailures },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    if (!(thrown instanceof AggregateError)) {
      throw new Error("Expected writeGeneratedArtifacts to throw an AggregateError");
    }
    expect(thrown.errors).toEqual([switchError, restoreError]);
    expect(thrown.cause).toBe(restoreError);
    expect(thrown.message).toContain(backupDirectory);
    expect(thrown.message).toContain(restoreError.message);
    await expect(readDirectory(backupDirectory)).resolves.toEqual({
      "validatorRegistry.ts": "old registry\n",
    });
  });
});
