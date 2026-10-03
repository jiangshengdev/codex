import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { expect, test, vi } from "vitest";
import { runIsolated } from "./run.ts";

const service = {
  command: process.execPath,
  args: [
    "-e",
    `const http=require('node:http');const server=http.createServer((req,res)=>res.end(process.env.CODEX_GUI_TEST_RUN_DIR));server.listen(Number(process.env.CODEX_GUI_TEST_PORT),'127.0.0.1',()=>process.send({ready:true}));`,
  ],
};
const client = {
  command: process.execPath,
  args: [
    "-e",
    `const fs=require('node:fs');fetch('http://127.0.0.1:'+process.env.CODEX_GUI_TEST_PORT).then(r=>r.text()).then(body=>{if(body!==process.env.CODEX_GUI_TEST_RUN_DIR)process.exit(2);fs.writeFileSync(process.env.CODEX_GUI_TEST_RUN_DIR+'/evidence.txt',body);});`,
  ],
};

test("parallel commands keep their own service and evidence after cleanup", async () => {
  const results = await Promise.all([
    runIsolated({ name: "fixture", service, test: client }),
    runIsolated({ name: "fixture", service, test: client }),
  ]);
  expect(results.map((result) => result.code)).toEqual([0, 0]);
  expect(results[0].context.directory).not.toBe(results[1].context.directory);
  expect(results[0].context.port).not.toBe(results[1].context.port);
  for (const result of results) {
    expect(result.context.port).not.toBe(6007);
    expect(await readFile(`${result.context.directory}/evidence.txt`, "utf8")).toBe(
      result.context.directory,
    );
    await expect(fetch(result.context.origin)).rejects.toThrow("fetch failed");
  }
});

test("a service losing its port does not start tests or connect to the competitor", async () => {
  let competingRequests = 0;
  const competitor = createServer((_request, response) => {
    competingRequests++;
    response.end("competitor survives");
  });
  const coordinator = createServer((request, response) => {
    competitor.listen(Number(request.url?.slice(1)), "127.0.0.1", () => {
      response.end("occupied");
    });
  });
  await new Promise<void>((resolve) => coordinator.listen(0, "127.0.0.1", resolve));
  const coordinatorAddress = coordinator.address();
  if (!coordinatorAddress || typeof coordinatorAddress === "string")
    throw new Error("Missing coordinator address");
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const result = await runIsolated({
      name: "race",
      service: {
        command: process.execPath,
        args: [
          "-e",
          `fetch('http://127.0.0.1:${String(coordinatorAddress.port)}/'+process.env.CODEX_GUI_TEST_PORT).then(()=>{const own=require('node:net').createServer();own.on('error',()=>process.exit(3));own.listen(Number(process.env.CODEX_GUI_TEST_PORT),'127.0.0.1');});`,
        ],
      },
      test: client,
    });
    expect(result.code).toBe(1);
    expect(errorLog).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    expect(errorLog.mock.calls[0]?.[0]).toHaveProperty(
      "message",
      "Server exited before readiness (3)",
    );
    expect(competingRequests).toBe(0);
    expect(await (await fetch(result.context.origin)).text()).toBe("competitor survives");
    await expect(readFile(`${result.context.directory}/evidence.txt`, "utf8")).rejects.toThrow(
      "ENOENT",
    );
    expect(await readFile(`${result.context.directory}/result.json`, "utf8")).toContain(
      "Server exited before readiness (3)",
    );
  } finally {
    errorLog.mockRestore();
    await new Promise<void>((resolve) =>
      competitor.close(() => {
        resolve();
      }),
    );
    await new Promise<void>((resolve) =>
      coordinator.close(() => {
        resolve();
      }),
    );
  }
});

test("failed tests preserve evidence and stop their service", async () => {
  const result = await runIsolated({
    name: "failed",
    service,
    test: {
      command: process.execPath,
      args: [
        "-e",
        `require('node:fs').writeFileSync(process.env.CODEX_GUI_TEST_RUN_DIR+'/failure.txt','failure evidence');process.stdout.write('retained log marker',()=>process.exit(7));`,
      ],
    },
  });
  expect(result.code).toBe(7);
  expect(await readFile(`${result.context.directory}/failure.txt`, "utf8")).toBe(
    "failure evidence",
  );
  expect(await readFile(`${result.context.artifactsDirectory}/tests.log`, "utf8")).toBe(
    "retained log marker",
  );
  await expect(fetch(result.context.origin)).rejects.toThrow("fetch failed");
});

test("cancelling startup stops only the owned service and retains its result", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const controller = new AbortController();
  const running = runIsolated({
    name: "cancel",
    service: { command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"] },
    test: client,
    signal: controller.signal,
  });
  const timer = setTimeout(() => {
    controller.abort();
  }, 200);
  try {
    const result = await running;
    expect(result.code).toBe(1);
    expect(errorLog).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    expect(errorLog.mock.calls[0]?.[0]).toHaveProperty("message", "Test run cancelled");
    expect(await readFile(`${result.context.directory}/result.json`, "utf8")).toContain(
      "Test run cancelled",
    );
  } finally {
    clearTimeout(timer);
    errorLog.mockRestore();
  }
});

test("the user's service at 6007 remains reachable through a failed isolated run", async () => {
  const userServer = createServer((_request, response) => response.end("user-service"));
  let ownsProtectionFixture = false;
  try {
    await new Promise<void>((resolve, reject) => {
      userServer.once("error", reject);
      userServer.listen(6007, "127.0.0.1", resolve);
    });
    ownsProtectionFixture = true;
  } catch (error) {
    // An existing user service is observed, never replaced or stopped.
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
  }
  try {
    const initialStatus = (await fetch("http://127.0.0.1:6007")).status;
    const result = await runIsolated({
      name: "protected",
      service,
      env: { CODEX_GUI_PROTECTION_STATUS: String(initialStatus) },
      test: {
        command: process.execPath,
        args: [
          "-e",
          `fetch('http://127.0.0.1:6007').then(r=>{if(String(r.status)!==process.env.CODEX_GUI_PROTECTION_STATUS)process.exit(9);process.exit(7);});`,
        ],
      },
    });
    expect(result.code).toBe(7);
    expect(result.context.port).not.toBe(6007);
    expect((await fetch("http://127.0.0.1:6007")).status).toBe(initialStatus);
  } finally {
    if (ownsProtectionFixture) {
      await new Promise<void>((resolve, reject) =>
        userServer.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
    }
  }
});
