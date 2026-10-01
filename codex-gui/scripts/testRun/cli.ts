import { runIsolated } from "./run.ts";

const [mode, ...args] = process.argv.slice(2);
if (mode !== "storybook") throw new Error(`Unsupported test mode: ${mode}`);
const controller = new AbortController();
const cancel = () => {
  controller.abort();
};
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);
try {
  const result = await runIsolated({
    name: mode,
    service: {
      command: process.execPath,
      args: ["--import", "tsx", "scripts/testRun/storybookServer.ts"],
    },
    test: {
      command: "pnpm",
      args: ["exec", "playwright", "test", "--config=playwright.storybook.config.ts", ...args],
    },
    signal: controller.signal,
  });
  process.exitCode = controller.signal.aborted ? 130 : result.code;
} finally {
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
}
