import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createRunContext, runEnvironment } from "./resources.ts";
import { ownedProcess, stopOwnedProcess, type Command } from "./process.ts";

export async function runIsolated(options: {
  name: string;
  service?: Command;
  test: Command;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}) {
  const context = await createRunContext(options.name);
  const env = runEnvironment(context, options.env);
  const processes: ReturnType<typeof ownedProcess>[] = [];
  let abortListener: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abortListener = () => {
      reject(new Error("Test run cancelled"));
    };
    options.signal?.addEventListener("abort", abortListener, { once: true });
  });
  void cancelled.catch(() => {
    /* The active lifecycle race handles cancellation. */
  });
  console.log(
    `[test-run] ${context.id}\nAddress: ${context.origin}\nArtifacts: ${context.artifactsDirectory}`,
  );
  let code = 1;
  let failure: unknown;
  try {
    if (options.signal?.aborted) throw new Error("Test run cancelled");
    let server: ReturnType<typeof ownedProcess> | undefined;
    if (options.service) {
      server = ownedProcess(
        options.service,
        env,
        true,
        path.join(context.artifactsDirectory, "server.log"),
      );
      processes.push(server);
      const serviceChild = server.child;
      const ready = new Promise<void>((resolve) => {
        serviceChild.on("message", (message) => {
          if (
            message &&
            typeof message === "object" &&
            "ready" in message &&
            message.ready === true
          )
            resolve();
        });
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          ready,
          server.exited.then((status) => {
            throw new Error(`Server exited before readiness (${String(status)})`);
          }),
          cancelled,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              reject(new Error("Server startup timed out"));
            }, 120_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    const tests = ownedProcess(
      options.test,
      env,
      false,
      path.join(context.artifactsDirectory, "tests.log"),
    );
    processes.push(tests);
    code = await Promise.race([
      tests.exited,
      cancelled,
      ...(server
        ? [
            server.exited.then((status) => {
              throw new Error(`Server exited during tests (${String(status)})`);
            }),
          ]
        : []),
    ]);
  } catch (error) {
    failure = error;
    console.error(error);
  } finally {
    if (abortListener) options.signal?.removeEventListener("abort", abortListener);
    const cleanup = await Promise.allSettled(
      processes.map(async ({ child, exited }) => {
        await stopOwnedProcess(child);
        await exited;
      }),
    );
    const cleanupFailures = cleanup.filter((result) => result.status === "rejected");
    if (cleanupFailures.length) {
      code = 1;
      failure = new AggregateError(
        cleanupFailures.map((result): unknown => result.reason),
        "Owned process cleanup failed",
      );
      console.error(failure);
    }
    await writeFile(
      path.join(context.directory, "result.json"),
      JSON.stringify(
        { code, error: failure instanceof Error ? failure.message : failure },
        null,
        2,
      ),
    );
    console.log(`[test-run] Evidence retained: ${context.directory}`);
  }
  return { context, code };
}
