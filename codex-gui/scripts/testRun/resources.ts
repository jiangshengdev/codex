import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { localNetworkEnvironment } from "./network.ts";

export type RunContext = {
  id: string;
  directory: string;
  cacheDirectory: string;
  artifactsDirectory: string;
  port: number;
  origin: string;
};

async function candidatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing TCP address");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    }),
  );
  return port === 6007 ? candidatePort() : port;
}

export async function createRunContext(name: string): Promise<RunContext> {
  // Vitest incorporates the trace path relative to the project into attachment
  // filenames. Keep that prefix short, independent of the checkout's location.
  const reportsDirectory = path.resolve(".reports");
  await mkdir(reportsDirectory, { recursive: true });
  const directory = await mkdtemp(path.join(reportsDirectory, "run-"));
  const cacheDirectory = path.join(directory, "cache");
  const artifactsDirectory = path.join(directory, "artifacts");
  await Promise.all([mkdir(cacheDirectory), mkdir(artifactsDirectory)]);
  const port = await candidatePort();
  const context = {
    id: path.basename(directory),
    directory,
    cacheDirectory,
    artifactsDirectory,
    port,
    origin: `http://127.0.0.1:${String(port)}`,
  };
  await writeFile(path.join(directory, "run.json"), JSON.stringify({ ...context, name }, null, 2));
  return context;
}

export function runEnvironment(
  context: RunContext,
  additions: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return localNetworkEnvironment({
    ...process.env,
    ...additions,
    CODEX_GUI_TEST_RUN_DIR: context.directory,
    CODEX_GUI_TEST_PORT: String(context.port),
    CACHE_DIR: context.cacheDirectory,
    CODEX_GUI_VITE_PORT: String(context.port),
    CODEX_GUI_VITE_HMR_PORT: String(context.port),
    PLAYWRIGHT_HTML_OPEN: "never",
  });
}

export function currentRunContext(): RunContext {
  const directory = process.env.CODEX_GUI_TEST_RUN_DIR;
  const port = Number(process.env.CODEX_GUI_TEST_PORT);
  if (!directory || !Number.isInteger(port) || port < 1 || port > 65535 || port === 6007) {
    throw new Error("Use the repository test script to initialize an isolated test run");
  }
  return {
    id: path.basename(directory),
    directory,
    cacheDirectory: path.join(directory, "cache"),
    artifactsDirectory: path.join(directory, "artifacts"),
    port,
    origin: `http://127.0.0.1:${String(port)}`,
  };
}
