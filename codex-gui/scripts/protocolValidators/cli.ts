import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type ArtifactMap = ReadonlyMap<string, string>;

type GeneratedArtifactGroup = {
  outputDirectory: string;
  generate: () => Promise<ArtifactMap>;
};

type WriteFileSystem = {
  rename: typeof rename;
};

type PreparedArtifactGroup = {
  outputDirectory: string;
  stagingDirectory: string;
  backupDirectory: string | null;
  switched: boolean;
};

function validateArtifactNames(artifacts: ArtifactMap): void {
  for (const fileName of artifacts.keys()) {
    if (fileName.length === 0 || path.basename(fileName) !== fileName) {
      throw new Error(`Invalid generated artifact name: ${JSON.stringify(fileName)}`);
    }
  }
}

export async function checkGeneratedArtifacts(
  outputDirectory: string,
  artifacts: ArtifactMap,
): Promise<void> {
  validateArtifactNames(artifacts);

  let actualNames: string[];
  try {
    actualNames = await readdir(outputDirectory);
  } catch (error) {
    throw new Error(`Generated artifacts are missing from ${outputDirectory}`, { cause: error });
  }

  const expectedNames = [...artifacts.keys()].sort();
  actualNames.sort();

  const expectedNameSet = new Set(expectedNames);
  const actualNameSet = new Set(actualNames);
  const missing = expectedNames.filter((fileName) => !actualNameSet.has(fileName));
  const extra = actualNames.filter((fileName) => !expectedNameSet.has(fileName));
  const stale: string[] = [];

  await Promise.all(
    expectedNames
      .filter((fileName) => actualNameSet.has(fileName))
      .map(async (fileName) => {
        const actual = await readFile(path.join(outputDirectory, fileName), "utf8");
        if (actual !== artifacts.get(fileName)) {
          stale.push(fileName);
        }
      }),
  );
  stale.sort();

  if (missing.length > 0 || stale.length > 0 || extra.length > 0) {
    throw new Error(
      [
        missing.length > 0 ? `missing: ${missing.join(", ")}` : null,
        stale.length > 0 ? `stale: ${stale.join(", ")}` : null,
        extra.length > 0 ? `extra: ${extra.join(", ")}` : null,
      ]
        .filter((message): message is string => message !== null)
        .join("; "),
    );
  }
}

export async function writeGeneratedArtifacts(
  outputDirectory: string,
  artifacts: ArtifactMap,
  fileSystem: WriteFileSystem = { rename },
): Promise<void> {
  await writePreparedGeneratedArtifacts(outputDirectory, artifacts, fileSystem);
}

async function prepareGeneratedArtifacts(
  outputDirectory: string,
  artifacts: ArtifactMap,
): Promise<PreparedArtifactGroup> {
  validateArtifactNames(artifacts);

  const parentDirectory = path.dirname(outputDirectory);
  const outputName = path.basename(outputDirectory);
  await mkdir(parentDirectory, { recursive: true });

  const stagingDirectory = await mkdtemp(path.join(parentDirectory, `.${outputName}.staging-`));
  try {
    await Promise.all(
      [...artifacts].map(([fileName, contents]) =>
        writeFile(path.join(stagingDirectory, fileName), contents, "utf8"),
      ),
    );
  } catch (error) {
    await rm(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
  return {
    outputDirectory,
    stagingDirectory,
    backupDirectory: null,
    switched: false,
  };
}

async function rollbackGeneratedArtifactGroups(
  groups: readonly PreparedArtifactGroup[],
  fileSystem: WriteFileSystem,
): Promise<unknown[]> {
  const rollbackErrors: unknown[] = [];
  for (const group of groups.toReversed()) {
    try {
      if (group.switched) {
        await rm(group.outputDirectory, { force: true, recursive: true });
        group.switched = false;
      }
      if (group.backupDirectory !== null) {
        const backupDirectory = group.backupDirectory;
        await fileSystem.rename(backupDirectory, group.outputDirectory);
        group.backupDirectory = null;
      }
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  return rollbackErrors;
}

async function commitGeneratedArtifactGroups(
  groups: readonly PreparedArtifactGroup[],
  fileSystem: WriteFileSystem,
): Promise<void> {
  let switchError: Error | undefined;
  try {
    for (const group of groups) {
      const parentDirectory = path.dirname(group.outputDirectory);
      const outputName = path.basename(group.outputDirectory);
      if (await pathExists(group.outputDirectory)) {
        const backupDirectory = await unusedSiblingPath(parentDirectory, `.${outputName}.backup-`);
        await fileSystem.rename(group.outputDirectory, backupDirectory);
        group.backupDirectory = backupDirectory;
      }
      await fileSystem.rename(group.stagingDirectory, group.outputDirectory);
      group.switched = true;
    }
  } catch (error) {
    switchError = errorObject(error);
  }

  if (switchError !== undefined) {
    const rollbackErrors = await rollbackGeneratedArtifactGroups(groups, fileSystem);
    if (rollbackErrors.length > 0) {
      const remainingBackups = groups
        .map(({ backupDirectory }) => backupDirectory)
        .filter((backupDirectory): backupDirectory is string => backupDirectory !== null);
      const restoreError = rollbackErrors.at(-1);
      throw new AggregateError(
        [switchError, ...rollbackErrors],
        `Failed to restore generated artifacts from ${remainingBackups.join(", ")}: ${rollbackErrors.map(errorMessage).join("; ")}`,
        { cause: restoreError },
      );
    }
    throw switchError;
  }

  for (const group of groups) {
    if (group.backupDirectory !== null) {
      await rm(group.backupDirectory, { recursive: true });
      group.backupDirectory = null;
    }
  }
}

async function cleanupPreparedArtifactGroups(
  groups: readonly PreparedArtifactGroup[],
): Promise<void> {
  await Promise.all(
    groups.map(({ stagingDirectory }) => rm(stagingDirectory, { force: true, recursive: true })),
  );
}

async function prepareAllGeneratedArtifactGroups(
  groups: readonly { outputDirectory: string; artifacts: ArtifactMap }[],
): Promise<PreparedArtifactGroup[]> {
  const prepared: PreparedArtifactGroup[] = [];
  try {
    for (const group of groups) {
      prepared.push(await prepareGeneratedArtifacts(group.outputDirectory, group.artifacts));
    }
    return prepared;
  } catch (error) {
    await cleanupPreparedArtifactGroups(prepared);
    throw error;
  }
}

/*
 * The commit helper intentionally operates only after every output directory has
 * a complete staging tree. This prevents one source group from advancing while
 * another source group is still on an older generated contract generation.
 */
async function commitAllGeneratedArtifactGroups(
  groups: readonly { outputDirectory: string; artifacts: ArtifactMap }[],
  fileSystem: WriteFileSystem,
): Promise<void> {
  const prepared = await prepareAllGeneratedArtifactGroups(groups);
  try {
    await commitGeneratedArtifactGroups(prepared, fileSystem);
  } finally {
    await cleanupPreparedArtifactGroups(prepared);
  }
}

async function writePreparedGeneratedArtifacts(
  outputDirectory: string,
  artifacts: ArtifactMap,
  fileSystem: WriteFileSystem,
): Promise<void> {
  const prepared = await prepareGeneratedArtifacts(outputDirectory, artifacts);
  try {
    await commitGeneratedArtifactGroups([prepared], fileSystem);
  } finally {
    await cleanupPreparedArtifactGroups([prepared]);
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function unusedSiblingPath(parentDirectory: string, prefix: string): Promise<string> {
  const temporaryDirectory = await mkdtemp(path.join(parentDirectory, prefix));
  await rm(temporaryDirectory, { recursive: true });
  return temporaryDirectory;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorObject(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error), { cause: error });
}

type Mode = "check" | "write";

export async function syncGeneratedArtifactGroups(
  mode: Mode,
  groups: readonly GeneratedArtifactGroup[],
  fileSystem: WriteFileSystem = { rename },
): Promise<void> {
  const generatedGroups = await Promise.all(
    groups.map(async ({ outputDirectory, generate }) => ({
      outputDirectory,
      artifacts: await generate(),
    })),
  );
  if (mode === "check") {
    for (const { outputDirectory, artifacts } of generatedGroups) {
      await checkGeneratedArtifacts(outputDirectory, artifacts);
    }
    return;
  }
  await commitAllGeneratedArtifactGroups(generatedGroups, fileSystem);
}

function parseMode(args: readonly string[]): Mode {
  if (args.length !== 1 || (args[0] !== "--check" && args[0] !== "--write")) {
    throw new Error("Usage: protocolValidators/cli.ts --check|--write");
  }
  return args[0].slice(2) as Mode;
}

function requestMethodsFromModule(module: unknown): readonly string[] {
  if (
    typeof module !== "object" ||
    module === null ||
    !("APP_SERVER_REQUEST_METHODS" in module) ||
    !isStringArray(module.APP_SERVER_REQUEST_METHODS)
  ) {
    throw new Error("appServerProtocol must export APP_SERVER_REQUEST_METHODS");
  }
  return module.APP_SERVER_REQUEST_METHODS;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const schemaDirectory = path.resolve(projectRoot, "../codex-rs/app-server-protocol/schema/json");
  const guiHostSchemaDirectory = path.resolve(projectRoot, "../codex-rs/gui-host/schema/json");

  const appServerProtocolModulePath = "../../src/features/guiHost/appServerProtocol";
  const {
    generateGuiHostContractArtifacts,
    generateProtocolArtifacts,
    loadGuiHostContractInputs,
    loadProtocolInputs,
  } = await import("./core");
  const appServerProtocolModule: unknown = await import(appServerProtocolModulePath);
  const appServerInputs = await loadProtocolInputs({
    requestDefinitionsPath: path.join(schemaDirectory, "client-request-definitions.json"),
    schemaBundlePath: path.join(schemaDirectory, "codex_app_server_protocol.schemas.json"),
  });
  const guiHostInputs = await loadGuiHostContractInputs({
    paramsSchemaPath: path.join(guiHostSchemaDirectory, "GuiAuthenticateParams.json"),
    resultSchemaPath: path.join(guiHostSchemaDirectory, "GuiAuthenticateResult.json"),
  });
  await syncGeneratedArtifactGroups(mode, [
    {
      outputDirectory: path.join(projectRoot, "src/generated/appServerProtocol"),
      generate: async () =>
        new Map(
          Object.entries(
            await generateProtocolArtifacts({
              ...appServerInputs,
              selectedMethods: requestMethodsFromModule(appServerProtocolModule),
            }),
          ),
        ),
    },
    {
      outputDirectory: path.join(projectRoot, "src/generated/guiHostContract"),
      generate: async () =>
        new Map(Object.entries(await generateGuiHostContractArtifacts(guiHostInputs))),
    },
  ]);
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
