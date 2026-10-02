import { execFile, spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createWriteStream } from "node:fs";
import { promisify } from "node:util";
import { finished } from "node:stream/promises";

const inspectProcesses = promisify(execFile);

export type Command = {
  command: string;
  args: string[];
};

export function ownedProcess(
  command: Command,
  env: NodeJS.ProcessEnv,
  ipc = false,
  logPath?: string,
) {
  const child = spawn(command.command, command.args, {
    env,
    detached: true,
    stdio: ipc ? ["inherit", "pipe", "pipe", "ipc"] : ["inherit", "pipe", "pipe"],
  });
  const log = logPath ? createWriteStream(logPath) : undefined;
  const logFinished = log ? finished(log) : Promise.resolve();
  void logFinished.catch(() => {
    /* The lifecycle promise reports write failures. */
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    log?.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    log?.write(chunk);
  });
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      log?.end();
      void logFinished.then(() => {
        resolve(code ?? (signal ? 1 : 0));
      }, reject);
    });
  });
  // A startup error can occur before the caller begins waiting for exit.
  void exited.catch(() => {
    /* The caller receives the original rejection. */
  });
  return { child, exited };
}

export async function stopOwnedProcess(child: ChildProcess) {
  if (!child.pid) return;
  const groupId = child.pid;
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-groupId, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  signalGroup("SIGTERM");
  // Group membership is created by us; never discover or kill processes by port.
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      process.kill(-child.pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        // macOS can report EPERM for an orphaned group with no live members.
        // Confirm that condition rather than treating a permission error as success.
        const { stdout } = await inspectProcesses("ps", ["-axo", "pgid=,stat="]);
        const liveMembers = stdout.split("\n").some((line) => {
          const [group, state] = line.trim().split(/\s+/);
          return Number(group) === child.pid && state && !state.startsWith("Z");
        });
        if (!liveMembers) return;
        await delay(50);
        continue;
      }
      throw error;
    }
    await delay(50);
  }
  signalGroup("SIGKILL");
}
