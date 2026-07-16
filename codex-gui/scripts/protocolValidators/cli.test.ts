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

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  checkGeneratedArtifacts,
  syncGeneratedArtifactGroups,
  writeGeneratedArtifacts,
} from "./cli";

const tempRoots: string[] = [];
type GenerateArtifacts = () => Promise<ReadonlyMap<string, string>>;

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

describe("syncGeneratedArtifactGroups", () => {
  test("writes and checks app-server and GUI Host output directories together", async () => {
    const appServerDirectory = await makeOutputDirectory();
    const guiHostDirectory = await makeOutputDirectory();
    const groups = [
      {
        outputDirectory: appServerDirectory,
        generate: () => Promise.resolve(new Map([["index.ts", "app-server\n"]])),
      },
      {
        outputDirectory: guiHostDirectory,
        generate: () => Promise.resolve(new Map([["index.ts", "gui-host\n"]])),
      },
    ];

    await syncGeneratedArtifactGroups("write", groups);

    await expect(readDirectory(appServerDirectory)).resolves.toEqual({
      "index.ts": "app-server\n",
    });
    await expect(readDirectory(guiHostDirectory)).resolves.toEqual({
      "index.ts": "gui-host\n",
    });
    await expect(syncGeneratedArtifactGroups("check", groups)).resolves.toBeUndefined();

    await writeFile(path.join(guiHostDirectory, "index.ts"), "stale\n");
    const appServerBefore = await readDirectory(appServerDirectory);
    const guiHostBefore = await readDirectory(guiHostDirectory);
    await expect(syncGeneratedArtifactGroups("check", groups)).rejects.toThrow("stale: index.ts");
    await expect(readDirectory(appServerDirectory)).resolves.toEqual(appServerBefore);
    await expect(readDirectory(guiHostDirectory)).resolves.toEqual(guiHostBefore);
  });

  test("generates every source group before writing either output directory", async () => {
    const appServerDirectory = await makeOutputDirectory();
    const guiHostDirectory = await makeOutputDirectory();
    await writeFile(path.join(appServerDirectory, "index.ts"), "old app-server\n");
    await writeFile(path.join(guiHostDirectory, "index.ts"), "old gui-host\n");
    const appServerBefore = await readDirectory(appServerDirectory);
    const guiHostBefore = await readDirectory(guiHostDirectory);
    const firstGenerate = vi.fn<GenerateArtifacts>(() =>
      Promise.resolve(new Map([["index.ts", "new app-server\n"]])),
    );
    const generationError = new Error("GUI Host schema generation failed");
    const secondGenerate = vi.fn<GenerateArtifacts>(() => Promise.reject(generationError));

    await expect(
      syncGeneratedArtifactGroups("write", [
        { outputDirectory: appServerDirectory, generate: firstGenerate },
        { outputDirectory: guiHostDirectory, generate: secondGenerate },
      ]),
    ).rejects.toBe(generationError);

    expect(firstGenerate).toHaveBeenCalledOnce();
    expect(secondGenerate).toHaveBeenCalledOnce();
    await expect(readDirectory(appServerDirectory)).resolves.toEqual(appServerBefore);
    await expect(readDirectory(guiHostDirectory)).resolves.toEqual(guiHostBefore);
  });

  test("rolls back both directories when the second group switch fails", async () => {
    const appServerDirectory = await makeOutputDirectory();
    const guiHostDirectory = await makeOutputDirectory();
    await writeFile(path.join(appServerDirectory, "index.ts"), "old app-server\n");
    await writeFile(path.join(guiHostDirectory, "index.ts"), "old gui-host\n");
    const appServerBefore = await readDirectory(appServerDirectory);
    const guiHostBefore = await readDirectory(guiHostDirectory);
    const switchError = new Error("second group switch failed");
    const renameWithSecondSwitchFailure: typeof renamePath = async (from, to) => {
      if (
        String(to) === guiHostDirectory &&
        path.basename(String(from)).startsWith(".generated.staging-")
      ) {
        throw switchError;
      }
      await renamePath(from, to);
    };

    await expect(
      syncGeneratedArtifactGroups(
        "write",
        [
          {
            outputDirectory: appServerDirectory,
            generate: () => Promise.resolve(new Map([["index.ts", "new app-server\n"]])),
          },
          {
            outputDirectory: guiHostDirectory,
            generate: () => Promise.resolve(new Map([["index.ts", "new gui-host\n"]])),
          },
        ],
        { rename: renameWithSecondSwitchFailure },
      ),
    ).rejects.toBe(switchError);

    await expect(readDirectory(appServerDirectory)).resolves.toEqual(appServerBefore);
    await expect(readDirectory(guiHostDirectory)).resolves.toEqual(guiHostBefore);
    await expect(readdir(path.dirname(appServerDirectory))).resolves.toEqual(["generated"]);
    await expect(readdir(path.dirname(guiHostDirectory))).resolves.toEqual(["generated"]);
  });
});
