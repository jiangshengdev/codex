import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type ArtifactMap = ReadonlyMap<string, string>;

type WriteFileSystem = {
  rename: typeof rename;
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
  validateArtifactNames(artifacts);

  const parentDirectory = path.dirname(outputDirectory);
  const outputName = path.basename(outputDirectory);
  await mkdir(parentDirectory, { recursive: true });

  const stagingDirectory = await mkdtemp(path.join(parentDirectory, `.${outputName}.staging-`));
  let backupDirectory: string | null = null;

  try {
    await Promise.all(
      [...artifacts].map(([fileName, contents]) =>
        writeFile(path.join(stagingDirectory, fileName), contents, "utf8"),
      ),
    );

    if (await pathExists(outputDirectory)) {
      backupDirectory = await unusedSiblingPath(parentDirectory, `.${outputName}.backup-`);
      await fileSystem.rename(outputDirectory, backupDirectory);
    }

    try {
      await fileSystem.rename(stagingDirectory, outputDirectory);
    } catch (switchError) {
      if (backupDirectory !== null) {
        const backupPath = backupDirectory;
        try {
          await fileSystem.rename(backupPath, outputDirectory);
          backupDirectory = null;
        } catch (restoreError) {
          throw new AggregateError(
            [switchError, restoreError],
            `Failed to restore generated artifacts from ${backupPath}: ${errorMessage(restoreError)}`,
            { cause: restoreError },
          );
        }
      }
      throw switchError;
    }

    if (backupDirectory !== null) {
      await rm(backupDirectory, { recursive: true });
      backupDirectory = null;
    }
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true });
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

type Mode = "check" | "write";

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
  const outputDirectory = path.join(projectRoot, "src/generated/appServerProtocol");

  const appServerProtocolModulePath = "../../src/features/guiHost/appServerProtocol";
  const { generateProtocolArtifacts, loadProtocolInputs } = await import("./core");
  const appServerProtocolModule: unknown = await import(appServerProtocolModulePath);
  const inputs = await loadProtocolInputs({
    requestDefinitionsPath: path.join(schemaDirectory, "client-request-definitions.json"),
    schemaBundlePath: path.join(schemaDirectory, "codex_app_server_protocol.schemas.json"),
  });
  const generated = await generateProtocolArtifacts({
    ...inputs,
    selectedMethods: requestMethodsFromModule(appServerProtocolModule),
  });
  const artifacts = new Map(Object.entries(generated));

  if (mode === "check") {
    await checkGeneratedArtifacts(outputDirectory, artifacts);
  } else {
    await writeGeneratedArtifacts(outputDirectory, artifacts);
  }
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
